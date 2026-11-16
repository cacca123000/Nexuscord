// Headless smoke test: loads dist/renderer.js into a fake Discord page.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // global install is fine (NODE_PATH)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error" && !m.text().includes("by broken")) errors.push(m.text()); });
await page.goto("file://" + join(here, "fake-discord", "index.html"));
await page.waitForFunction(() => window.__discordBooted && window.NexusCord);

const results = {};
const check = (name, ok, extra = "") => { results[name] = ok; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); };

check("webpack require captured", await page.evaluate(() => !!NexusCord.Webpack.require));
check("findByProps", await page.evaluate(() => typeof NexusCord.Webpack.findByProps("sendMessage", "editMessage")?.sendMessage === "function"));
check("findStore", await page.evaluate(() => NexusCord.Webpack.findStore("UserStore")?.getCurrentUser().id === "111"));
check("flux hooked", await page.evaluate(() => !!NexusCord.Flux.Dispatcher));
check("flux intercept", await page.evaluate(() => {
    let seen = false;
    const un = NexusCord.Flux.intercept("test", a => { if (a.type === "TEST_BLOCK") return true; });
    NexusCord.Flux.subscribe("TEST_BLOCK", () => (seen = true));
    NexusCord.Flux.Dispatcher.dispatch({ type: "TEST_BLOCK" });
    un();
    return !seen;
}));
check("i18n default en", await page.evaluate(() => NexusCord.I18n.getLanguage() === "en"));
await page.evaluate(() => { document.documentElement.lang = "it"; });
await page.waitForTimeout(50);
check("i18n follows Discord -> it", await page.evaluate(() => NexusCord.I18n.getLanguage() === "it" && NexusCord.I18n.t("tabs.themes") === "Temi"));
await page.evaluate(() => NexusCord.Flux.Dispatcher.dispatch({ type: "LOCALE_UPDATE", locale: "en-GB" }));
check("i18n LOCALE_UPDATE -> en", await page.evaluate(() => NexusCord.I18n.getLanguage() === "en"));

check("patcher before/after/instead", await page.evaluate(() => {
    const obj = { f(a) { return a * 2; } };
    const u1 = NexusCord.Patcher.before("t", obj, "f", (_, args) => [args[0] + 1]);
    const u2 = NexusCord.Patcher.after("t", obj, "f", (_, __, r) => r + 100);
    const u3 = NexusCord.Patcher.instead("t", obj, "f", (_, args, orig) => orig(...args) * 10);
    const bad = NexusCord.Patcher.after("broken", obj, "f", () => { throw new Error("boom"); });
    const r = obj.f(1); // (1+1)*2=4 *10=40 +100=140
    u1(); u2(); u3(); bad();
    return r === 140 && obj.f(1) === 2 && !obj.f.toString().includes("record");
}));

await page.keyboard.press("Control+Alt+KeyN");
await page.waitForSelector(".nc-panel");
check("panel opens with Ctrl+Alt+N", true);
if (shots) await page.screenshot({ path: join(shots, "panel-plugins-en.png") });

console.log(errors.length ? "Page errors:\n  " + errors.join("\n  ") : "No page errors");
await browser.close();
process.exit(Object.values(results).every(Boolean) && !errors.length ? 0 : 1);
