/*
 * Main-process side of the v2 feature set. Every handler validates its input:
 * the renderer also runs third-party BetterDiscord plugins, so nothing here
 * exposes generic filesystem or network access.
 */
import { spawn } from "child_process";
import { createHash, randomBytes } from "crypto";
import electron, { app, BrowserWindow, ipcMain, net, session, shell, type ProcessMetric } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { HTTP_ALLOWLIST, IPC } from "../shared/ipc";
import { DATA_DIR, PLUGINS_DIR, THEMES_DIR } from "./paths";
import { getSettings, setSettings } from "./settings";

const log = (...a: unknown[]) => console.log("[NexusCord]", ...a);
const STORE_DIR = join(DATA_DIR, "data");
const ASSET_DIR = join(DATA_DIR, "assets");
const BOOT_FILE = join(DATA_DIR, "boot.json");
const SECRETS_FILE = join(DATA_DIR, "secrets.bin");
const REPO = "cacca123000/Nexuscord";

for (const d of [STORE_DIR, ASSET_DIR]) mkdirSync(d, { recursive: true });

const safeKey = (k: unknown) => (typeof k === "string" && /^[\w.-]{1,64}$/.test(k) ? k : null);
const isHttp = (u: unknown): u is string => {
    if (typeof u !== "string") return false;
    try {
        const p = new URL(u).protocol;
        return p === "https:" || p === "http:";
    } catch {
        return false;
    }
};

export function mainWindows(): BrowserWindow[] {
    return BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && /discord(app)?\.com/.test(w.webContents.getURL()));
}

export function emitToRenderer(event: string, payload?: unknown) {
    for (const w of mainWindows()) w.webContents.send(IPC.MAIN_EVENT, event, payload);
}

// ---------------------------------------------------------------------------
// Safe mode & crash detection
// ---------------------------------------------------------------------------
interface BootState {
    pendingBoots: number;
    forceSafeOnce: boolean;
    crashes: number[];
}
let boot: BootState = { pendingBoots: 0, forceSafeOnce: false, crashes: [] };
try {
    boot = { ...boot, ...JSON.parse(readFileSync(BOOT_FILE, "utf8")) };
} catch { /* first run */ }

/** Safe mode = started with --nc-safe-mode, requested from the UI, or 2 boots in a row never reached "ready". */
export const SAFE_MODE = process.argv.includes("--nc-safe-mode") || boot.forceSafeOnce || boot.pendingBoots >= 2;
boot.pendingBoots++;
boot.forceSafeOnce = false;
const saveBoot = () => {
    try {
        writeFileSync(BOOT_FILE, JSON.stringify(boot));
    } catch { /* ignore */ }
};
saveBoot();
if (SAFE_MODE) log("Starting in SAFE MODE (plugins and themes disabled)");

