/*
 * NexusCord Installer - standalone Windows GUI installer.
 *
 * Runs as a Node.js Single Executable Application (dist/NexusCord-Installer.exe)
 * with the compiled mod payload embedded as SEA assets. The UI is
 * installer-ui.html served on 127.0.0.1 (random port + random token) and shown in:
 *   1. a frameless 520x380 WebView2 window hosted by PowerShell/WinForms
 *   2. fallback: Microsoft Edge (or Chrome) "--app" window
 *   3. last resort: the default browser
 *
 * CLI mode (no GUI):  installer --cli <install|repair|uninstall|status> [--branch stable|ptb|canary|all] [--relaunch]
 */
import { execFile, spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { tmpdir } from "os";
import { join } from "path";
import UI_HTML from "./installer-ui.html";

declare const NEXUSCORD_VERSION: string;

// ---------------------------------------------------------------------------
// Logging (a GUI-subsystem exe has no usable stdout, so everything goes to a file)
// ---------------------------------------------------------------------------
const LOG_FILE = join(tmpdir(), "NexusCord-Installer.log");
const isCli = process.argv.includes("--cli");

function log(...args: unknown[]) {
    const line = `[${new Date().toISOString()}] ${args.map(a => (a instanceof Error ? a.stack : typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
    try {
        appendFileSync(LOG_FILE, line + "\n");
    } catch { /* ignore */ }
    if (isCli) {
        try {
            process.stdout.write(line + "\n");
        } catch { /* no console */ }
    }
}

process.on("uncaughtException", e => log("UNCAUGHT", e));
process.on("unhandledRejection", e => log("UNHANDLED", e));

// ---------------------------------------------------------------------------
// Embedded payload
// ---------------------------------------------------------------------------
let sea: { isSea(): boolean; getAsset(key: string, encoding?: string): string | ArrayBuffer } | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sea = require("node:sea");
    if (!sea!.isSea()) sea = null;
} catch {
    sea = null;
}

const PAYLOAD_FILES = ["injector.js", "preload.js", "renderer.js"] as const;

function readAsset(name: string): Buffer {
    if (sea) return Buffer.from(sea.getAsset(name) as ArrayBuffer);
    // Dev mode: dist/installer/installer.cjs -> dist/<name> or installer/<name>
    for (const p of [join(__dirname, "..", name), join(__dirname, name), join(__dirname, "..", "..", "installer", name)]) {
        if (existsSync(p)) return readFileSync(p);
    }
    throw new Error(`Payload file missing: ${name} (run "npm run build" first)`);
}

function hasAsset(name: string): boolean {
    try {
        readAsset(name);
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Discord detection
// ---------------------------------------------------------------------------
type BranchId = "stable" | "ptb" | "canary";
const BRANCHES: { id: BranchId; folder: string; exe: string; label: string; pkgName: string }[] = [
    { id: "stable", folder: "Discord", exe: "Discord.exe", label: "Discord", pkgName: "discord" },
    { id: "ptb", folder: "DiscordPTB", exe: "DiscordPTB.exe", label: "Discord PTB", pkgName: "discordptb" },
    { id: "canary", folder: "DiscordCanary", exe: "DiscordCanary.exe", label: "Discord Canary", pkgName: "discordcanary" }
];

const LOCALAPPDATA = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || process.env.HOME || "", "AppData", "Local");
const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE || process.env.HOME || "", "AppData", "Roaming");
const DATA_DIR = process.env.NEXUSCORD_DATA_DIR || join(APPDATA, "NexusCord");
const PAYLOAD_DIR = join(DATA_DIR, "dist");
const SHIM_MARKER = "NexusCord shim";

interface BranchState {
    id: BranchId;
    label: string;
    found: boolean;
    root: string;
    version: string | null;
    installed: boolean;
    patchedVersions: number;
    totalVersions: number;
    foreignMod: boolean;
    running: boolean;
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

function appDirs(root: string): { dir: string; version: string }[] {
    if (!existsSync(root)) return [];
    return readdirSync(root)
        .map(d => ({ d, m: /^app-(\d+(?:\.\d+)+)$/.exec(d) }))
        .filter(x => x.m && existsSync(join(root, x.d, "resources")))
        .map(x => ({ dir: join(root, x.d), version: x.m![1] }))
        .sort((a, b) => compareVersions(b.version, a.version));
}

/*
 * Layout (same technique as Vencord - required because Discord's Electron only loads
 * `app.asar`, ignoring a `resources/app` folder):
 *   resources/_app.asar          <- Discord's original archive (renamed)
 *   resources/app.asar/          <- folder: index.js + package.json (NexusCord loader)
 */
const isDir = (p: string) => {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
};

function readShim(dir: string): "ours" | "foreign" | "none" {
    const idx = join(dir, "index.js");
    if (!existsSync(idx)) return existsSync(dir) ? "foreign" : "none";
    try {
        return readFileSync(idx, "utf8").includes(SHIM_MARKER) ? "ours" : "foreign";
    } catch {
        return "foreign";
    }
}

/** "ours" = current layout installed; "legacy" = old v1/v2.0 `resources/app` folder only. */
function shimState(resources: string): "ours" | "legacy" | "foreign" | "none" {
    const asar = join(resources, "app.asar");
    if (isDir(asar)) return readShim(asar);
    const legacy = readShim(join(resources, "app"));
    return legacy === "ours" ? "legacy" : legacy;
}

let runningCache: Set<string> = new Set();

function listRunning(): Promise<Set<string>> {
    if (process.platform !== "win32") return Promise.resolve(new Set());
    return new Promise(resolve => {
        execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err) return resolve(new Set());
            const names = new Set<string>();
            for (const line of stdout.split(/\r?\n/)) {
                const m = /^"([^"]+)"/.exec(line);
                if (m) names.add(m[1].toLowerCase());
            }
            resolve(names);
        });
    });
}

export async function detect(): Promise<BranchState[]> {
    runningCache = await listRunning();
    return BRANCHES.map(b => {
        const root = join(LOCALAPPDATA, b.folder);
        const dirs = appDirs(root);
        const states = dirs.map(d => shimState(join(d.dir, "resources")));
        return {
            id: b.id,
            label: b.label,
            found: dirs.length > 0,
            root,
            version: dirs[0]?.version ?? null,
            installed: states[0] === "ours",
            patchedVersions: states.filter(s => s === "ours" || s === "legacy").length,
            totalVersions: dirs.length,
            foreignMod: states[0] === "foreign",
            running: runningCache.has(b.exe.toLowerCase())
        };
    });
}

// ---------------------------------------------------------------------------
// Process control
// ---------------------------------------------------------------------------
function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
    return new Promise(resolve => {
        execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
            resolve({ code: err ? ((err as NodeJS.ErrnoException & { code?: number }).code as unknown as number) || 1 : 0, out: `${stdout}${stderr}` });
        });
    });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function killDiscord(b: (typeof BRANCHES)[number]): Promise<boolean> {
    if (process.platform !== "win32") return false;
    const running = await listRunning();
    if (!running.has(b.exe.toLowerCase())) return false;
    log(`Terminating ${b.exe}...`);
    await run("taskkill", ["/F", "/T", "/IM", b.exe]);
    for (let i = 0; i < 25; i++) {
        if (!(await listRunning()).has(b.exe.toLowerCase())) break;
        await sleep(200);
    }
    await sleep(400); // let Windows release file handles
    return true;
}

function relaunchDiscord(b: (typeof BRANCHES)[number]) {
    const root = join(LOCALAPPDATA, b.folder);
    const updater = join(root, "Update.exe");
    const latest = appDirs(root)[0];
    let child: ChildProcess | null = null;
    try {
        if (existsSync(updater)) child = spawn(updater, ["--processStart", b.exe], { detached: true, stdio: "ignore", windowsHide: false });
        else if (latest) child = spawn(join(latest.dir, b.exe), [], { detached: true, stdio: "ignore" });
        child?.unref();
        log(`Relaunched ${b.label}`);
    } catch (e) {
        log("Relaunch failed", e);
    }
}

// ---------------------------------------------------------------------------
// Install / uninstall
// ---------------------------------------------------------------------------
function shimSource(): string {
    const injector = join(PAYLOAD_DIR, "injector.js");
    return [
        `// ${SHIM_MARKER} v${NEXUSCORD_VERSION} - generated by NexusCord-Installer.`,
        "// Delete this folder (or run the installer's Uninstall) to remove NexusCord.",
        `require(${JSON.stringify(injector)});`,
        ""
    ].join("\n");
}

