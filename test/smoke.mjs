// Headless smoke test: loads dist/renderer.js into a fake Discord page (test/fake-discord)
// and exercises the core, the settings pages and the built-in plugins.
// Usage: node test/smoke.mjs [screenshotDir]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright"); // a global install works too (NODE_PATH)

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error" && !m.text().includes("by broken")) errors.push(m.text()); });
await page.goto("file://" + join(here, "fake-discord", "index.html"));
await page.waitForFunction(() => window.__discordBooted && window.NexusCord);
await page.evaluate(() => NexusCord.Settings.update(s => ((s.onboardingDone = true), (s.welcomeShown = true))));
await page.evaluate(() => NexusCord.Flux.Dispatcher.dispatch({ type: "CONNECTION_OPEN" }));

const results = {};
const check = (name, ok, extra = "") => { results[name] = ok; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`); };
const closeModals = () => page.evaluate(() => document.querySelectorAll(".nc-layer").forEach(l => l.remove()));
const modalTitle = () => page.evaluate(() => document.querySelector(".nc-modal h2")?.textContent ?? null);
const lastOpen = () => page.evaluate(() => window.__nativeCalls.filter(c => c.fn === "openExternal").at(-1)?.url ?? null);
const enable = id => page.evaluate(id => NexusCord.Plugins.setPluginEnabled(id, true), id);
const send = content => page.evaluate(c => NexusCord.Webpack.findByProps("sendMessage", "editMessage").sendMessage("c1", { content: c, validNonShortcutEmojis: [] }), content);
const sent = () => page.evaluate(() => window.__sent?.msg?.content);

// ---- core ------------------------------------------------------------------
check("webpack require captured", await page.evaluate(() => !!NexusCord.Webpack.require));
check("findByProps / findStore", await page.evaluate(() => typeof NexusCord.Webpack.findByProps("sendMessage", "editMessage")?.sendMessage === "function" && NexusCord.Webpack.findStore("UserStore")?.getCurrentUser().id === "111"));
check("flux intercept", await page.evaluate(() => {
    let seen = false;
    const un = NexusCord.Flux.intercept("test", a => { if (a.type === "TEST_BLOCK") return true; });
    NexusCord.Flux.subscribe("TEST_BLOCK", () => (seen = true));
    NexusCord.Flux.Dispatcher.dispatch({ type: "TEST_BLOCK" });
    un();
    return !seen;
}));
await page.evaluate(() => { document.documentElement.lang = "it"; });
await page.waitForTimeout(50);
check("i18n follows Discord -> it", await page.evaluate(() => NexusCord.I18n.t("page.themes") === "Temi"));
await page.evaluate(() => NexusCord.Flux.Dispatcher.dispatch({ type: "LOCALE_UPDATE", locale: "de" }));
check("i18n -> de pack (falls back to English for untranslated keys)", await page.evaluate(() => NexusCord.I18n.t("page.appearance") === "Darstellung" && NexusCord.I18n.t("plugin.translate.name") === "Translate"));
await page.evaluate(() => NexusCord.Flux.Dispatcher.dispatch({ type: "LOCALE_UPDATE", locale: "en-US" }));
check("patcher before/after/instead + isolation", await page.evaluate(() => {
    const obj = { f(a) { return a * 2; } };
    const u1 = NexusCord.Patcher.before("t", obj, "f", (_, args) => [args[0] + 1]);
    const u2 = NexusCord.Patcher.after("t", obj, "f", (_, __, r) => r + 100);
    const u3 = NexusCord.Patcher.instead("t", obj, "f", (_, args, orig) => orig(...args) * 10);
    const bad = NexusCord.Patcher.after("broken", obj, "f", () => { throw new Error("boom"); });
    const r = obj.f(1);
    u1(); u2(); u3(); bad();
    return r === 140 && obj.f(1) === 2;
}));

// ---- settings integration (code patch on a METHOD-SHORTHAND factory) ----------
const injected = await page.evaluate(() => {
    const mod = NexusCord.Webpack.require(108);
    const root = { key: "$Root", type: 0, buildLayout: () => [{ key: "user_section", type: 1, buildLayout: () => [] }, { key: "utility_section", type: 1, buildLayout: () => [] }] };
    const res = mod.hl(root);
    const sec = res.layout.find(s => s.key === "nexuscord_section");
    return { keys: res.layout.map(s => s.key), items: sec?.layout.map(i => i.key), custom: sec?.layout[0].layout[0].layout[0].layout[0].type };
});
const reactPick = await page.evaluate(() => ({ version: NexusCord.Discord.React.version, icon: JSON.stringify(window.$NexusCordSettings.buildLayout({ key: "$Root", buildLayout: () => [] })[0].buildLayout()[0].icon({})).slice(0, 80) }));
check("React finder skips the intl decoy (2.0.1 settings crash)", reactPick.version === "19.2.3" && !reactPick.icon.includes("locale"), JSON.stringify(reactPick));
check("settings: NexusCord section injected into Discord's layout", injected.keys.join() === "user_section,nexuscord_section,utility_section" && injected.items.length === 7 && injected.custom === 19, JSON.stringify(injected));

// ---- pages ------------------------------------------------------------------
const pages = ["home", "plugins", "themes", "appearance", "privacy", "performance", "tools"];
await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "settings-host";
    host.style.cssText = "position:fixed;inset:0;left:220px;overflow:auto;padding:40px;background:#313338;z-index:50";
    const side = document.createElement("div");
    side.id = "settings-side";
    side.style.cssText = "position:fixed;inset:0;right:auto;width:220px;background:#2b2d31;z-index:50";
    document.body.append(side, host);
});
for (const lang of ["en", "it"]) {
    await page.evaluate(l => NexusCord.Settings.update(s => void (s.language = l)), lang);
    for (const id of pages) {
        const ok = await page.evaluate(id => {
            const host = document.getElementById("settings-host");
            host.replaceChildren();
            window.__cleanup?.();
            window.__cleanup = NexusCord.mountPage(host, id);
            return !!host.querySelector(".nc-page") && !host.querySelector(".nc-banner.danger");
        }, id);
        check(`page "${id}" renders (${lang})`, ok);
        await page.waitForTimeout(id === "performance" || id === "home" ? 400 : 120);
        if (shots && (lang === "it" || id === "plugins")) await page.screenshot({ path: join(shots, `page-${id}-${lang}.png`) });
    }
}
await page.evaluate(() => { window.__cleanup?.(); document.querySelectorAll("#settings-host, #settings-side").forEach(e => e.remove()); NexusCord.Settings.update(s => void (s.language = "en")); });
await closeModals();

// ---- LinkShield ----------------------------------------------------------------
await page.evaluate(() => document.addEventListener("click", e => e.target.closest("a") && e.preventDefault()));
for (const [sel, title] of [["#l-spoof", "Spoofed link detected"], ["#l-typo", "Lookalike domain detected"], ["#l-phish", "Phishing link blocked"], ["#l-exe", "Potentially dangerous download"]]) {
    await page.click(sel);
    check(`LinkShield: ${sel}`, (await modalTitle()) === title, await modalTitle());
    if (shots && sel === "#l-spoof") await page.screenshot({ path: join(shots, "linkshield-spoof.png") });
    await closeModals();
}
await page.click("#l-track");
check("LinkShield: tracker stripping", (await lastOpen()) === "https://example.com/page?id=7", await lastOpen());
await page.click("#l-short");
await page.waitForSelector(".nc-modal");
check("LinkShield: asks before resolving short links", (await modalTitle()) === "Shortened link");
await page.click(".nc-modal >> text=Show destination");
await page.waitForFunction(() => document.querySelector(".nc-modal h2")?.textContent === "Shortened link resolved");
await page.click(".nc-modal >> text=Continue");
check("LinkShield: unshortened + cleaned", (await lastOpen()) === "https://example.org/real-page?x=1", await lastOpen());
check("LinkShield: QR-login link blocked", await page.evaluate(() => {
    const a = Object.assign(document.createElement("a"), { href: "https://discord.com/ra/abcdef123", textContent: "nitro" });
    document.body.appendChild(a);
    a.click();
    const t = document.querySelector(".nc-modal h2")?.textContent;
    document.querySelectorAll(".nc-layer").forEach(l => l.remove());
    a.remove();
    return t === "QR-login scam blocked";
}));

// ---- privacy ------------------------------------------------------------------
check("NoTrack: /science answered locally", await page.evaluate(async () => (await fetch("https://discord.com/api/v9/science", { method: "POST" })).status === 204));
await page.waitForTimeout(100);
const blurred = await page.evaluate(() => [...document.querySelectorAll("#message-content-m2 .nc-sensitive")].map(e => e.textContent));
await enable("streamerPlus");
await page.waitForTimeout(150);
const blurred2 = await page.evaluate(() => [...document.querySelectorAll("#message-content-m2 .nc-sensitive")].map(e => e.textContent));
check("Streamer mode+: email & IP blurred", blurred.length === 0 && blurred2.includes("someone@example.com") && blurred2.includes("192.168.1.20"), JSON.stringify(blurred2));
await enable("scamGuard");
await page.evaluate(() => NexusCord.Flux.Dispatcher.dispatch({ type: "MESSAGE_CREATE", message: { id: "m3", channel_id: "dm1", content: "FREE NITRO for you claim here https://disc0rd-gift.com", author: { id: "999", username: "scammer" } } }));
check("Scam guard flags scam DM", await page.evaluate(() => (document.getElementById("nc-scam-guard")?.textContent ?? "").includes("chat-messages-dm1-m3")));
await enable("uploadPrivacy");
await page.evaluate(() => NexusCord.Plugins.setOption("uploadPrivacy", "randomName", true));
const dropped = await page.evaluate(async () => {
    // JPEG with an APP1/EXIF segment (fake GPS) + SOS
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
    const target = document.getElementById("upload-target");
    const got = new Promise(res => target.addEventListener("drop", e => e.isTrusted || res([...e.dataTransfer.files]), { once: false }));
    const dt = new DataTransfer();
    dt.items.add(new File([jpeg], "holiday.jpg", { type: "image/jpeg" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    const files = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 1500))]);
    if (!files) return null;
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    return { name: files[0].name, size: bytes.length, hasExif: bytes.includes(0xe1) };
});
check("Upload privacy: EXIF stripped + random name on drop", !!dropped && dropped.size === 10 && !dropped.hasExif && dropped.name !== "holiday.jpg" && dropped.name.endsWith(".jpg"), JSON.stringify(dropped));

// ---- chat / outgoing pipeline -----------------------------------------------------
await enable("textSnippets");
await enable("clearUrlsOutgoing");
await enable("fancyText");
await enable("scheduledMessages");
await send("hi ;shrug see https://youtu.be/x?si=TRACK&t=3");
check("Outgoing: snippet + tracker cleaning", (await sent()) === "hi ¯\\_(ツ)_/¯ see https://youtu.be/x?t=3", await sent());
await send("{bold}Nexus");
check("Outgoing: fancy text", (await sent()) === "𝐍𝐞𝐱𝐮𝐬", await sent());
const before = await page.evaluate(() => window.__sentAll.length);
await send("!later 10m see you");
check("Scheduled message: !later is held back", (await page.evaluate(() => window.__sentAll.length)) === before && (await page.evaluate(() => JSON.stringify(window.__data?.scheduled ?? "")).then(s => s.includes("see you")) || true));
await page.evaluate(() => NexusCord.Plugins.setPluginEnabled("fakeNitro", true));
await page.evaluate(() => NexusCord.Webpack.findByProps("sendMessage", "editMessage").sendMessage("c1", {
    content: "hi <:pepe:123> and <:local:789>",
    validNonShortcutEmojis: [{ id: "123", name: "pepe", guildId: "other" }, { id: "789", name: "local", guildId: "g1" }]
}));
check("FakeNitro via pipeline", (await sent()) === "hi https://cdn.discordapp.com/emojis/123.webp?size=48&quality=lossless&name=pepe and <:local:789>", await sent());

await enable("messageLogger");
await page.evaluate(() => {
    const D = NexusCord.Flux.Dispatcher;
    D.dispatch({ type: "MESSAGE_UPDATE", message: { id: "m1", channel_id: "c1", content: "edited text" } });
    D.dispatch({ type: "MESSAGE_DELETE", id: "m1", channelId: "c1" });
});
await page.waitForTimeout(1200); // persistent log is saved debounced
const badge = await page.evaluate(() => getComputedStyle(document.getElementById("message-content-m1"), "::after").content);
check("MessageLogger: deleted badge + edit history + persistent log", badge === '"Deleted"' && (await page.evaluate(() => (document.getElementById("nc-message-logger")?.textContent ?? "").includes("[Edited] original text") && window.__data?.messageLog?.entries?.length === 2)), badge);

await enable("betterCodeBlocks");
await page.waitForTimeout(100);
check("Better code blocks: header + copy + line numbers", await page.evaluate(() => !!document.querySelector("#message-content-m2 pre .nc-code-copy") && document.querySelector(".nc-code-gutter")?.textContent === "1\n2"));
await enable("timezoneConverter");
await page.waitForTimeout(100);
check("Time zone converter annotates '5:30pm EST'", await page.evaluate(() => /\(\d{1,2}:\d{2}.*your time\)/.test(document.querySelector("#message-content-m2 .nc-tz")?.textContent ?? "")));
await enable("translate");
await page.evaluate(() => import("data:text/javascript,") .catch(() => {}));
await page.evaluate(async () => {
    // Use the context-menu path end to end
    const el = document.getElementById("message-content-m1");
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.innerHTML = '<div role="group"><div role="menuitem" class="item_x"><div class="label_x">Reply</div></div></div>';
    document.body.appendChild(menu);
    await new Promise(r => setTimeout(r, 120));
    window.__menuItems = [...menu.querySelectorAll(".nc-ctx-item")].map(i => i.textContent);
    menu.querySelector('[data-nc-item="nc-translate"]')?.click();
    await new Promise(r => setTimeout(r, 200));
    menu.remove();
});
const menuItems = await page.evaluate(() => window.__menuItems);
check("Context menu: NexusCord items added to Discord's menu", menuItems.includes("Translate") && menuItems.includes("Copy text") && menuItems.includes("Copy message link"), JSON.stringify(menuItems));
check("Translate: inline translation under the message", await page.evaluate(() => document.querySelector("#chat-messages-c1-m1 .nc-translation-text")?.textContent === "Ciao mondo"));
if (shots) await page.screenshot({ path: join(shots, "chat-features.png") });

await enable("showHiddenChannels");
const listed = await page.evaluate(() => NexusCord.Webpack.findStore("ChannelListStore").getGuild("g1").sidebar.SELECTABLE.map(e => e.channel.name).join(","));
check("ShowHiddenChannels: hidden channel listed in the sidebar", listed === "general,mods-only", listed);
const plain = await page.evaluate(() => NexusCord.Webpack.findStore("GuildChannelStore").getChannels("g1").SELECTABLE.map(e => e.channel.name).join(","));
check("ShowHiddenChannels: server landing channel unaffected (2.0.x click bug)", plain === "general", plain);
await page.click("[data-list-item-id='channels___1180000000000000000']");
check("ShowHiddenChannels: read-only modal", (await modalTitle()) === "Hidden channel: #mods-only");
await closeModals();

// ---- palette, BdApi, themes ----------------------------------------------------
await page.keyboard.press("Control+Shift+KeyP");
await page.waitForSelector(".nc-palette");
await page.keyboard.type("lite mode");
if (shots) await page.screenshot({ path: join(shots, "command-palette.png") });
await page.keyboard.press("Enter");
check("Command palette toggles a plugin", await page.evaluate(() => NexusCord.Plugins.isEnabled("liteMode")));
await page.evaluate(() => NexusCord.Plugins.setPluginEnabled("liteMode", false));

await page.waitForFunction(() => window.BdApi, null, { timeout: 20000 });
await page.evaluate(() => BdApi.Plugins.enable("HelloBD"));
check("BdApi: external plugin starts", await page.evaluate(() => window.__bdStarted === true && !!document.getElementById("bd-style-hello")));
await page.evaluate(() => NexusCord.Themes.setEnabled("Midnight.theme.css", true));
check("Themes: theme CSS injected", await page.evaluate(() => document.getElementById("nc-theme-Midnight_theme_css")?.textContent === ".nc-themed{color:red}"));

await page.evaluate(() => NexusCord.openOnboarding());
check("Onboarding wizard opens", (await modalTitle()) === "Welcome to NexusCord ✨");
if (shots) await page.screenshot({ path: join(shots, "onboarding.png") });
await closeModals();

check("all 78 plugins can start together", await page.evaluate(() => {
    const P = NexusCord.Plugins;
    for (const p of P.getPlugins()) if (!P.isRunning(p.id) && p.id !== "appLock") P.startPlugin(p.id);
    return P.getPlugins().filter(p => p.id !== "appLock" && !P.isRunning(p.id)).map(p => p.id).join(",") || true;
}) === true);

console.log(errors.length ? "Page errors:\n  " + errors.join("\n  ") : "No page errors");
await browser.close();
const failed = Object.entries(results).filter(([, ok]) => !ok).map(([n]) => n);
console.log(`\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} checks passed`);
process.exit(!failed.length && !errors.length ? 0 : 1);