export function relaunch(extraArgs: string[] = []) {
    app.relaunch({ args: process.argv.slice(1).filter(a => a !== "--nc-safe-mode").concat(extraArgs) });
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Secrets (Gist token) - encrypted with the OS keychain via safeStorage
// ---------------------------------------------------------------------------
function secrets(): Record<string, string> {
    try {
        const buf = readFileSync(SECRETS_FILE);
        const ss = (electron as any).safeStorage;
        const json = ss?.isEncryptionAvailable?.() ? ss.decryptString(buf) : buf.toString("utf8");
        return JSON.parse(json);
    } catch {
        return {};
    }
}
function saveSecrets(s: Record<string, string>) {
    const ss = (electron as any).safeStorage;
    const json = JSON.stringify(s);
    writeFileSync(SECRETS_FILE, ss?.isEncryptionAvailable?.() ? ss.encryptString(json) : Buffer.from(json));
}

// ---------------------------------------------------------------------------
// HTTP helper (allowlisted hosts only)
// ---------------------------------------------------------------------------
async function http(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !HTTP_ALLOWLIST.includes(u.hostname)) throw new Error(`Host not allowed: ${u.hostname}`);
    const res = await net.fetch(url, { method: init.method ?? "GET", headers: { "User-Agent": "NexusCord", ...(init.headers ?? {}) }, body: init.body });
    return { status: res.status, ok: res.ok, body: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
}

// ---------------------------------------------------------------------------
// Memory history (for the RAM dashboard) + auto-restart when hidden & bloated
// ---------------------------------------------------------------------------
const memHistory: { t: number; total: number; renderer: number; gpu: number; browser: number }[] = [];
let overLimitTicks = 0;
function sampleMemory() {
    try {
        const metrics = app.getAppMetrics();
        const mb = (m: (typeof metrics)[number]) => Math.round((m.memory.privateBytes ?? m.memory.workingSetSize) / 1024);
        const sum = (f: (t: string) => boolean) => metrics.filter(m => f(m.type)).reduce((a, m) => a + mb(m), 0);
        const sample = { t: Date.now(), total: sum(() => true), renderer: sum(t => t === "Tab"), gpu: sum(t => t === "GPU"), browser: sum(t => t === "Browser") };
        memHistory.push(sample);
        if (memHistory.length > 720) memHistory.shift(); // 1h at 5s

        const limit = getSettings().performance.autoRestartMB;
        const win = mainWindows()[0];
        maybeTrim(win);
        if (limit > 0 && win && (win.isMinimized() || !win.isVisible()) && sample.renderer > limit) {
            if (++overLimitTicks >= 6) {
                log(`Renderer at ${sample.renderer} MB while hidden (limit ${limit} MB) - reloading to free memory`);
                overLimitTicks = 0;
                (win.webContents as any).reload();
            }
        } else overLimitTicks = 0;
    } catch { /* metrics unavailable */ }
}

// ---------------------------------------------------------------------------
// Give RAM back to Windows while Discord is hidden. EmptyWorkingSet moves pages Discord
// isn't touching out of RAM (they come back on demand when you open Discord again), which
// is exactly what Task Manager's "Memory" column measures.
// ---------------------------------------------------------------------------
let hiddenSince = 0;
let lastTrim = 0;
let trimming = false;
function maybeTrim(win: BrowserWindow | undefined) {
    if (process.platform !== "win32" || !win || win.isDestroyed()) return;
    const perf = getSettings().performance;
    const hidden = win.isMinimized() || !win.isVisible();
    const idleUnfocused = perf.memorySaver === "aggressive" && !win.isFocused();
    if (!hidden && !idleUnfocused) {
        hiddenSince = 0;
        return;
    }
    hiddenSince ||= Date.now();
    if (!perf.trimWhenHidden || trimming) return;
    const waited = Date.now() - hiddenSince;
    // First trim after 45 s hidden (3 min when merely unfocused), then every 10 min
    if (waited < (hidden ? 45_000 : 180_000) || Date.now() - lastTrim < 600_000) return;
    void trimWorkingSets("hidden");
}

export async function trimWorkingSets(reason: string): Promise<number> {
    if (process.platform !== "win32" || trimming) return 0;
    trimming = true;
    lastTrim = Date.now();
    try {
        // Let the renderer drop its caches + run a full GC first
        emitToRenderer("trim-memory");
        await new Promise(r => setTimeout(r, 1500));
        const before = app.getAppMetrics();
        const pids = before.map(m => m.pid).filter(p => Number.isInteger(p) && p > 0);
        if (!pids.length) return 0;
        await powershell(
            `Add-Type -Namespace NC -Name Mem -MemberDefinition '[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(System.IntPtr h);';` +
                `foreach ($p in @(${pids.join(",")})) { try { [void][NC.Mem]::EmptyWorkingSet((Get-Process -Id $p -ErrorAction Stop).Handle) } catch {} }`,
            20000
        );
        const ws = (list: ProcessMetric[]) => list.reduce((a, m) => a + (m.memory.workingSetSize ?? 0), 0);
        const freed = Math.max(0, Math.round((ws(before) - ws(app.getAppMetrics())) / 1024));
        log(`Trimmed working set (${reason}): ~${freed} MB returned to Windows`);
        return freed;
    } catch (e) {
        log("Working-set trim failed", e);
        return 0;
    } finally {
        trimming = false;
    }
}

// ---------------------------------------------------------------------------
// Windows integrations via PowerShell (Hello, media session)
// ---------------------------------------------------------------------------
function powershell(script: string, timeoutMs = 60000): Promise<string> {
    return new Promise(resolve => {
        if (process.platform !== "win32") return resolve("");
        const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
        let out = "";
        ps.stdout.on("data", d => (out += d));
        const t = setTimeout(() => ps.kill(), timeoutMs);
        ps.on("close", () => {
            clearTimeout(t);
            resolve(out.trim());
        });
        ps.on("error", () => resolve(""));
    });
}

const WINRT_AWAIT = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }`;

async function windowsHello(message: string): Promise<boolean> {
    const msg = message.replace(/'/g, "''").slice(0, 120);
    const out = await powershell(`${WINRT_AWAIT}
