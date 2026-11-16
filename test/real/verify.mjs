// REAL-Discord verification harness.
//  1. Opens discord.com/app in Chromium with dist/renderer.js injected like the preload does.
//  2. Serves every /assets/*.js chunk from .cache/discord-assets (see scanAssets.mjs), so all
//     ~7000 chunks can be registered without hitting Cloudflare rate limits.
//  3. Executes every module (errors ignored) so NexusCord's finders see the full client.
//  4. Runs the checks in test/real/checks.js and prints PASS/FAIL per NexusCord hook.
// Usage: node test/real/verify.mjs   (run `node test/real/scanAssets.mjs` once first)
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 860 } });
await ctx.addInitScript({ content: readFileSync(join(root, "dist", "renderer.js"), "utf8") });
await ctx.route(/discord\.com\/assets\/[^/?]+\.js/, route => {
    const file = new URL(route.request().url()).pathname.split("/").pop();
    const p = join(CACHE, file);
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(p, "utf8") });
    return route.continue();
});
const page = await ctx.newPage();
const ncErrors = [];
page.on("console", m => {
    if (m.type() === "error" && m.text().includes("NexusCord")) ncErrors.push(m.text().replace(/%c|color:[^ ]+|background:[^ ]+/g, "").slice(0, 300));
});
await page.goto("https://discord.com/app", { waitUntil: "domcontentloaded", timeout: 90000 });
// Discord runs several webpack runtimes; wait for the MAIN one (web.js, >10k modules)
await page.waitForFunction(() => (window.NexusCord?.Webpack?.instances ?? []).some(r => Object.keys(r.m).length > 10000), null, { timeout: 90000 });

// Chunks containing code NexusCord patches are loaded FIRST (bulk-loading thousands of
// unrelated chunks - some are worker-only - can break later chunk registration).
const PRIORITY_NEEDLES = [".buildLayout().map(", '"dQw4w9WgXcQ:"', 'type:"USER_SETTINGS_MODAL_OPEN"'];
const priority = new Set();
for (const f of readdirSync(CACHE)) {
    if (!f.endsWith(".js")) continue;
    const txt = readFileSync(join(CACHE, f), "utf8");
    if (!PRIORITY_NEEDLES.some(n => txt.includes(n))) continue;
    const m = /\.push\(\[\[([\d,]+)\]/.exec(txt);
    if (m) m[1].split(",").forEach(id => priority.add(+id));
}
await page.evaluate(async ids => {
    const r = NexusCord.Webpack.instances.reduce((a, b) => (Object.keys(b.m).length > Object.keys(a.m).length ? b : a));
    for (const id of ids) await r.e(id).catch(() => {});
}, [...priority]);
console.log("Priority chunks:", [...priority].join(", ") || "none");

// Register every cached chunk directly (deterministic - no network, no rate limits),
// then execute every module so NexusCord's finders see the whole client.
const chunkFiles = readdirSync(CACHE).filter(f => f.endsWith(".js") && !f.startsWith("web.") && readFileSync(join(CACHE, f), "utf8").slice(0, 300).includes(".push([["));
const stats = await page.evaluate(async files => {
    const r = NexusCord.Webpack.instances.reduce((a, b) => (Object.keys(b.m).length > Object.keys(a.m).length ? b : a));
    let ok = 0, fail = 0;
    for (const f of files) {
        try {
            (0, eval)(await fetch("https://discord.com/assets/" + f).then(x => x.text()));
            ok++;
        } catch {
            fail++;
        }
    }
    let executed = 0, threw = 0;
    const t0 = performance.now();
    for (const id of Object.keys(r.m)) {
        if (r.c[id]) continue;
        try { r(id); executed++; } catch { threw++; }
        if (performance.now() - t0 > 240000) break;
    }
    return { chunks: files.length, ok, fail, modules: Object.keys(r.m).length, executed, threw };
}, chunkFiles);
console.log("Real Discord:", JSON.stringify(stats));
if (process.env.INSPECT) { await page.evaluate(n => (window.__inspect = n), process.env.INSPECT); }
if (process.env.EVAL) console.log("eval:", JSON.stringify(await page.evaluate(readFileSync(process.env.EVAL, "utf8")), null, 1));

if (process.env.INSPECT) console.log("inspect:", JSON.stringify(await page.evaluate(readFileSync(join(root, "test", "real", "inspect.js"), "utf8")), null, 1));
const checks = readFileSync(join(root, "test", "real", "checks.js"), "utf8");
const results = await page.evaluate(checks);
let failed = 0;
for (const [name, res] of Object.entries(results)) {
    const ok = res === true;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(res)}`);
}
if (ncErrors.length) console.log("NexusCord errors:\n  " + [...new Set(ncErrors)].slice(0, 15).join("\n  "));
console.log(`\n${Object.keys(results).length - failed}/${Object.keys(results).length} real-Discord checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