function writePayload() {
    mkdirSync(PAYLOAD_DIR, { recursive: true });
    for (const d of ["themes", "plugins", "cache"]) mkdirSync(join(DATA_DIR, d), { recursive: true });
    for (const f of PAYLOAD_FILES) writeFileSync(join(PAYLOAD_DIR, f), readAsset(f));
    writeFileSync(join(PAYLOAD_DIR, "version.json"), JSON.stringify({ version: NEXUSCORD_VERSION, installedAt: new Date().toISOString() }, null, 2));
    log(`Payload written to ${PAYLOAD_DIR}`);
}

export interface ActionResult {
    ok: boolean;
    messages: string[];
}

/** Applies the loader to one `resources` folder. Returns false if there is no Discord archive. */
function patchResources(resources: string, pkg: string, force: boolean): boolean {
    const asar = join(resources, "app.asar");
    const original = join(resources, "_app.asar");
    if (existsSync(asar) && !isDir(asar)) {
        // Fresh Discord archive: it becomes the original (replacing any stale copy)
        rmSync(original, { force: true });
        renameSync(asar, original);
    } else if (isDir(asar)) {
        const state = readShim(asar);
        if (state === "foreign" && !force) return false;
        rmSync(asar, { recursive: true, force: true });
    }
    if (!existsSync(original)) return false;
    mkdirSync(asar, { recursive: true });
    writeFileSync(join(asar, "index.js"), shimSource());
    writeFileSync(join(asar, "package.json"), pkg);
    // Migrate away from the old (ignored) resources/app loader
    if (readShim(join(resources, "app")) === "ours") rmSync(join(resources, "app"), { recursive: true, force: true });
    return true;
}