[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null
$avail = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if ($avail -ne 'Available') { 'Unavailable'; exit }
Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${msg}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])`);
    return out.split(/\r?\n/).pop() === "Verified";
}

let mediaProc: ReturnType<typeof spawn> | null = null;
let lastMedia: unknown = null;
function startMediaWatcher() {
    if (mediaProc || process.platform !== "win32") return;
    const script = `${WINRT_AWAIT}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $tl = $s.GetTimelineProperties(); $pb = $s.GetPlaybackInfo()
      @{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = "$($pb.PlaybackStatus)"; position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds } | ConvertTo-Json -Compress
    } else { '{}' }
  } catch { '{}' }
  Start-Sleep -Seconds 5
}`;
    mediaProc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
    let buf = "";
    mediaProc.stdout?.on("data", d => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            try {
                lastMedia = JSON.parse(line);
            } catch { /* partial */ }
        }
    });
    mediaProc.on("close", () => (mediaProc = null));
    app.on("before-quit", () => mediaProc?.kill());
}

// ---------------------------------------------------------------------------
// Auto-update from GitHub releases (sha256-verified)
// ---------------------------------------------------------------------------
const cmpVer = (a: string, b: string) => {
    const pa = a.replace(/^v/, "").split(".").map(Number), pb = b.replace(/^v/, "").split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
};

async function checkUpdate() {
    const res = await http(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return { available: false, error: res.status === 404 ? "no releases yet" : `HTTP ${res.status}` };
    const rel = JSON.parse(res.body);
    const latest = String(rel.tag_name ?? "");
    const assets: { name: string; browser_download_url: string }[] = rel.assets ?? [];
    return {
        available: cmpVer(latest, NEXUSCORD_VERSION) > 0 && ["injector.js", "preload.js", "renderer.js", "checksums.txt"].every(n => assets.some(a => a.name === n)),
        current: NEXUSCORD_VERSION,
        latest,
        notes: String(rel.body ?? "").slice(0, 4000),
        url: rel.html_url
    };
}

async function applyUpdate() {
    const info = await checkUpdate();
    if (!info.available) return { ok: false, error: "No update available" };
    const rel = JSON.parse((await http(`https://api.github.com/repos/${REPO}/releases/latest`)).body);
    const asset = (n: string) => rel.assets.find((a: any) => a.name === n).browser_download_url as string;
    const sums = await net.fetch(asset("checksums.txt")).then(r => r.text());
    const dir = __dirname; // %appdata%\NexusCord\dist
    const staged: [string, string][] = [];
    for (const f of ["injector.js", "preload.js", "renderer.js"]) {
        const body = Buffer.from(new Uint8Array((await (await net.fetch(asset(f))).arrayBuffer()) as ArrayBuffer));
        const want = new RegExp(`^([0-9a-f]{64})\\s+\\*?${f.replace(".", "\\.")}$`, "m").exec(sums)?.[1];
        if (!want || createHash("sha256").update(body).digest("hex") !== want) return { ok: false, error: `Checksum mismatch for ${f}` };
        const tmp = join(dir, `${f}.update`);
        writeFileSync(tmp, body);
        staged.push([tmp, join(dir, f)]);
    }
    for (const [tmp, final] of staged) renameSync(tmp, final);
    log(`Updated to ${info.latest}`);
    return { ok: true, version: info.latest };
}

// ---------------------------------------------------------------------------
// Window customisation
// ---------------------------------------------------------------------------
export function applyWindowSettings(win: BrowserWindow) {
    const w = getSettings().window;
    try {
        (win as any).setOpacity?.(Math.min(1, Math.max(0.3, w.opacity || 1)));
        if (process.platform === "win32" && win.setBackgroundMaterial) {
            if (w.material !== "none") win.setBackgroundColor("#00000000");
            win.setBackgroundMaterial(w.material);
        }
        if (w.customIcon && existsSync(w.customIcon)) (win as any).setIcon?.((electron as any).nativeImage.createFromPath(w.customIcon));
    } catch (e) {
        log("applyWindowSettings failed", e);
    }
}

