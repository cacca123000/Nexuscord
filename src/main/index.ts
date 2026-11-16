/*
 * NexusCord injector - Electron main process entry point.
 *
 * Loaded by <Discord>/app-x/resources/app/index.js (written by the installer).
 * Electron prefers the `app` folder over `app.asar`, so we run first, set up
 * our hooks, then hand control to Discord's real app.asar.
 */
import electron, { app, BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { existsSync, readFileSync } from "fs";
import Module from "module";
import { dirname, join } from "path";
import { isPluginEnabled } from "../shared/settings";
import { initAutoRepatch } from "./autoRepatch";
import { consumeAllowOnce, isHttpUrl, notifyLinkBlocked, originalPreloads, registerIpc } from "./ipc";
import { initLinkShieldMain, isPhishingHost } from "./linkShieldMain";
import { ensureDataDirs } from "./paths";
import { getSettings, onSettingsChange } from "./settings";
import { installWebRequestHooks, isTrackingUrl, stripCsp } from "./webRequest";

const log = (...a: unknown[]) => console.log("[NexusCord]", ...a);

ensureDataDirs();
const settings = getSettings();

// ---------------------------------------------------------------------------
// 1. Low-RAM Chromium / V8 switches (must happen before app ready)
// ---------------------------------------------------------------------------
function applyCommandLine(): void {
    const perf = settings.performance;
    const cl = app.commandLine;
    if (perf.maxOldSpaceSize > 0) {
        const existing = cl.hasSwitch("js-flags") ? cl.getSwitchValue("js-flags") + " " : "";
        cl.appendSwitch("js-flags", `${existing}--max-old-space-size=${perf.maxOldSpaceSize}`.trim());
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

            const s = getSettings();
            if (
                process.platform === "win32" &&
                options.title &&
                isPluginEnabled(s, "windowTweaks") &&
                s.plugins.windowTweaks?.acrylic === true
            ) {
                options.backgroundMaterial = "acrylic";
                options.backgroundColor = "#00000000";
            }
        }
        const win = Reflect.construct(target, args, newTarget) as BrowserWindow;
        if (original) originalPreloads.set(win.webContents.id, original);
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
    const candidates = ["app.asar", "_app.asar"].map(f => join(process.resourcesPath, f));
    const asarPath = candidates.find(p => existsSync(p));
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
    app.setPath("userData", join(app.getPath("appData"), name));

    if (require.main) require.main.filename = entry;
    log(`Loading Discord from ${asarPath} (${name})`);
    (Module as unknown as { _load: (p: string, parent: unknown, isMain: boolean) => unknown })._load(entry, null, true);
}

function main(): void {
    log(`v${NEXUSCORD_VERSION} starting (data: ${dirname(PRELOAD_PATH)})`);
    try {
        applyCommandLine();
    } catch (e) {
        log("Failed to apply command line switches:", e);
    }
    patchElectronExports();
    registerIpc();

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
            initAutoRepatch();
        } catch (e) {
            log("Auto re-patch failed:", e);
        }
    });

    let lastAcrylic = isPluginEnabled(settings, "windowTweaks") && settings.plugins.windowTweaks?.acrylic === true;
    onSettingsChange(s => {
        // Acrylic can be toggled live on Windows 11
        const on = isPluginEnabled(s, "windowTweaks") && s.plugins.windowTweaks?.acrylic === true;
        if (on === lastAcrylic) return;
        lastAcrylic = on;
        for (const win of electron.BrowserWindow.getAllWindows()) {
            if (win.isDestroyed() || !originalPreloads.has(win.webContents.id) || !win.setBackgroundMaterial) continue;
            try {
                win.setBackgroundMaterial(on ? "acrylic" : "none");
            } catch { /* unsupported OS */ }
        }
    });

    loadDiscord();
}

main();