function unpatchResources(resources: string): boolean {
    let changed = false;
    const asar = join(resources, "app.asar");
    const original = join(resources, "_app.asar");
    if (isDir(asar) && readShim(asar) === "ours") {
        rmSync(asar, { recursive: true, force: true });
        if (existsSync(original)) renameSync(original, asar);
        changed = true;
    }
    if (readShim(join(resources, "app")) === "ours") {
        rmSync(join(resources, "app"), { recursive: true, force: true });
        changed = true;
    }
    return changed;
}

async function install(branchId: BranchId, opts: { force?: boolean } = {}): Promise<ActionResult> {
    const b = BRANCHES.find(x => x.id === branchId)!;
    const dirs = appDirs(join(LOCALAPPDATA, b.folder));
    if (!dirs.length) return { ok: false, messages: [`${b.label} not found in ${LOCALAPPDATA}`] };

    const latestState = shimState(join(dirs[0].dir, "resources"));
    if (latestState === "foreign" && !opts.force) {
        return { ok: false, messages: [`Another mod already patched ${join(dirs[0].dir, "resources", "app.asar")}. Uninstall it first (or use Repair to replace it).`] };
    }

    const killed = await killDiscord(b);
    writePayload();
    const pkg = JSON.stringify({ name: b.pkgName, main: "index.js", private: true }, null, 2);
    let patched = 0;
    for (const d of dirs) {
        const resources = join(d.dir, "resources");
        if (patchResources(resources, pkg, !!opts.force)) {
            patched++;
            log(`Patched ${resources}`);
        }
    }
    return { ok: patched > 0, messages: [`${b.label} ${dirs[0].version}: patched ${patched} version folder(s)${killed ? " (Discord was closed)" : ""}.`] };
}

async function uninstall(branchId: BranchId): Promise<ActionResult> {
    const b = BRANCHES.find(x => x.id === branchId)!;
    const dirs = appDirs(join(LOCALAPPDATA, b.folder));
    const killed = await killDiscord(b);
    let removed = 0;
    for (const d of dirs) {
        const resources = join(d.dir, "resources");
        if (!unpatchResources(resources)) continue;
        removed++;
        log(`Unpatched ${resources}`);
    }
    // Remove the shared payload only if no branch still uses it (user themes/plugins/settings are kept)
    const stillUsed = BRANCHES.some(other => appDirs(join(LOCALAPPDATA, other.folder)).some(d => ["ours", "legacy"].includes(shimState(join(d.dir, "resources")))));
    if (!stillUsed) rmSync(PAYLOAD_DIR, { recursive: true, force: true });
    return { ok: true, messages: [`${b.label}: removed NexusCord from ${removed} version folder(s)${killed ? " (Discord was closed)" : ""}. Your themes/plugins were kept in ${DATA_DIR}.`] };
}