/** Custom splash screen colour/image (Discord's splash is a separate local page). */
export function maybeStyleSplash(win: BrowserWindow) {
    win.webContents.on("did-finish-load", () => {
        const url = win.webContents.getURL();
        if (!/splash/i.test(url)) return;
        const w = getSettings().window;
        let css = "";
        if (w.splashColor) css += `html,body,#splash,[class*="splash"]{background:${w.splashColor.replace(/[;{}]/g, "")}!important}`;
        if (w.splashImage && existsSync(w.splashImage)) {
            const data = readFileSync(w.splashImage).toString("base64");
            const mime = extname(w.splashImage).toLowerCase() === ".png" ? "image/png" : extname(w.splashImage).toLowerCase() === ".gif" ? "image/gif" : "image/jpeg";
            css += `body{background:url(data:${mime};base64,${data}) center/cover no-repeat!important}`;
        }
        if (css) (win.webContents as any).insertCSS?.(css);
    });
}

/** Tray: custom icon + NexusCord submenu appended to Discord's tray menu. */
function patchTray() {
    const E = electron as any;
    const Tray = E.Tray;
    if (!Tray?.prototype) return;
    const origSetMenu = Tray.prototype.setContextMenu;
    Tray.prototype.setContextMenu = function (menu: any) {
        try {
            if (menu?.append && !menu.__nc) {
                menu.__nc = true;
                const mem = memHistory.at(-1);
                menu.append(new E.MenuItem({ type: "separator" }));
                menu.append(
                    new E.MenuItem({
                        label: "NexusCord",
                        submenu: [
                            { label: mem ? `RAM: ${mem.total} MB` : "RAM: …", enabled: false },
                            { label: "Open NexusCord settings", click: () => emitToRenderer("open-settings") },
                            { label: "Toggle streamer panic mode", click: () => emitToRenderer("panic") },
                            { label: "Purge caches", click: () => session.defaultSession.clearCache() },
                            { type: "separator" },
                            { label: "Restart Discord", click: () => relaunch() },
                            { label: "Restart in safe mode", click: () => relaunch(["--nc-safe-mode"]) }
                        ]
                    })
                );
            }
        } catch (e) {
            log("tray menu patch failed", e);
        }
        return origSetMenu.call(this, menu);
    };
    const origSetImage = Tray.prototype.setImage;
    Tray.prototype.setImage = function (img: unknown) {
        const custom = getSettings().window.customTrayIcon;
        if (custom && existsSync(custom)) img = E.nativeImage.createFromPath(custom);
        return origSetImage.call(this, img);
    };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
export function registerFeatureIpc(): void {
    ipcMain.on(IPC.DATA_LOAD, (e, key) => {
        const k = safeKey(key);
        try {
            e.returnValue = k ? JSON.parse(readFileSync(join(STORE_DIR, `${k}.json`), "utf8")) : null;
        } catch {
            e.returnValue = null;
        }
    });
    ipcMain.handle(IPC.DATA_SAVE, (_e, key, data) => {
        const k = safeKey(key);
        if (!k) return false;
        const file = join(STORE_DIR, `${k}.json`);
        writeFileSync(file + ".tmp", JSON.stringify(data));
        renameSync(file + ".tmp", file);
        return true;
    });

    ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (e, opts: { kind?: "image" | "audio" | "video" | "json" | "any"; copyAs?: string } = {}) => {
        const filters = {
            image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "ico"] }],
            audio: [{ name: "Audio", extensions: ["mp3", "ogg", "wav", "m4a"] }],
            video: [{ name: "Video", extensions: ["mp4", "webm"] }],
            json: [{ name: "JSON", extensions: ["json"] }],
            any: []
        }[opts.kind ?? "any"];
        const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
        const r = await (electron as any).dialog.showOpenDialog(win, { properties: ["openFile"], filters });
        if (r.canceled || !r.filePaths?.[0]) return null;
        const src: string = r.filePaths[0];
        // Copy into the data folder so the file survives being moved/deleted
        const name = `${safeKey(opts.copyAs) ?? "file"}-${randomBytes(4).toString("hex")}${extname(src).toLowerCase()}`;
        const dest = join(ASSET_DIR, name);
        copyFileSync(src, dest);
        const size = readFileSync(dest).length;
        const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm", ".ico": "image/x-icon", ".json": "application/json" }[extname(dest).toLowerCase()] ?? "application/octet-stream";
        const dataUrl = size < 25 * 1024 * 1024 ? `data:${mime};base64,${readFileSync(dest).toString("base64")}` : null;
        return { path: dest, name: basename(src), size, mime, dataUrl };
    });
    ipcMain.handle(IPC.DIALOG_SAVE_TEXT, async (e, defaultName: string, content: string) => {
        if (typeof content !== "string") return null;
        const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
        const r = await (electron as any).dialog.showSaveDialog(win, { defaultPath: join(app.getPath("downloads"), basename(String(defaultName || "nexuscord.json"))) });
        if (r.canceled || !r.filePath) return null;
        writeFileSync(r.filePath, content);
        return r.filePath;
    });
    ipcMain.handle(IPC.DIALOG_OPEN_TEXT, async e => {
        const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
        const r = await (electron as any).dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
        if (r.canceled || !r.filePaths?.[0]) return null;
        return readFileSync(r.filePaths[0], "utf8");
    });

    ipcMain.handle(IPC.DOWNLOAD, async (_e, url: string, fileName: string, folder?: string) => {
        if (!isHttp(url)) throw new Error("bad url");
        const sub = folder && safeKey(folder.replace(/[^\w.-]/g, "_").slice(0, 64));
        const dir = join(app.getPath("downloads"), "NexusCord", sub || "");
        mkdirSync(dir, { recursive: true });
        let name = basename(String(fileName || "file")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 150) || "file";
        let target = join(dir, name);
        for (let i = 1; existsSync(target); i++) target = join(dir, name.replace(/(\.[^.]*)?$/, `-${i}$1`));
        const res = await net.fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(target, Buffer.from(new Uint8Array(await res.arrayBuffer())));
        return target;
    });
    ipcMain.handle(IPC.SHOW_IN_FOLDER, (_e, p: string) => {
        if (typeof p === "string" && p.startsWith(app.getPath("downloads"))) shell.showItemInFolder(p);
    });

    ipcMain.handle(IPC.HTTP, (_e, url: string, init) => http(String(url), init ?? {}));

    ipcMain.handle(IPC.WINDOW_SET, e => {
        const win = BrowserWindow.fromWebContents(e.sender);
        if (win) applyWindowSettings(win);
        return true;
    });
    ipcMain.handle(IPC.WINDOW_ACTION, (e, action: string) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        if (!win) return false;
        const wc = win.webContents as any;
        switch (action) {
            case "devtools": wc.toggleDevTools?.(); break;
            case "reload": wc.reload?.(); break;
            case "hide": (win as any).hide?.(); break;
            case "minimize": (win as any).minimize?.(); break;
            case "restart": relaunch(); break;
            case "restart-safe": relaunch(["--nc-safe-mode"]); break;
            default: return false;
        }
        return true;
    });

    ipcMain.handle(IPC.WINDOWS_HELLO, (_e, msg: string) => windowsHello(String(msg ?? "NexusCord")));
    ipcMain.handle(IPC.MEDIA_SESSION, () => {
        startMediaWatcher();
        return lastMedia;
    });

    ipcMain.handle(IPC.UPDATE_CHECK, async () => {
        try {
            return await checkUpdate();
        } catch (e) {
            return { available: false, error: String((e as Error).message) };
        }
    });
    ipcMain.handle(IPC.UPDATE_APPLY, async () => {
        try {
            return await applyUpdate();
        } catch (e) {
            return { ok: false, error: String((e as Error).message) };
        }
    });

    ipcMain.on(IPC.SAFE_MODE, e => {
        e.returnValue = SAFE_MODE;
    });
    ipcMain.handle(IPC.BOOT_OK, () => {
        boot.pendingBoots = 0;
        saveBoot();
        return true;
    });

    ipcMain.handle(IPC.MEM_HISTORY, () => memHistory);
    ipcMain.handle(IPC.LAUNCH_INSTANCE, (_e, profile: string) => {
        const name = safeKey(profile);
        if (!name) return false;
        spawn(process.execPath, ["--multi-instance", `--nc-profile=${name}`], { detached: true, stdio: "ignore" }).unref();
        return true;
    });

    ipcMain.handle(IPC.SECRET_SET, (_e, key: string, value: string) => {
        const k = safeKey(key);
        if (!k) return false;
        const s = secrets();
        if (value) s[k] = String(value);
        else delete s[k];
        saveSecrets(s);
        return true;
    });
    ipcMain.on(IPC.SECRET_HAS, (e, key) => {
        const k = safeKey(key);
        e.returnValue = !!(k && secrets()[k]);
    });
    ipcMain.handle(IPC.GIST_SYNC, async (_e, direction: "push" | "pull", payload?: string) => {
        const token = secrets().githubToken;
        if (!token) return { ok: false, error: "No GitHub token saved" };
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
        const s = getSettings();
        if (direction === "push") {
            const body = JSON.stringify({ description: "NexusCord settings backup", public: false, files: { "nexuscord-backup.json": { content: String(payload ?? "{}") } } });
            const res = s.sync.gistId
                ? await http(`https://api.github.com/gists/${s.sync.gistId}`, { method: "PATCH", headers, body })
                : await http("https://api.github.com/gists", { method: "POST", headers, body });
            if (!res.ok) return { ok: false, error: `GitHub HTTP ${res.status}` };
            const gist = JSON.parse(res.body);
            setSettings({ ...getSettings(), sync: { gistId: gist.id, lastSync: Date.now() } });
            return { ok: true, gistId: gist.id };
        }
        if (!s.sync.gistId) return { ok: false, error: "No backup Gist yet - push first" };
        const res = await http(`https://api.github.com/gists/${s.sync.gistId}`, { headers });
        if (!res.ok) return { ok: false, error: `GitHub HTTP ${res.status}` };
        const content = JSON.parse(res.body).files?.["nexuscord-backup.json"]?.content;
        return content ? { ok: true, content } : { ok: false, error: "Backup file missing in Gist" };
    });

    ipcMain.handle(IPC.ADDON_INSTALL, async (_e, kind: "theme" | "plugin", fileName: string, sourceUrl: string) => {
        const ext = kind === "theme" ? ".theme.css" : ".plugin.js";
        const name = basename(String(fileName));
        if (!name.endsWith(ext) || name.startsWith(".")) throw new Error("bad file name");
        const res = await http(String(sourceUrl));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(join(kind === "theme" ? THEMES_DIR : PLUGINS_DIR, name), res.body);
        return { ok: true, source: kind === "plugin" ? res.body : undefined };
    });
    const addonPath = (kind: "theme" | "plugin", fileName: string) => {
        const name = basename(String(fileName));
        const ok = kind === "theme" ? name.endsWith(".theme.css") : name.endsWith(".plugin.js") || name.endsWith(".config.json");
        if (!ok || name.startsWith(".") || name.length > 200) throw new Error("bad file name");
        return join(kind === "theme" ? THEMES_DIR : PLUGINS_DIR, name);
    };
    ipcMain.handle(IPC.TRIM_MEMORY, () => trimWorkingSets("manual"));
    ipcMain.handle(IPC.ADDON_WRITE, (_e, kind: "theme" | "plugin", fileName: string, content: string) => {
        const text = String(content);
        if (text.length > 8 * 1024 * 1024) throw new Error("file too large");
        writeFileSync(addonPath(kind, fileName), text);
        return true;
    });
    ipcMain.on(IPC.ADDON_READ, (e, kind: "theme" | "plugin", fileName: string) => {
        try {
            const p = addonPath(kind, fileName);
            e.returnValue = existsSync(p) ? readFileSync(p, "utf8") : null;
        } catch {
            e.returnValue = null;
        }
    });
    ipcMain.handle(IPC.ADDON_DELETE, (_e, kind: "theme" | "plugin", fileName: string) => {
        const ext = kind === "theme" ? ".theme.css" : ".plugin.js";
        const name = basename(String(fileName));
        if (!name.endsWith(ext)) return false;
        const p = join(kind === "theme" ? THEMES_DIR : PLUGINS_DIR, name);
        if (existsSync(p)) unlinkSync(p);
        return true;
    });

    ipcMain.on(IPC.APP_INFO, e => {
        e.returnValue = {
            version: NEXUSCORD_VERSION,
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            discord: app.getVersion?.(),
            safeMode: SAFE_MODE,
            dataDir: DATA_DIR,
            distDir: __dirname,
            profile: process.argv.find(a => a.startsWith("--nc-profile="))?.split("=")[1] ?? null
        };
    });
}

export function initFeatures(): void {
    sampleMemory();
    setInterval(sampleMemory, 5000).unref?.();
    patchTray();
    void dirname;
}
