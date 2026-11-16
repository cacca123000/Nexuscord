// Loads the REAL Discord web client (discord.com/login) with dist/renderer.js injected
// exactly like the preload does (before Discord's scripts), then runs probe expressions.
// Usage: node test/real/probe.mjs [file-with-js-expression-returning-json]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function openDiscord({ url = "https://discord.com/login", locale = "en-US" } = {}) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript({ content: readFileSync(join(root, "dist", "renderer.js"), "utf8") });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && /NexusCord/.test(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.NexusCord?.Webpack?.require && Object.keys(window.NexusCord.Webpack.require.m).length > 1000, null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    return { browser, page, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { browser, page, errors } = await openDiscord({ url: process.env.PROBE_URL || "https://discord.com/login" });
    const expr = process.argv[2] ? readFileSync(process.argv[2], "utf8") : "({ modules: Object.keys(NexusCord.Webpack.require.m).length, cache: Object.keys(NexusCord.Webpack.cache).length })";
    console.log(JSON.stringify(await page.evaluate(expr), null, 1));
    console.log("errors:", errors);
    await browser.close();
}