export async function performAction(action: string, branchId: BranchId, relaunch: boolean): Promise<ActionResult> {
    const b = BRANCHES.find(x => x.id === branchId);
    if (!b) return { ok: false, messages: [`Unknown branch ${branchId}`] };
    log(`Action ${action} on ${branchId} (relaunch=${relaunch})`);
    let res: ActionResult;
    try {
        if (action === "install") res = await install(branchId);
        else if (action === "repair") {
            await uninstall(branchId);
            res = await install(branchId, { force: true });
        } else if (action === "uninstall") res = await uninstall(branchId);
        else return { ok: false, messages: [`Unknown action ${action}`] };
    } catch (e) {
        log(e);
        const err = e as NodeJS.ErrnoException;
        const hint = err.code === "EPERM" || err.code === "EBUSY" ? " - a file is locked; make sure Discord is fully closed and try again." : "";
        return { ok: false, messages: [`${err.message}${hint}`] };
    }
    if (res.ok && relaunch) relaunchDiscord(b);
    return res;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function cli(): Promise<number> {
    const args = process.argv.slice(process.argv.indexOf("--cli") + 1);
    const action = args.find(a => !a.startsWith("--")) ?? "status";
    const bIdx = args.indexOf("--branch");
    const branchArg = bIdx !== -1 ? args[bIdx + 1] : "auto";
    const states = await detect();
    if (action === "status") {
        for (const s of states) log(`${s.label.padEnd(15)} ${s.found ? `v${s.version}` : "not found"}  ${s.installed ? "NexusCord installed" : "not installed"}${s.running ? " (running)" : ""}`);
        return 0;
    }
    const targets: BranchId[] =
        branchArg === "all" ? states.filter(s => s.found).map(s => s.id) : branchArg === "auto" ? states.filter(s => s.found).slice(0, 1).map(s => s.id) : [branchArg as BranchId];
    if (!targets.length) {
        log("No Discord installation found.");
        return 1;
    }
    let ok = true;
    for (const id of targets) {
        const r = await performAction(action, id, args.includes("--relaunch"));
        r.messages.forEach(m => log(m));
        ok &&= r.ok;
    }
    return ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// GUI server
// ---------------------------------------------------------------------------
const TOKEN = randomBytes(24).toString("hex");
let lastHeartbeat = Date.now();
let pageLoaded = false;
let hostMode: "webview2" | "edge" | "browser" = "browser";

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": `${type}; charset=utf-8`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'"
    });
    res.end(data);
}

function readBody(req: IncomingMessage): Promise<any> {
    return new Promise(resolve => {
        let raw = "";
        req.on("data", c => {
            raw += c;
            if (raw.length > 1e5) req.destroy();
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                resolve({});
            }
        });
    });
}

let busy = false;

async function handle(req: IncomingMessage, res: ServerResponse, port: number) {
    // DNS-rebinding protection + per-run secret token
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: "bad host" });
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/") {
        if (url.searchParams.get("t") !== TOKEN) return send(res, 403, "Forbidden", "text/plain");
        pageLoaded = true;
        const html = UI_HTML.replace("__NC_TOKEN__", TOKEN).replace("__NC_VERSION__", NEXUSCORD_VERSION).replace("__NC_HOST__", hostMode);
        return send(res, 200, html, "text/html");
    }
    if (req.headers["x-nc-token"] !== TOKEN) return send(res, 403, { error: "bad token" });
    lastHeartbeat = Date.now();

    if (url.pathname === "/api/state") {
        return send(res, 200, {
            version: NEXUSCORD_VERSION,
            dataDir: DATA_DIR,
            branches: await detect(),
            payloadReady: PAYLOAD_FILES.every(hasAsset),
            host: hostMode,
            platform: process.platform
        });
    }
    if (url.pathname === "/api/action" && req.method === "POST") {
        if (busy) return send(res, 409, { ok: false, messages: ["Another operation is running"] });
        busy = true;
        try {
            const body = await readBody(req);
            const result = await performAction(String(body.action), body.branch as BranchId, !!body.relaunch);
            return send(res, 200, { ...result, branches: await detect() });
        } finally {
            busy = false;
        }
    }
    if (url.pathname === "/api/open-data" && req.method === "POST") {
        if (process.platform === "win32") spawn("explorer.exe", [DATA_DIR], { detached: true, stdio: "ignore" }).unref();
        return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/heartbeat") return send(res, 200, { ok: true });
    if (url.pathname === "/api/quit" && req.method === "POST") {
        send(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 150);
        return;
    }
    send(res, 404, { error: "not found" });
}

