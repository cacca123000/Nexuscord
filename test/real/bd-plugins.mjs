// BetterDiscord store compatibility run.
// Loads the REAL Discord web client with NexusCord injected, makes every cached Discord
// module available, then loads + starts every plugin from the BetterDiscord store through
// NexusCord's BdApi and records what breaks.
//
//   node test/real/bd-plugins.mjs [--only Name1,Name2] [--write]
//
// Needs .cache/discord-assets (scanAssets.mjs) and .cache/bd-plugins (downloaded by this
// script on first run). --write updates src/renderer/data/bdCompat.json, which the plugin
// store uses to show which add-ons were verified to work in NexusCord.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(root, ".cache", "discord-assets");
const BD = join(root, ".cache", "bd-plugins");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

mkdirSync(BD, { recursive: true });
if (!existsSync(join(BD, "store.json"))) {
    const r = await fetch("https://api.betterdiscord.app/v3/store/addons");
    writeFileSync(join(BD, "store.json"), await r.text());
}
const store = JSON.parse(readFileSync(join(BD, "store.json"), "utf8")).filter(a => a.type === "plugin");
for (const a of store) {
    const f = join(BD, a.file_name);
    if (existsSync(f)) continue;
    const r = await fetch(a.latest_source_url);
    if (r.ok) writeFileSync(f, await r.text());
}
const targets = store.filter(a => existsSync(join(BD, a.file_name)) && (!only || only.includes(a.name)));

const browser = await chromium.launch();
const chunkFiles = readdirSync(CACHE).filter(f => f.endsWith(".js") && !f.startsWith("web.")).filter(f => readFileSync(join(CACHE, f), "utf8").slice(0, 300).includes(".push([["));
const libs = store.filter(a => a.name === "BDFDB");

/** Opens Discord with every cached module available and the plugin libraries loaded. */
async function openDiscord() {
    const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript({ content: readFileSync(join(root, "dist", "renderer.js"), "utf8") });
    await ctx.route(/discord\.com\/assets\/[^/?]+\.js/, route => {
        const p = join(CACHE, new URL(route.request().url()).pathname.split("/").pop());
        if (existsSync(p)) return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(p, "utf8") });
        return route.continue();
    });
    // Plugins love to phone home (update checks, libraries): answer locally
    await ctx.route(/raw\.githubusercontent\.com|betterdiscord\.app|github\.com/, route => route.fulfill({ status: 404, body: "" }));
    const page = await ctx.newPage();
    await page.goto("https://discord.com/app", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => (window.NexusCord?.Webpack?.instances ?? []).some(r => Object.keys(r.m).length > 10000), null, { timeout: 90000 });
    const stats = await page.evaluate(async files => {
        const r = NexusCord.Webpack.instances.reduce((a, b) => (Object.keys(b.m).length > Object.keys(a.m).length ? b : a));
        let loaded = 0;
        for (const f of files) {
            try {
                (0, eval)(await fetch("https://discord.com/assets/" + f).then(x => x.text()));
                loaded++;
            } catch { /* worker-only chunk etc. */ }
        }
        let executed = 0;
        const t0 = performance.now();
        for (const id of Object.keys(r.m)) {
            if (r.c[id]) continue;
            try { r(id); executed++; } catch { /* expected for some */ }
            if (performance.now() - t0 > 240000) break;
        }
        return { loaded, modules: Object.keys(r.m).length, executed };
    }, chunkFiles);
    console.log("Discord modules:", JSON.stringify(stats));
    await page.waitForFunction(() => !!window.BdApi, null, { timeout: 30000 });
    // Libraries first (BDFDB powers ~45 store plugins); they stay loaded like in a real install
    for (const lib of libs) {
        const err = await page.evaluate(({ file, source }) => NexusCord.BdCompat.loadFromSource(file, source, true) ?? null, { file: lib.file_name, source: readFileSync(join(BD, lib.file_name), "utf8") });
        console.log(`library  ${lib.name}: ${err ?? "loaded"}`);
        await page.waitForTimeout(3000);
    }
    return { ctx, page };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
