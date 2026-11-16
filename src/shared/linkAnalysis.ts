/*
 * LinkShield URL analysis - pure functions, no DOM, unit-testable in Node.
 */

/** Second-level suffixes that behave like TLDs (registrable domain = 3 labels). */
const MULTI_PART_SUFFIXES = new Set([
    "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp",
    "com.br", "com.ar", "com.mx", "com.tr", "com.cn", "com.hk", "com.tw", "com.sg", "co.in", "co.kr", "co.za",
    "com.pl", "com.ru", "com.ua", "co.il", "co.id", "com.my", "com.ph", "com.vn", "github.io", "gitlab.io",
    "pages.dev", "vercel.app", "netlify.app", "herokuapp.com", "web.app", "firebaseapp.com", "blogspot.com"
]);

export function registrableDomain(host: string): string {
    const h = host.toLowerCase().replace(/\.$/, "");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return h;
    const parts = h.split(".");
    if (parts.length <= 2) return h;
    const last2 = parts.slice(-2).join(".");
    return MULTI_PART_SUFFIXES.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/** High-value domains protected against lookalikes. */
export const PROTECTED_DOMAINS = ["discord.com", "steamcommunity.com", "youtube.com", "github.com", "roblox.com", "paypal.com"];

/** Legitimate domains that are related to protected brands (never flagged). */
const OFFICIAL_DOMAINS = new Set([
    ...PROTECTED_DOMAINS,
    "discord.gg", "discord.gift", "discord.new", "discord.dev", "discord.media", "discordapp.com", "discordapp.net",
    "discordstatus.com", "discord.co", "discord.design", "discord.store", "discordmerch.com", "dis.gd",
    "steampowered.com", "steamstatic.com", "steamgames.com", "steamusercontent.com", "steamchina.com",
    "youtu.be", "ytimg.com", "youtube-nocookie.com", "youtubekids.com", "googlevideo.com",
    "githubusercontent.com", "githubassets.com", "github.io", "githubstatus.com", "github.dev", "github.blog",
    "roblox.cn", "rbxcdn.com", "robloxlabs.com",
    "paypal.me", "paypalobjects.com", "paypal-community.com", "paypal.co.uk",
    // Popular, legitimate sites that are 1-2 edits away from a protected name
    "discogs.com", "discourse.org", "youtube.de", "github.community"
]);

const HOMOGLYPHS: [RegExp, string][] = [
    [/rn/g, "m"], [/vv/g, "w"], [/cl/g, "d"], [/0/g, "o"], [/1/g, "l"], [/i/g, "l"], [/3/g, "e"], [/4/g, "a"],
    [/5/g, "s"], [/7/g, "t"], [/8/g, "b"], [/@/g, "a"], [/\$/g, "s"], [/[-_]/g, ""]
];

function skeleton(label: string): string {
    let s = label.toLowerCase();
    for (const [re, rep] of HOMOGLYPHS) s = s.replace(re, rep);
    return s;
}

export interface TyposquatHit {
    domain: string;
    target: string;
}

export function detectTyposquat(host: string): TyposquatHit | null {
    const h = host.toLowerCase().replace(/\.$/, "");
    const domain = registrableDomain(h);
    if (OFFICIAL_DOMAINS.has(domain)) return null;
    const label = domain.split(".")[0];

    for (const target of PROTECTED_DOMAINS) {
        const tLabel = target.split(".")[0];
        // Brand embedded in a foreign host: discord.com.verify-login.ru, steamcommunity-gift.xyz
        if (h.startsWith(target + ".") || h.includes("." + target + ".") || h.includes(target + "-")) return { domain: h, target };
        if (label.includes(tLabel) && label !== tLabel && /^(?:free|gift|nitro|login|verify|secure|account|support|official)|(?:gift|nitro|login|verify|secure|promo|support|official|app)$/.test(label.replace(tLabel, ""))) {
            return { domain, target };
        }
        if (label === tLabel) {
            // Same brand on another TLD: country domains are legit for most brands
            // (paypal.de), but Discord/Steam have no such variants (discord.click = scam)
            if (tLabel === "discord" || tLabel === "steamcommunity") return { domain, target };
            continue;
        }
        const dist = levenshtein(label, tLabel);
        const maxDist = tLabel.length >= 10 ? 2 : 1;
        if ((dist > 0 && dist <= maxDist) || skeleton(label) === skeleton(tLabel)) return { domain, target };
        if (h.startsWith("xn--") || label.startsWith("xn--")) {
            // Punycode (IDN) lookalikes: compare the ASCII tail heuristically
            if (levenshtein(label.replace(/^xn--/, "").replace(/-[a-z0-9]+$/, ""), tLabel) <= 2) return { domain, target };
        }
    }
    return null;
}

/** Extracts a domain from link text that LOOKS like a URL/domain, else null. */
const FILE_EXTENSIONS = new Set([
    "exe", "msi", "bat", "cmd", "ps1", "vbs", "jar", "scr", "dll", "apk", "iso", "zip", "rar", "7z", "gz", "tar",
    "png", "jpg", "jpeg", "gif", "webp", "svg", "mp3", "mp4", "mov", "mkv", "webm", "wav", "ogg", "pdf", "txt",
    "md", "json", "js", "ts", "css", "html", "py", "log", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"
]);

export function domainFromText(text: string): string | null {
    const s = text.trim().replace(/^<|>$/g, "");
    const m = /^([a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?((?:[a-z0-9-]+\.)+([a-z]{2,63}))(?::\d+)?([/?#]\S*)?$/i.exec(s);
    if (!m) return null;
    const [, scheme, domain, tld, rest] = m;
    // "setup.exe" / "photo.png" are file names, not domains - unless written as a URL
    if (!scheme && !rest && !/^www\./i.test(domain) && FILE_EXTENSIONS.has(tld.toLowerCase())) return null;
    return domain.toLowerCase();
}

export function detectSpoof(href: string, text: string): string | null {
    const shown = domainFromText(text);
    if (!shown) return null;
    let actual: string;
    try {
        actual = new URL(href).hostname.toLowerCase();
    } catch {
        return null;
    }
    return registrableDomain(shown) === registrableDomain(actual) ? null : text.trim();
}

// ---------------------------------------------------------------------------
// Tracking parameters (ClearURLs-style)
// ---------------------------------------------------------------------------
const GLOBAL_TRACKERS = [
    /^utm_/i, /^fbclid$/i, /^gclid$/i, /^dclid$/i, /^gbraid$/i, /^wbraid$/i, /^msclkid$/i, /^mc_[ce]id$/i, /^igshid$/i,
    /^igsh$/i, /^yclid$/i, /^_hsenc$/i, /^_hsmi$/i, /^mkt_tok$/i, /^oly_(?:anon|enc)_id$/i, /^vero_(?:conv|id)$/i,
    /^__s$/i, /^ttclid$/i, /^twclid$/i, /^li_fat_id$/i, /^ref_src$/i, /^ref_url$/i, /^spm$/i, /^scm$/i
];
const SITE_TRACKERS: [RegExp, RegExp[]][] = [
    [/(?:^|\.)(?:youtube\.com|youtu\.be)$/, [/^si$/, /^pp$/, /^feature$/]],
    [/(?:^|\.)spotify\.com$/, [/^si$/, /^context$/]],
    [/(?:^|\.)(?:twitter\.com|x\.com)$/, [/^s$/, /^t$/]],
    [/(?:^|\.)instagram\.com$/, [/^igsh$/, /^img_index$/]],
    [/(?:^|\.)tiktok\.com$/, [/^_r$/, /^_t$/, /^is_from_webapp$/, /^sender_device$/]],
    [/(?:^|\.)amazon\.[a-z.]+$/, [/^ref_?$/, /^pd_rd_/, /^pf_rd_/, /^content-id$/, /^psc$/, /^th$/]],
    [/(?:^|\.)reddit\.com$/, [/^share_id$/, /^rdt$/]]
];

export function stripTracking(href: string): { url: string; removed: string[] } {
    let u: URL;
    try {
        u = new URL(href);
    } catch {
        return { url: href, removed: [] };
    }
    const host = u.hostname.toLowerCase();
    const siteRules = SITE_TRACKERS.filter(([h]) => h.test(host)).flatMap(([, r]) => r);
    const removed: string[] = [];
    for (const key of [...u.searchParams.keys()]) {
        if (GLOBAL_TRACKERS.some(r => r.test(key)) || siteRules.some(r => r.test(key))) {
            u.searchParams.delete(key);
            removed.push(key);
        }
    }
    // Amazon puts tracking in the path: /dp/ID/ref=xyz
    if (/(?:^|\.)amazon\./.test(host)) {
        const p = u.pathname.replace(/\/ref=[^/]*$/, "");
        if (p !== u.pathname) {
            u.pathname = p;
            removed.push("ref");
        }
    }
    return { url: removed.length ? u.toString() : href, removed: [...new Set(removed)] };
}

export const SHORTENERS = new Set([
    "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly",
    "shorturl.at", "rb.gy", "tiny.cc", "s.id", "t.ly", "bl.ink", "lnkd.in", "v.gd", "shorte.st", "adf.ly",
    "tiny.one", "short.io", "soo.gd", "clck.ru", "qr.ae", "trib.al", "dlvr.it", "y2u.be", "surl.li", "u.to"
]);

export function isShortener(host: string): boolean {
    const h = host.toLowerCase().replace(/^www\./, "");
    return SHORTENERS.has(h);
}

export const DANGEROUS_EXTENSIONS = ["exe", "scr", "bat", "cmd", "ps1", "vbs", "vbe", "jar", "msi", "hta", "reg", "lnk", "wsf", "pif", "com", "cpl", "msc", "js"];

/** Returns the file name if the URL path ends in a dangerous executable extension. */
export function detectExecutable(href: string): string | null {
    let u: URL;
    try {
        u = new URL(href);
    } catch {
        return null;
    }
    const file = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    const m = /\.([a-z0-9]{2,4})$/i.exec(file);
    if (!m) return null;
    const ext = m[1].toLowerCase();
    if (!DANGEROUS_EXTENSIONS.includes(ext)) return null;
    // ".com" / ".js" are only dangerous as downloads, not as website URLs
    if ((ext === "com" || ext === "js") && (u.pathname === "/" || !/\/(?:attachments|files|download|uploads?)\//i.test(u.pathname))) return null;
    return file;
}

/** Discord-internal URLs LinkShield must never interfere with. */
export function isDiscordInternal(href: string): boolean {
    try {
        const u = new URL(href);
        const h = u.hostname.toLowerCase();
        if (!/(?:^|\.)discord(?:app)?\.com$/.test(h) && h !== "discord.gg" && h !== "discord.gift" && h !== "discord.new") return false;
        // Attachments on the CDN are still checked by the executable guard
        return !/^(?:cdn|media)\./.test(h);
    } catch {
        return false;
    }
}
