// Unit tests for pure modules (Node type-stripping loads the .ts files directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as LA from "../src/shared/linkAnalysis.ts";
import { matchPatternToRegExp, isTrackingUrl, stripCsp } from "../src/main/webRequest.ts";
import { parseMeta } from "../src/shared/meta.ts";
import { normalizeSettings, isPluginEnabled } from "../src/shared/settings.ts";

test("registrable domain", () => {
    assert.equal(LA.registrableDomain("a.b.discord.com"), "discord.com");
    assert.equal(LA.registrableDomain("shop.example.co.uk"), "example.co.uk");
    assert.equal(LA.registrableDomain("user.github.io"), "user.github.io");
});

test("typosquatting", () => {
    for (const host of ["disc0rd.com", "dlscord.com", "discorcl.gift", "steamcomrnunity.com", "steamcommunlty.ru", "paypa1.com", "youtub3.com", "githuh.com", "rob1ox.com", "discord.click", "discord.com.verify-login.ru", "discord-nitro.com", "freediscord.gift"]) {
        assert.ok(LA.detectTyposquat(host), `should flag ${host}`);
    }
    for (const host of ["discord.com", "cdn.discordapp.com", "discord.gg", "discogs.com", "github.com", "gist.github.com", "paypal.de", "youtube.com", "m.youtube.com", "google.com", "reddit.com", "store.steampowered.com", "example.org"]) {
        assert.equal(LA.detectTyposquat(host), null, `should NOT flag ${host}`);
    }
});

test("spoofed link text", () => {
    assert.equal(LA.detectSpoof("https://scam.xyz/gift", "discord.com/gift/abc"), "discord.com/gift/abc");
    assert.equal(LA.detectSpoof("https://discord.com/gift/abc", "https://discord.com/gift/abc"), null);
    assert.equal(LA.detectSpoof("https://www.github.com/x", "github.com/x"), null);
    assert.equal(LA.detectSpoof("https://evil.ru", "click here"), null);
    assert.equal(LA.detectSpoof("https://cdn.example.com/files/setup.exe", "setup.exe"), null);
    assert.equal(LA.detectSpoof("https://evil.ru/x", "https://discord.zip/gift"), "https://discord.zip/gift");
});

test("tracking parameter stripping", () => {
    const r = LA.stripTracking("https://example.com/p?utm_source=x&id=7&fbclid=abc&gclid=1");
    assert.equal(r.url, "https://example.com/p?id=7");
    assert.deepEqual(r.removed.sort(), ["fbclid", "gclid", "utm_source"]);
    assert.equal(LA.stripTracking("https://youtu.be/abc?si=XYZ&t=30").url, "https://youtu.be/abc?t=30");
    assert.equal(LA.stripTracking("https://example.com/?si=keep").url, "https://example.com/?si=keep");
    assert.equal(LA.stripTracking("https://www.amazon.com/dp/B000/ref=sr_1_1?psc=1").url, "https://www.amazon.com/dp/B000");
});

test("shorteners & executables & internal", () => {
    assert.ok(LA.isShortener("bit.ly") && LA.isShortener("www.tinyurl.com") && LA.isShortener("t.co"));
    assert.ok(!LA.isShortener("github.com"));
    assert.equal(LA.detectExecutable("https://cdn.discordapp.com/attachments/1/2/free_nitro.exe"), "free_nitro.exe");
    assert.equal(LA.detectExecutable("https://x.com/a/script.PS1?x=1"), "script.PS1");
    assert.equal(LA.detectExecutable("https://example.com/"), null);
    assert.equal(LA.detectExecutable("https://example.com/app.js"), null);
    assert.ok(LA.isDiscordInternal("https://discord.com/channels/1/2"));
    assert.ok(!LA.isDiscordInternal("https://cdn.discordapp.com/attachments/a.exe"));
});

test("webRequest match patterns & telemetry", () => {
    const re = matchPatternToRegExp("*://*.discord.com/api/*");
    assert.ok(re.test("https://discord.com/api/v9/users"));
    assert.ok(re.test("https://canary.discord.com/api/v9/users"));
    assert.ok(!re.test("https://discord.com.evil.ru/api/x"));
    assert.ok(isTrackingUrl("https://discord.com/api/v9/science"));
    assert.ok(isTrackingUrl("https://ptb.discord.com/api/v10/track"));
    assert.ok(isTrackingUrl("https://o64374.ingest.sentry.io/api/1/envelope/"));
    assert.ok(!isTrackingUrl("https://discord.com/api/v9/channels/1/messages"));
    const h = { "Content-Security-Policy": ["x"], "content-security-policy-report-only": ["y"], "X-Other": ["z"] };
    stripCsp(h);
    assert.deepEqual(Object.keys(h), ["X-Other"]);
});

test("BetterDiscord meta parser", () => {
    const m = parseMeta("/**\n * @name Midnight\n * @author refact0r\n * @description A dark,\n *   rounded theme\n * @version 2.0.1\n */\n.x{}", "fallback");
    assert.equal(m.name, "Midnight");
    assert.equal(m.author, "refact0r");
    assert.equal(m.description, "A dark, rounded theme");
    assert.equal(m.version, "2.0.1");
    assert.equal(parseMeta(".x{}", "file").name, "file");
    assert.equal(parseMeta('//META{"name":"Legacy","author":"Old"}*//\nclass Legacy{}', "f").name, "Legacy");
});

test("settings normalization", () => {
    const s = normalizeSettings({ language: "it", performance: { maxOldSpaceSize: "bad" }, plugins: { fakeNitro: { enabled: true } } });
    assert.equal(s.language, "it");
    assert.equal(s.performance.maxOldSpaceSize, 512);
    assert.ok(isPluginEnabled(s, "fakeNitro"));
    assert.ok(isPluginEnabled(s, "noTrack"));
    assert.ok(!isPluginEnabled(s, "messageLogger"));
});
