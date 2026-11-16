// Boots dist/injector.js under a mocked "electron" module and a fake resources/app.asar
// to verify the main-process bootstrap: preload swap, CSP stripping, telemetry blocking,
// Discord listener chaining and handing control to Discord's entry point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

test("injector boots Discord with NexusCord hooks", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "nc-injector-"));
    const resources = join(sandbox, "resources");
    // Installed layout: Discord's archive renamed to _app.asar (a plain folder stands in for
    // the archive here) and resources/app.asar is the NexusCord loader folder.
    const asar = join(resources, "_app.asar");
    mkdirSync(join(resources, "app.asar"), { recursive: true });
    writeFileSync(join(resources, "app.asar", "index.js"), "// NexusCord shim");
    mkdirSync(asar, { recursive: true });
    writeFileSync(join(asar, "package.json"), JSON.stringify({ name: "discord", productName: "Discord", main: "app_bootstrap/index.js" }));
    mkdirSync(join(asar, "app_bootstrap"));
    writeFileSync(
        join(asar, "app_bootstrap", "index.js"),
        `const { BrowserWindow, session } = require("electron");
         globalThis.__discordWin = new BrowserWindow({ title: "Discord", webPreferences: { preload: "C:/discord/mainScreenPreload.js", contextIsolation: true } });
         session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, "X-Discord": ["1"] } }));
         globalThis.__discordBooted = true;`
    );
    const distDir = join(sandbox, "dist");
    mkdirSync(distDir);
    for (const f of ["injector.js", "preload.js", "renderer.js"]) copyFileSync(join(root, "dist", f), join(distDir, f));

    // ---- mocked electron -------------------------------------------------------
    const switches = {};
    let headersListener, beforeListener;
    const ipcHandlers = new Map();
    class BrowserWindow extends EventEmitter {
        static all = [];
        constructor(opts) {
            super();
            this.opts = opts;
            this.webContents = { id: BrowserWindow.all.length + 1, send() {}, isDestroyed: () => false };
            BrowserWindow.all.push(this);
        }
        static getAllWindows() { return BrowserWindow.all; }
        static fromWebContents() { return null; }
        isDestroyed() { return false; }
    }
    const webRequest = {
        onHeadersReceived: l => (headersListener = l),
        onBeforeRequest: l => (beforeListener = l)
    };
    let readyCb;
    const electron = {
        app: Object.assign(new EventEmitter(), {
            name: "electron",
            commandLine: { appendSwitch: (k, v = "") => (switches[k] = v), hasSwitch: k => k in switches, getSwitchValue: k => switches[k] },
            whenReady: () => new Promise(r => (readyCb = r)),
            getPath: () => join(sandbox, "appData"),
            setPath() {},
            setAppPath(p) { this.appPath = p; },
            getAppMetrics: () => [],
            relaunch() {},
            exit() {}
        }),
        BrowserWindow,
        ipcMain: { on: (c, f) => ipcHandlers.set(c, f), handle: (c, f) => ipcHandlers.set(c, f) },
        session: { defaultSession: { webRequest } },
        shell: { openExternal: async () => {}, openPath: async () => "" },
        net: { fetch: async () => { throw new Error("offline"); } }
    };
    const origLoad = Module._load;
    Module._load = function (request, ...rest) {
        if (request === "electron") return electron;
        return origLoad.call(this, request, ...rest);
    };
    process.resourcesPath = resources;
    process.env.NEXUSCORD_DATA_DIR = join(sandbox, "data");

    try {
        require(join(distDir, "injector.js"));
        // Discord ran and created its window through our proxy
        assert.equal(globalThis.__discordBooted, true);
        const win = globalThis.__discordWin;
        assert.equal(win.opts.webPreferences.preload, join(distDir, "preload.js"));
        assert.equal(win.opts.webPreferences.sandbox, false);
        assert.ok(win instanceof BrowserWindow);
        // Original preload is handed back to our preload over IPC
        const ev = { sender: win.webContents, returnValue: undefined };
        ipcHandlers.get("nexuscord:get-preload")(ev);
        assert.equal(ev.returnValue, "C:/discord/mainScreenPreload.js");
        assert.equal(electron.app.appPath, asar);
        assert.equal(electron.app.name, "Discord");
        assert.match(switches["js-flags"], /--max-old-space-size=512/);
        assert.ok("process-per-site" in switches && "enable-gpu-rasterization" in switches);
        assert.ok(!("disable-background-timer-throttling" in switches), "throttling stays enabled by default (saves CPU/RAM when minimized)");

        // app ready -> session hooks. Discord registered its listener BEFORE ready in this
        // mock, so re-register the way Discord does after ready:
        readyCb();
        await new Promise(r => setTimeout(r, 10));
        electron.session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, "X-Discord": ["1"] } }));

        const headers = await new Promise(resolve =>
            headersListener({ url: "https://discord.com/app", responseHeaders: { "Content-Security-Policy": ["default-src 'self'"], "X-Keep": ["1"] } }, r => resolve(r.responseHeaders))
        );
        assert.equal(headers["Content-Security-Policy"], undefined, "CSP stripped");
        assert.deepEqual(headers["X-Discord"], ["1"], "Discord's own listener still runs");
        assert.deepEqual(headers["X-Keep"], ["1"]);

        const blocked = await new Promise(resolve => beforeListener({ url: "https://discord.com/api/v9/science" }, resolve));
        assert.equal(blocked.cancel, true, "telemetry blocked");
        const allowed = await new Promise(resolve => beforeListener({ url: "https://discord.com/api/v9/users/@me" }, resolve));
        assert.ok(!allowed.cancel, "normal API allowed");
    } finally {
        Module._load = origLoad;
    }
});