let { ctx, page } = await openDiscord();
const report = {};
for (const a of targets) {
    if (libs.includes(a)) continue;
    const source = readFileSync(join(BD, a.file_name), "utf8");
    let res;
    try {
        res = await withTimeout(page.evaluate(async ({ file, source }) => {
        const errors = [];
        const unsupported = new Set();
        const oe = console.error, ow = console.warn;
        console.error = (...x) => { errors.push(x.map(v => (v instanceof Error ? v.message : String(v))).join(" ").replace(/%c|color:[^ ]+|background:[^;]+;?/g, "").slice(0, 300)); };
        console.warn = (...x) => { const s = x.map(String).join(" "); const m = /not supported[^:]*: ?(.+)$|unsupported[^:]*: ?(.+)$/i.exec(s) ?? /BetterDiscord API (.+?) is/.exec(s); if (m) unsupported.add((m[1] ?? m[2] ?? s).slice(0, 80)); };
        const onErr = e => errors.push("uncaught: " + String(e.error?.message ?? e.message).slice(0, 300));
        const onRej = e => errors.push("rejection: " + String(e.reason?.message ?? e.reason).slice(0, 300));
        window.addEventListener("error", onErr);
        window.addEventListener("unhandledrejection", onRej);
        let error;
        try {
            error = NexusCord.BdCompat.loadFromSource(file, source, true);
        } catch (e) {
            error = "harness: " + e.message;
        }
        await new Promise(r => setTimeout(r, 1200));
        try { NexusCord.BdCompat.stop(file); } catch (e) { errors.push("stop: " + e.message); }
        window.removeEventListener("error", onErr);
        window.removeEventListener("unhandledrejection", onRej);
        console.error = oe;
        console.warn = ow;
        // Dismiss any modal/toast the plugin opened (library prompts, changelogs)
        document.querySelectorAll(".nc-layer").forEach(e => e.remove());
        return { error, errors: errors.filter(e => !/useAuthWebsocket|Remote Auth|Failed to load resource|404/.test(e)).slice(0, 5), unsupported: [...unsupported] };
        }, { file: a.file_name, source }), 20000);
    } catch (e) {
        res = { error: "hangs Discord (" + e.message + ")", errors: [], unsupported: [] };
        console.log("         (page frozen - reopening Discord)");
        await ctx.close().catch(() => {});
        ({ ctx, page } = await openDiscord());
    }
    const status = res.error ? "broken" : res.errors.length ? "partial" : "ok";
    report[a.name] = { status, ...res };
    console.log(`${status.padEnd(8)} ${a.name}${res.error ? "  -> " + res.error : res.errors.length ? "  -> " + res.errors[0] : ""}${res.unsupported.length ? "  [unsupported: " + res.unsupported.join(", ") + "]" : ""}`);
    writeFileSync(join(BD, "report.json"), JSON.stringify(report, null, 1));
}
await browser.close();

const counts = Object.values(report).reduce((c, r) => ((c[r.status] = (c[r.status] ?? 0) + 1), c), {});
console.log("\nSummary:", JSON.stringify(counts), `of ${targets.length}`);
if (args.includes("--write") && !only) {
    const out = {};
    const needs = {};
    for (const [name, r] of Object.entries(report)) out[name] = r.status;
    for (const a of store) {
        const src = existsSync(join(BD, a.file_name)) ? readFileSync(join(BD, a.file_name), "utf8") : "";
        if (a.name !== "BDFDB" && /BDFDB_Global|window\.BDFDB\b/.test(src)) needs[a.name] = "BDFDB";
        // Plugins built on libraries that no longer exist can't work
        if (/ZeresPluginLibrary|ZLibrary|XenoLib/.test(src) && !/BdApi\.Webpack/.test(src)) out[a.name] = "broken";
    }
    mkdirSync(join(root, "src", "renderer", "data"), { recursive: true });
    writeFileSync(join(root, "src", "renderer", "data", "bdCompat.json"), JSON.stringify({ testedAt: new Date().toISOString().slice(0, 10), plugins: out, needs }, null, 1) + "\n");
    console.log("Wrote src/renderer/data/bdCompat.json");
}