function extractHostFiles(): string | null {
    const dir = join(tmpdir(), `NexusCordInstaller-${NEXUSCORD_VERSION}`);
    const files = [
        "host.ps1",
        "icon.ico",
        "Microsoft.Web.WebView2.Core.dll",
        "Microsoft.Web.WebView2.WinForms.dll",
        "x64/WebView2Loader.dll",
        "x86/WebView2Loader.dll",
        "arm64/WebView2Loader.dll"
    ];
    try {
        for (const f of files) {
            const target = join(dir, f);
            mkdirSync(join(target, ".."), { recursive: true });
            writeFileSync(target, readAsset(f));
        }
        return dir;
    } catch (e) {
        log("WebView2 host files unavailable:", (e as Error).message);
        return null;
    }
}

function findBrowser(): string | null {
    const pf = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean) as string[];
    const candidates = pf.flatMap(base => [
        join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
        join(base, "Google", "Chrome", "Application", "chrome.exe"),
        join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    ]);
    return candidates.find(existsSync) ?? null;
}

function openWithBrowser(url: string) {
    const browser = findBrowser();
    if (browser) {
        hostMode = "edge";
        log("Opening UI with", browser);
        const profile = join(tmpdir(), "NexusCordInstaller-browser");
        spawn(browser, [`--app=${url}`, "--window-size=540,430", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-features=Translate"], {
            detached: true,
            stdio: "ignore"
        }).unref();
    } else {
        hostMode = "browser";
        log("Opening UI in default browser");
        if (process.platform === "win32") spawn("cmd.exe", ["/c", "start", '""', `"${url}"`], { windowsHide: true, windowsVerbatimArguments: true, detached: true, stdio: "ignore" }).unref();
        else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
    // Browser windows can't tell us when they close: exit after 2 minutes without heartbeat
    setInterval(() => {
        if (Date.now() - lastHeartbeat > 120_000) process.exit(0);
    }, 5000).unref();
}

function launchGui(url: string) {
    const hostDir = process.platform === "win32" && !process.argv.includes("--browser") ? extractHostFiles() : null;
    if (!hostDir) return openWithBrowser(url);

    hostMode = "webview2";
    const ps = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(
        existsSync(ps) ? ps : "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", join(hostDir, "host.ps1"), "-Url", url, "-Dir", hostDir, "-DataDir", join(hostDir, "webview-data")],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr?.on("data", d => (stderr += d));
    const startedAt = Date.now();
    child.on("exit", code => {
        log(`WebView2 host exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`);
        if (!pageLoaded || (code !== 0 && Date.now() - startedAt < 10_000)) {
            // WebView2 runtime missing / PowerShell blocked -> fall back to a browser window
            openWithBrowser(url);
        } else {
            process.exit(0);
        }
    });
    child.on("error", e => {
        log("Could not start PowerShell host", e);
        openWithBrowser(url);
    });
}

function gui() {
    const server = createServer((req, res) => {
        const port = (server.address() as { port: number }).port;
        handle(req, res, port).catch(e => {
            log("Request failed", e);
            send(res, 500, { ok: false, messages: [String((e as Error).message)] });
        });
    });
    server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as { port: number }).port;
        const url = `http://127.0.0.1:${port}/?t=${TOKEN}`;
        log(`NexusCord Installer v${NEXUSCORD_VERSION} UI on port ${port}`);
        if (process.argv.includes("--no-open")) {
            // Used by automated tests
            try {
                process.stdout.write(url + "\n");
            } catch { /* ignore */ }
            return;
        }
        launchGui(url);
    });
}

if (isCli) {
    cli().then(
        code => process.exit(code),
        e => {
            log(e);
            process.exit(1);
        }
    );
} else {
    gui();
}
