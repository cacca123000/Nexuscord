// Stand-in for the Electron preload bridge: records calls so the test can assert on them.
(() => {
    let settings = null;
    const calls = (window.__nativeCalls = []);
    const noop = () => () => {};
    window.NexusCordNative = {
        version: "test", platform: "win32",
        settings: { get: () => settings ?? {}, set: async s => ((settings = JSON.parse(JSON.stringify(s))), true), paths: () => ({ data: "C:\\Users\\me\\AppData\\Roaming\\NexusCord", themes: "C:\\...\\themes", plugins: "C:\\...\\plugins" }) },
        themes: {
            list: async () => [{ file: "Midnight.theme.css", meta: { name: "Midnight", author: "refact0r", description: "A dark, rounded discord theme.", version: "2.0.1" }, source: ".nc-themed{color:red}" },
                               { file: "Glass.theme.css", meta: { name: "ClearVision Glass", author: "ClearVision Team", description: "Frosted glass with blur effects.", version: "7.0.0" }, source: "" }],
            onChange: noop, getQuickCss: async () => "/* my quick css */\n.theme-dark { --brand-500: #7c5cff; }", setQuickCss: async () => true, onQuickCssChange: noop
        },
        plugins: {
            list: async () => [{ file: "Hello.plugin.js", meta: { name: "HelloBD", author: "tester", description: "BD plugin smoke test", version: "1.0.0" },
              source: "module.exports = class { start(){ window.__bdStarted = true; BdApi.DOM.addStyle('hello', '.x{}'); } stop(){ window.__bdStarted = false; } getSettingsPanel(){ const d = document.createElement('div'); d.textContent='hi'; return d; } };" }],
            onChange: noop, loadData: () => ({}), saveData: async () => true
        },
        shell: { openFolder: async () => "", openExternal: async (url, opts) => (calls.push({ fn: "openExternal", url, opts }), true) },
        perf: { memory: async () => ({ totalMB: 412, processes: [1, 2, 3, 4, 5], main: {} }), rendererMemory: () => ({ rss: 0, heapUsed: 98 * 1048576, heapTotal: 140 * 1048576, external: 0 }),
                purgeCache: async () => true, clearWebFrameCache: () => calls.push({ fn: "clearCache" }), relaunch: async () => {}, setAcrylic: async v => (calls.push({ fn: "acrylic", v }), true) },
        data: { load: k => (window.__data ?? {})[k] ?? null, save: async (k, d) => (((window.__data ??= {})[k] = d), true) },
        files: { pick: async () => null, saveText: async () => null, openText: async () => null, download: async (u, n, f) => (calls.push({ fn: "download", u, n, f }), "C:\\Downloads\\NexusCord\\" + n), showInFolder: async () => {} },
        net: { request: async url => (calls.push({ fn: "net", url }), url.includes("translate.googleapis.com") ? { status: 200, ok: true, body: JSON.stringify([[["Ciao mondo", "Hello world"]], null, "en"]), headers: {} } : { status: 404, ok: false, body: "", headers: {} }) },
        addons: { install: async () => ({ ok: true }), remove: async () => true },
        window: { applySettings: async () => true, action: async a => (calls.push({ fn: "window", a }), true) },
        system: {
            info: () => ({ version: "test", electron: "33", chrome: "130", node: "20", platform: "win32", arch: "x64", discord: "1.0.9175", safeMode: false, dataDir: "C:\\x", distDir: "C:\\x\\dist", profile: null }),
            safeMode: () => false, bootOk: async () => true, windowsHello: async () => false, mediaSession: async () => null,
            memHistory: async () => Array.from({ length: 60 }, (_, i) => ({ t: Date.now() - (60 - i) * 5000, total: 380 + Math.round(Math.sin(i / 6) * 40 + i), renderer: 180 + Math.round(Math.cos(i / 5) * 25), gpu: 90 + (i % 7), browser: 60 })),
            launchInstance: async () => true, checkUpdate: async () => ({ available: false, current: "2.0.0", latest: "v2.0.0" }), applyUpdate: async () => ({ ok: false }),
            setSecret: async () => true, hasSecret: () => false, gistSync: async () => ({ ok: false, error: "no token" }), onEvent: noop
        },
        linkShield: {
            isPhishing: host => /(^|\.)known-phish\.example$/.test(host),
            status: async () => ({ count: 48213, updatedAt: Date.now() - 3600e3, sources: {}, refreshing: false }),
            refresh: async () => ({ count: 48213, updatedAt: Date.now(), sources: {}, refreshing: false }),
            unshorten: async url => ({ url: "https://example.org/real-page?utm_medium=social&x=1", hops: 1 }),
            onBlocked: noop
        }
    };
})();
