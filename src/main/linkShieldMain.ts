/*
 * Main-process half of LinkShield:
 *  - downloads and caches open-source phishing domain lists (FishFish + CERT.PL)
 *  - answers synchronous "is this host blacklisted?" queries from the renderer
 *  - resolves URL shorteners by following redirect headers (HEAD, manual redirects)
 */
import { net } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CACHE_DIR } from "./paths";

const CACHE_FILE = join(CACHE_DIR, "phishing-domains.json");
const REFRESH_MS = 6 * 60 * 60 * 1000;

const SOURCES: { name: string; url: string; parse: (body: string) => string[] }[] = [
    {
        name: "FishFish",
        url: "https://api.fishfish.gg/v1/domains?category=phishing",
        parse: body => {
            const data = JSON.parse(body);
            return Array.isArray(data) ? data.filter((d): d is string => typeof d === "string") : [];
        }
    },
    {
        name: "CERT.PL",
        url: "https://hole.cert.pl/domains/v2/domains.txt",
        parse: body => body.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"))
    }
];

let domains = new Set<string>();
let updatedAt = 0;
let refreshing: Promise<void> | null = null;
const sourceCounts: Record<string, number> = {};

function loadCache(): void {
    try {
        const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
        if (Array.isArray(cached.domains)) {
            domains = new Set(cached.domains);
            updatedAt = cached.updatedAt || 0;
        }
    } catch { /* no cache yet */ }
}

async function fetchText(url: string): Promise<string> {
    const res = await net.fetch(url, { headers: { "User-Agent": "NexusCord-LinkShield/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}

export function refreshPhishingLists(force = false): Promise<void> {
    if (!force && Date.now() - updatedAt < REFRESH_MS && domains.size) return Promise.resolve();
    if (refreshing) return refreshing;
    refreshing = (async () => {
        const next = new Set<string>();
        let anyOk = false;
        await Promise.all(
            SOURCES.map(async src => {
                try {
                    const list = src.parse(await fetchText(src.url));
                    for (const d of list) next.add(d.toLowerCase().replace(/^\*\./, ""));
                    sourceCounts[src.name] = list.length;
                    anyOk = true;
                } catch (e) {
                    console.warn(`[NexusCord] LinkShield: failed to fetch ${src.name} list:`, e);
                }
            })
        );
        if (anyOk && next.size) {
            domains = next;
            updatedAt = Date.now();
            try {
                writeFileSync(CACHE_FILE, JSON.stringify({ updatedAt, domains: [...domains] }));
            } catch { /* cache is optional */ }
        }
    })().finally(() => {
        refreshing = null;
    });
    return refreshing;
}

/** Returns true if `host` or any parent domain is on a phishing list. */
export function isPhishingHost(host: string): boolean {
    if (!host || !domains.size) return false;
    const parts = host.toLowerCase().replace(/\.$/, "").split(".");
    for (let i = 0; i < parts.length - 1; i++) {
        if (domains.has(parts.slice(i).join("."))) return true;
    }
    return false;
}

export function getPhishingStatus() {
    return { count: domains.size, updatedAt, sources: { ...sourceCounts }, refreshing: !!refreshing };
}

/** Follows redirects manually (max 8 hops) without downloading bodies. */
export async function unshorten(url: string): Promise<{ url: string; hops: number }> {
    let current = url;
    for (let hops = 0; hops < 8; hops++) {
        let res: Response;
        try {
            res = await net.fetch(current, { method: "HEAD", redirect: "manual" });
            // Some shorteners reject HEAD - retry with GET
            if (res.status === 405 || res.status === 403) {
                res = await net.fetch(current, { method: "GET", redirect: "manual" });
            }
        } catch {
            return { url: current, hops };
        }
        const loc = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && loc) {
            const next = new URL(loc, current);
            if (next.protocol !== "http:" && next.protocol !== "https:") return { url: current, hops };
            current = next.toString();
            continue;
        }
        return { url: current, hops };
    }
    return { url: current, hops: 8 };
}

export function initLinkShieldMain(): void {
    loadCache();
    refreshPhishingLists().catch(() => {});
    setInterval(() => refreshPhishingLists().catch(() => {}), REFRESH_MS).unref?.();
}
