// Headless smoke test: loads dist/renderer.js into a fake Discord page (test/fake-discord)
// and exercises the core + every built-in plugin. Usage: node test/smoke.mjs [screenshotDir]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright"); // a global install works too (NODE_PATH)

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
const check = (name, ok, extra = "") => { results[name] = ok; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`); };

// ---- core ------------------------------------------------------------------
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

// ---- plugins -----------------------------------------------------------------
// Prevent real navigation for links LinkShield lets through
await page.evaluate(() => document.addEventListener("click", e => e.target.closest("a") && e.preventDefault()));
const closeModals = () => page.evaluate(() => document.querySelectorAll(".nc-layer").forEach(l => l.remove()));
const modalTitle = () => page.evaluate(() => document.querySelector(".nc-modal h2")?.textContent ?? null);
const lastOpen = () => page.evaluate(() => window.__nativeCalls.filter(c => c.fn === "openExternal").at(-1)?.url ?? null);

check("default plugins running", await page.evaluate(() => ["noTrack", "linkShield", "lowRamOptimizer", "windowTweaks"].every(id => NexusCord.Plugins.isRunning(id))));

await page.click("#l-spoof");
check("LinkShield: spoofed link", (await modalTitle()) === "Spoofed link detected", await modalTitle());
if (shots) await page.screenshot({ path: join(shots, "linkshield-spoof.png") });
await closeModals();
await page.click("#l-typo");
check("LinkShield: typosquat disc0rd.com", (await modalTitle()) === "Lookalike domain detected", await modalTitle());
await closeModals();
await page.click("#l-sub");
check("LinkShield: brand in subdomain", (await modalTitle()) === "Lookalike domain detected", await modalTitle());
await closeModals();
await page.click("#l-phish");
check("LinkShield: phishing blacklist", (await modalTitle()) === "Phishing link blocked", await modalTitle());
await closeModals();
await page.click("#l-exe");
check("LinkShield: executable guard", (await modalTitle()) === "Potentially dangerous download" && (await page.isVisible("text=Check on VirusTotal")), await modalTitle());
await closeModals();
await page.click("#l-track");
check("LinkShield: tracker stripping", (await lastOpen()) === "https://example.com/page?id=7", await lastOpen());
await page.click("#l-short");
await page.waitForSelector(".nc-modal");
check("LinkShield: unshortener", (await modalTitle()) === "Shortened link resolved" && (await page.textContent(".nc-url")) === "https://example.org/real-page?x=1", await modalTitle());
await page.click("text=Continue");
check("LinkShield: unshortened+cleaned opened", (await lastOpen()) === "https://example.org/real-page?x=1", await lastOpen());
const before = await page.evaluate(() => window.__nativeCalls.length);
await page.click("#m-normal a");
await page.waitForTimeout(50);
check("LinkShield: clean link untouched", (await page.evaluate(() => window.__nativeCalls.length)) === before && !(await modalTitle()));
const stats = await page.evaluate(() => NexusCord.Settings.get().linkShieldStats);
check("LinkShield: stats counted", stats.spoofsBlocked === 1 && stats.typosquatsFlagged === 2 && stats.phishingBlocked === 1 && stats.executablesIntercepted === 1 && stats.trackersStripped >= 3 && stats.linksUnshortened === 1, JSON.stringify(stats));

check("NoTrack: /science answered locally", await page.evaluate(async () => (await fetch("https://discord.com/api/v9/science", { method: "POST" })).status === 204));

await page.evaluate(() => NexusCord.Plugins.setPluginEnabled("messageLogger", true));
await page.evaluate(() => {
    const D = NexusCord.Flux.Dispatcher;
    D.dispatch({ type: "MESSAGE_UPDATE", message: { id: "m1", channel_id: "c1", content: "edited text" } });
    D.dispatch({ type: "MESSAGE_DELETE", id: "m1", channelId: "c1" });
});
await page.waitForTimeout(50);
const mlCss = await page.evaluate(() => document.getElementById("nc-message-logger")?.textContent ?? "");
check("MessageLogger: deleted badge", mlCss.includes("#chat-messages-c1-m1") && mlCss.includes('"Deleted"'), mlCss.slice(0, 200));
check("MessageLogger: edit history", mlCss.includes("[Edited] original text"));
const badge = await page.evaluate(() => getComputedStyle(document.getElementById("message-content-m1"), "::after").content);
check("MessageLogger: badge rendered", badge === '"Deleted"', badge);

await page.evaluate(() => NexusCord.Plugins.setPluginEnabled("fakeNitro", true));
await page.evaluate(() => NexusCord.Webpack.findByProps("sendMessage", "editMessage").sendMessage("c1", {
    content: "hi <:pepe:123> and <a:dance:456> and <:local:789>",
    validNonShortcutEmojis: [{ id: "123", name: "pepe", guildId: "other" }, { id: "456", name: "dance", animated: true, guildId: "g1" }, { id: "789", name: "local", guildId: "g1" }]
}));
const sent = await page.evaluate(() => window.__sent.msg.content);
check("FakeNitro: emoji rewrite", sent === "hi https://cdn.discordapp.com/emojis/123.webp?size=48&quality=lossless&name=pepe and https://cdn.discordapp.com/emojis/456.gif?size=48&quality=lossless&name=dance and <:local:789>", sent);

await page.evaluate(() => NexusCord.Plugins.setPluginEnabled("showHiddenChannels", true));
const listed = await page.evaluate(() => NexusCord.Webpack.findStore("GuildChannelStore").getChannels("g1").SELECTABLE.map(e => e.channel.name).join(","));
check("ShowHiddenChannels: hidden channel listed", listed === "general,mods-only", listed);
await page.click("[data-list-item-id='channels___1180000000000000000']");
check("ShowHiddenChannels: read-only modal", (await modalTitle()) === "Hidden channel: #mods-only" && (await page.isVisible("text=Moderator")) && (await page.isVisible("text=30 seconds")), await modalTitle());
if (shots) await page.screenshot({ path: join(shots, "hidden-channel.png") });
await closeModals();

await page.waitForFunction(() => window.BdApi, null, { timeout: 20000 });
check("BdApi: external plugin loaded", await page.evaluate(() => typeof BdApi?.Webpack?.getByKeys === "function" && !!BdApi.Plugins.get("HelloBD")));
await page.evaluate(() => BdApi.Plugins.enable("HelloBD"));
check("BdApi: plugin start()", await page.evaluate(() => window.__bdStarted === true && !!document.getElementById("bd-style-hello")));
await page.evaluate(() => NexusCord.Themes.setEnabled("Midnight.theme.css", true));
check("Themes: theme CSS injected", await page.evaluate(() => document.getElementById("nc-theme-Midnight_theme_css")?.textContent === ".nc-themed{color:red}"));
check("Themes: QuickCSS injected", await page.evaluate(() => !!document.getElementById("nc-quickcss")));

// ---- settings panel ------------------------------------------------------------
await page.keyboard.press("Control+Alt+KeyN");
await page.waitForSelector(".nc-panel");
check("panel opens with Ctrl+Alt+N", true);
if (shots) await page.screenshot({ path: join(shots, "panel-plugins-en.png") });
await page.evaluate(() => { document.documentElement.lang = "it"; });
await page.waitForTimeout(50);
check("panel re-renders live in Italian", await page.isVisible("text=Prestazioni e sicurezza"));
if (shots) await page.screenshot({ path: join(shots, "panel-plugins-it.png") });
await page.click(".nc-tab:has-text('Temi')");
if (shots) await page.screenshot({ path: join(shots, "panel-themes-it.png") });
await page.click(".nc-tab:has-text('Prestazioni e sicurezza')");
await page.waitForTimeout(300);
if (shots) await page.screenshot({ path: join(shots, "panel-perf-it.png") });
await page.keyboard.press("Control+Alt+KeyN");
check("panel closes with Ctrl+Alt+N", !(await page.isVisible(".nc-panel")));

console.log(errors.length ? "Page errors:\n  " + errors.join("\n  ") : "No page errors");
await browser.close();
const failed = Object.entries(results).filter(([, ok]) => !ok).map(([n]) => n);
console.log(`\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} checks passed`);
process.exit(!failed.length && !errors.length ? 0 : 1);
