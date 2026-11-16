// Renders Discord's REAL User Settings screen (the component the gear icon opens) with
// NexusCord injected, then checks that the NexusCord section appears in the sidebar and
// its page renders - and that nothing crashes ("Well, this is awkward" regression, 2.0.1).
//
// The web client is logged out, so the settings modules are loaded straight from the
// asset cache (.cache/discord-assets) and the current user is faked.
// Usage: node test/real/settings-render.mjs   (after `node test/real/scanAssets.mjs`)
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(root, ".cache", "discord-assets");
if (!existsSync(CACHE) || readdirSync(CACHE).length < 100) {
    console.error("Discord asset cache missing - run: node test/real/scanAssets.mjs");
    process.exit(2);
}

// module id -> chunk file, and the settings modal module (found by content, not by id)
const moduleFile = {};
let modalId = null;
for (const f of readdirSync(CACHE)) {
    if (!f.endsWith(".js") || f.startsWith("web.")) continue;
    const txt = readFileSync(join(CACHE, f), "utf8");
    if (!txt.slice(0, 300).includes(".push([[")) continue;
    const ids = [...txt.matchAll(/[{,](\d{1,7})\((?:[\w$]+(?:,[\w$]+)*)?\)\{/g)];
    for (const m of ids) moduleFile[m[1]] ??= f;
    const at = txt.indexOf("[SettingsSubnavigationCategory]");
    if (at >= 0 && txt.includes("defaultTarget:")) modalId = ids.filter(m => m.index < at).pop()?.[1] ?? modalId;
}
if (!modalId) {
    console.error("FAIL  could not locate Discord's settings modal module in the cache");
    process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 860 } });
await ctx.addInitScript({ content: readFileSync(join(root, "dist", "renderer.js"), "utf8") });
await ctx.route(/discord\.com\/assets\/[^/?]+\.js/, route => {
    const p = join(CACHE, new URL(route.request().url()).pathname.split("/").pop());
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(p, "utf8") });
    return route.continue();
});
const page = await ctx.newPage();
await page.goto("https://discord.com/app", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => (window.NexusCord?.Webpack?.instances ?? []).some(r => Object.keys(r.m).length > 10000), null, { timeout: 90000 });

const result = await page.evaluate(async ({ moduleFile, modalId }) => {
    const W = Symbol.for("NexusCord.wrappedFactory");
    const r = NexusCord.Webpack.instances.reduce((a, b) => (Object.keys(b.m).length > Object.keys(a.m).length ? b : a));
    const seen = new Set();
    const files = new Set();
    async function ensure(id) {
        if (seen.has(id)) return;
        seen.add(id);
        if (!r.m[id]) {
            const f = moduleFile[id];
            if (f == null || files.has(f)) return;
            files.add(f);
            try {
                (0, eval)(await fetch("https://discord.com/assets/" + f).then(x => x.text()));
            } catch { /* chunk not usable here */ }
            if (!r.m[id]) return;
        }
        const src = String(r.m[id][W] ?? r.m[id]);
        for (const m of src.matchAll(/[(,](\d{2,7})\)/g)) await ensure(m[1]);
    }
    await ensure(String(modalId));
    // Modules missing from the cache (mostly CSS class maps) become harmless stubs
    for (const id of seen) {
        if (!r.m[id] && id.length >= 5) r.m[id] = (e) => { e.exports = new Proxy({}, { get: (_, k) => (k === "__esModule" ? true : typeof k === "string" ? "stub_" + k : undefined) }); };
    }
    const React = NexusCord.Discord.React.__nc_resolved;
    const ReactDOM = NexusCord.Discord.ReactDOMClient.__nc_resolved;
    const UserStore = NexusCord.Webpack.findStore("UserStore");
    const user = new Proxy({ id: "1", username: "test", globalName: "Test", discriminator: "0", avatar: null, flags: 0, premiumType: 0, verified: true, email: "a@b.c", isProvisional: false },
        { get: (o, k) => (k in o ? o[k] : typeof k === "string" ? () => false : undefined) });
    UserStore.getCurrentUser = () => user;
    UserStore.getUser = () => user;
    const modal = r(modalId).default;

    const out = {};
    class Boundary extends React.Component {
        constructor(p) { super(p); this.state = {}; }
        static getDerivedStateFromError(e) { return { e }; }
        componentDidCatch(e, info) { out.crash = String(e?.stack ?? e).slice(0, 1500) + "\n" + String(info?.componentStack).slice(0, 800); }
        render() { return this.state.e ? null : this.props.children; }
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(React.createElement(Boundary, null, React.createElement(modal, { transitionState: 1, onClose() {}, target: "nexuscord_plugins_panel" })));
    await new Promise(res => setTimeout(res, 4000));
    out.sidebar = [...host.querySelectorAll('[data-settings-sidebar-item^="nexuscord"]')].map(e => e.innerText.trim());
    out.discordItems = host.querySelectorAll("[data-settings-sidebar-item]").length;
    out.pageText = (host.querySelector(".nc-settings-host .nc-page")?.innerText ?? "").slice(0, 200);
    return out;
}, { moduleFile, modalId });
await browser.close();

const checks = {
    "settings screen renders without crashing": !result.crash || result.crash,
    "Discord's own sidebar entries are present": result.discordItems > 10 || `only ${result.discordItems}`,
    "NexusCord section has 7 sidebar entries": result.sidebar.length === 7 || JSON.stringify(result.sidebar),
    "NexusCord Plugins page renders inside Discord": /Built-in/.test(result.pageText) || JSON.stringify(result.pageText)
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
    if (ok !== true) failed++;
    console.log(`${ok === true ? "PASS" : "FAIL"}  ${name}${ok === true ? "" : "  -> " + ok}`);
}
console.log(`\n${4 - failed}/4 settings-render checks passed`);
process.exit(failed ? 1 : 0);
