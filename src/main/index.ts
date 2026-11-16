/*
 * NexusCord injector - Electron main process entry point.
 *
 * Loaded by <Discord>/app-x/resources/app/index.js (written by the installer).
 * Electron prefers the `app` folder over `app.asar`, so we run first, set up
 * our hooks, then hand control to Discord's real app.asar.
 */
import electron, { app, BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "fs";
import Module from "module";
import { dirname, join } from "path";
import { IPC } from "../shared/ipc";
import { isPluginEnabled } from "../shared/settings";
import { initAutoRepatch } from "./autoRepatch";
import { applyWindowSettings, initFeatures, maybeStyleSplash, registerFeatureIpc, SAFE_MODE } from "./features";
import { consumeAllowOnce, isHttpUrl, notifyLinkBlocked, originalPreloads, registerIpc } from "./ipc";
import { initLinkShieldMain, isPhishingHost } from "./linkShieldMain";
import { DATA_DIR, ensureDataDirs } from "./paths";
import { getSettings, onSettingsChange } from "./settings";
import { installWebRequestHooks, isTrackingUrl, stripCsp } from "./webRequest";

ensureDataDirs();
// Main-process log file (%APPDATA%\NexusCord\nexuscord.log) - the first thing to check if
// NexusCord does not show up in Discord.
const LOG_FILE = join(DATA_DIR, "nexuscord.log");
try {
    if (statSync(LOG_FILE).size > 512 * 1024) writeFileSync(LOG_FILE, "");
} catch { /* first run */ }
const log = (...a: unknown[]) => {
    console.log("[NexusCord]", ...a);
    try {
        appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${a.map(x => (x instanceof Error ? x.stack : typeof x === "string" ? x : JSON.stringify(x))).join(" ")}\n`);
    } catch { /* ignore */ }
};
process.on("uncaughtException", e => log("UNCAUGHT", e));
// Renderer errors (NexusCord's own + React crashes) end up in the same log file
let rendererLines = 0;
electron.ipcMain?.on?.(IPC.RENDERER_LOG, (_e, text) => {
    if (++rendererLines > 300) return; // never let a crash loop fill the disk
    log("[renderer]", String(text).slice(0, 4000));
});
const settings = getSettings();

// ---------------------------------------------------------------------------
// 1. Low-RAM Chromium / V8 switches (must happen before app ready)
// ---------------------------------------------------------------------------
function applyCommandLine(): void {
    const perf = settings.performance;
    const cl = app.commandLine;
    const mode = perf.memorySaver ?? "balanced";
    const appendList = (sw: string, values: string[], sep: string) => {
        if (!values.length) return;
        const existing = cl.hasSwitch(sw) ? cl.getSwitchValue(sw) : "";
        cl.appendSwitch(sw, [existing, ...values].filter(Boolean).join(sep));
    };

    const js: string[] = [];
    if (perf.maxOldSpaceSize > 0) js.push(`--max-old-space-size=${perf.maxOldSpaceSize}`);
    if (mode !== "off") {
        // Smaller young generation: fewer MB parked in short-lived objects
        js.push(`--max-semi-space-size=${mode === "aggressive" ? 4 : 8}`);
        // Lets NexusCord run a full GC when Discord is hidden
        js.push("--expose-gc");
    }
    if (mode === "aggressive") js.push("--optimize-for-size");
    appendList("js-flags", js, " ");

    if (mode !== "off") {
        // Chromium keeps a spare, idle renderer process around (30-60 MB) - Discord never needs it
        appendList("disable-features", ["SpareRendererForSitePerProcess", "MediaRouter", "DialMediaRouteProvider"], ",");
        appendList("enable-features", ["PartitionAllocMemoryReclaimer"], ",");
    }
    if (mode === "aggressive") {
        cl.appendSwitch("force-gpu-mem-available-mb", "256");
        cl.appendSwitch("renderer-process-limit", "2");
    }
    if (perf.processPerSite) cl.appendSwitch("process-per-site");
    if (perf.gpuRasterization) cl.appendSwitch("enable-gpu-rasterization");
    if (perf.disableBackgroundTimerThrottling) cl.appendSwitch("disable-background-timer-throttling");
}

// ---------------------------------------------------------------------------
// 2. BrowserWindow proxy: inject our preload, keep Discord's (voice/Krisp/
//    screenshare live in Discord's preload, so it MUST keep running).
// ---------------------------------------------------------------------------
const PRELOAD_PATH = join(__dirname, "preload.js");
let startHandled = false;

const PatchedBrowserWindow = new Proxy(electron.BrowserWindow, {
    construct(target, args: [BrowserWindowConstructorOptions?], newTarget) {
        const options = args[0];
        const prefs = options?.webPreferences;
        let original: string | undefined;
        if (options && prefs?.preload && prefs.preload !== PRELOAD_PATH) {
            original = prefs.preload;
            prefs.preload = PRELOAD_PATH;
            // Our preload needs Node's `fs` to read renderer.js
            prefs.sandbox = false;

            const w = getSettings().window;
            if (process.platform === "win32" && options.title && w.material !== "none") {
                options.backgroundMaterial = w.material;
                options.backgroundColor = "#00000000";
            }
        }
        const win = Reflect.construct(target, args, newTarget) as BrowserWindow;
        if (original) {
            originalPreloads.set(win.webContents.id, original);
            log(`Window "${options?.title ?? "?"}" gets NexusCord preload (original: ${original})`);
        }
        try {
            maybeStyleSplash(win);
            if (original && options?.title) {
                const s = getSettings();
                if (s.window.opacity < 1 || s.window.material !== "none" || s.window.customIcon) applyWindowSettings(win);
                // Start minimized: swallow the first show() of the main window
                if (s.performance.startMinimized && !startHandled) {
                    startHandled = true;
                    const origShow = win.show.bind(win);
                    let first = true;
                    win.show = () => {
                        if (first) {
                            first = false;
                            return;
                        }
                        origShow();
                    };
                }
            }
        } catch (e) {
            log("window customisation failed", e);
        }
        return win;
    }
});

function patchElectronExports(): void {
    const proxy = new Proxy(electron, {
        get(target, key, receiver) {
            if (key === "BrowserWindow") return PatchedBrowserWindow;
            return Reflect.get(target, key, receiver);
        }
    });
    // 1. Every future require("electron") (Discord's code) gets the proxy
    const M = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
    const origLoad = M._load;
    M._load = function (request: string, ...rest: unknown[]) {
        if (request === "electron") return proxy;
        return origLoad.call(this, request, ...rest);
    };
    // 2. Also swap the cached module object if Electron exposes one
    try {
        const cached = require.cache[require.resolve("electron")];
        if (cached) cached.exports = proxy;
    } catch { /* builtin without a cache entry */ }
}

// ---------------------------------------------------------------------------
// 3. Session hooks: CSP bypass, NoTrack, LinkShield main-side guard
// ---------------------------------------------------------------------------
function installSessionHooks(): void {
    installWebRequestHooks(electron.session.defaultSession, {
        shouldBlock: url => isPluginEnabled(getSettings(), "noTrack") && isTrackingUrl(url),
        transformHeaders: (_url, headers) => stripCsp(headers)
    });

    // Defense in depth: even if a link bypasses the renderer (e.g. opened by
    // Discord natively), block known phishing hosts before the OS opens it.
    const shell = electron.shell as { openExternal: (url: string, o?: unknown) => Promise<void> };
    const origOpen = shell.openExternal.bind(shell);
    try {
        shell.openExternal = (url: string, opts?: unknown) => {
            try {
                if (isHttpUrl(url) && isPluginEnabled(getSettings(), "linkShield") && !consumeAllowOnce(url)) {
                    if (isPhishingHost(new URL(url).hostname)) {
                        log("Blocked phishing link:", url);
                        notifyLinkBlocked(url, "phishing");
                        return Promise.resolve();
                    }
                }
            } catch { /* fall through to original */ }
            return origOpen(url, opts);
        };
    } catch (e) {
        log("Could not wrap shell.openExternal:", e);
    }
}

// ---------------------------------------------------------------------------
// 4. Boot Discord's real app.asar
// ---------------------------------------------------------------------------
function loadDiscord(): void {
    // Installed layout: Discord's archive was renamed to _app.asar and resources/app.asar is
    // our loader folder. The legacy layout (resources/app folder) still has app.asar intact.
    const isFile = (p: string) => {
        try {
            return statSync(p).isFile();
        } catch {
            return false;
        }
    };
    const candidates = ["_app.asar", "app.asar"].map(f => join(process.resourcesPath, f));
    const asarPath = candidates.find(isFile) ?? candidates.find(p => existsSync(p) && !p.endsWith(join("resources", "app.asar")));
    if (!asarPath) {
        log("FATAL: Discord app.asar not found in", process.resourcesPath);
        return;
    }
    const pkg = JSON.parse(readFileSync(join(asarPath, "package.json"), "utf8"));
    const entry = join(asarPath, pkg.main || "index.js");

    // Mirror Electron's own startup so Discord sees exactly what it expects.
    const name = String(pkg.productName ?? pkg.name ?? app.name).trim();
    app.setAppPath(asarPath);
    app.name = name;
    // Multi-account: `--nc-profile=work` gets its own Discord data folder (+ Discord's --multi-instance)
    const profile = /^--nc-profile=([\w.-]{1,64})$/.exec(process.argv.find(a => a.startsWith("--nc-profile=")) ?? "")?.[1];
    app.setPath("userData", join(app.getPath("appData"), profile ? `${name}-${profile}` : name));

    if (require.main) require.main.filename = entry;
    log(`Loading Discord from ${asarPath} (${name})`);
    (Module as unknown as { _load: (p: string, parent: unknown, isMain: boolean) => unknown })._load(entry, null, true);
}

function main(): void {
    log(`v${NEXUSCORD_VERSION} starting - Electron ${process.versions.electron}, resources: ${process.resourcesPath}, dist: ${dirname(PRELOAD_PATH)}`);
    try {
        applyCommandLine();
    } catch (e) {
        log("Failed to apply command line switches:", e);
    }
    patchElectronExports();
    registerIpc();
    registerFeatureIpc();
    if (SAFE_MODE) log("Safe mode active");

    app.whenReady().then(() => {
        try {
            installSessionHooks();
        } catch (e) {
            log("Session hooks failed:", e);
        }
        try {
            initLinkShieldMain();
        } catch (e) {
            log("LinkShield init failed:", e);
        }
        try {
            initFeatures();
        } catch (e) {
            log("Feature init failed:", e);
        }
        try {
            initAutoRepatch(log);
        } catch (e) {
            log("Auto re-patch failed:", e);
        }
    });

    // Opacity / Mica / Acrylic / icon apply live when the Window settings change
    let lastWindow = JSON.stringify(settings.window);
    onSettingsChange(s => {
        const next = JSON.stringify(s.window);
        if (next === lastWindow) return;
        lastWindow = next;
        for (const win of electron.BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed() && originalPreloads.has(win.webContents.id)) applyWindowSettings(win);
        }
    });

    loadDiscord();
}

main();
