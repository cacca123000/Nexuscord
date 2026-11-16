// Downloads EVERY JavaScript chunk of the real Discord web client into .cache/discord-assets
// (cached by content hash) and searches them for strings/regexes, printing source context.
// Used to verify NexusCord's code patches & finders against today's Discord without an account.
//
//   node test/real/scanAssets.mjs ".buildLayout().map" "/getPredicateSections/"
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(root, ".cache", "discord-assets");
mkdirSync(CACHE, { recursive: true });
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

// curl (not fetch): Cloudflare in front of discord.com rejects Node's fetch fingerprint.
function curl(url) {
    return new Promise(resolve => {
        execFile("curl", ["-sS", "-m", "60", "-A", UA["User-Agent"], "-w", "\n%{http_code}", url], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
            if (err) return resolve({ status: 0, body: "" });
            const i = out.lastIndexOf("\n");
            resolve({ status: Number(out.slice(i + 1)), body: out.slice(0, i) });
        });
    });
}

async function get(url, tries = 4) {
    for (let i = 0; i < tries; i++) {
        const r = await curl(url);
        if (r.status === 200) return r.body;
        if (r.status === 404) return null;
        await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
    return null;
}

export async function syncAssets(log = console.log) {
    const html = await get("https://discord.com/app");
    const entry = [...html.matchAll(/assets\/([\w.-]+\.js)/g)].map(m => m[1]);
    const files = new Set(entry);
    const webName = entry.find(f => f.startsWith("web."));
    const web = await get(`https://discord.com/assets/${webName}`);
    writeFileSync(join(CACHE, webName), web);
    const start = web.indexOf("p.u=e=>{");
    const body = web.slice(start, web.indexOf("})[e]+\".js\"}", start) + 20);
    for (const m of body.matchAll(/if\((\d+)===e\)return""\+e\+"\.([0-9a-f]+)\.js"/g)) files.add(`${m[1]}.${m[2]}.js`);
    const mapStart = body.lastIndexOf("({");
    for (const m of body.slice(mapStart).matchAll(/(\d+):"([0-9a-f]+)"/g)) files.add(`${m[2]}.js`);
    const todo = [...files].filter(f => !existsSync(join(CACHE, f)));
    log(`Discord chunks: ${files.size} (${todo.length} to download)`);
    let done = 0;
    const worker = async () => {
        while (todo.length) {
            const f = todo.shift();
            const txt = await get(`https://discord.com/assets/${f}`);
            if (txt != null) writeFileSync(join(CACHE, f), txt);
            if (++done % 250 === 0) log(`  ${done} downloaded`);
        }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    return [...files].filter(f => existsSync(join(CACHE, f)));
}

export function search(files, needles, ctx = 220) {
    const out = {};
    for (const n of needles) out[n] = [];
    for (const f of files) {
        const s = readFileSync(join(CACHE, f), "utf8");
        for (const n of needles) {
            const re = n.startsWith("/") && n.endsWith("/") ? new RegExp(n.slice(1, -1), "g") : null;
            if (re) {
                for (const m of s.matchAll(re)) {
                    if (out[n].length >= 6) break;
                    out[n].push(`[${f}] …${s.slice(Math.max(0, m.index - ctx), m.index + m[0].length + ctx)}…`);
                }
            } else {
                let i = s.indexOf(n);
                while (i !== -1 && out[n].length < 6) {
                    out[n].push(`[${f}] …${s.slice(Math.max(0, i - ctx), i + n.length + ctx)}…`);
                    i = s.indexOf(n, i + 1);
                }
            }
        }
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const files = process.argv.includes("--offline") ? readdirSync(CACHE).filter(f => f.endsWith(".js")) : await syncAssets();
    const needles = process.argv.slice(2).filter(a => !a.startsWith("--"));
    const res = search(files, needles);
    for (const [n, hits] of Object.entries(res)) {
        console.log(`\n=== ${n}: ${hits.length} hit(s)`);
        for (const h of hits) console.log("  " + h.replace(/\s+/g, " "));
    }
}
