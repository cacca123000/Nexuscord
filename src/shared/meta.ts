/**
 * Parses BetterDiscord-style JSDoc meta headers, e.g.
 *   /**
 *    * @name MyTheme
 *    * @author Someone
 *    * @version 1.0.0
 *    *\/
 */
export interface AddonMeta {
    name: string;
    author: string;
    description: string;
    version: string;
    [key: string]: string;
}

export function parseMeta(source: string, fallbackName: string): AddonMeta {
    const meta: AddonMeta = { name: fallbackName, author: "Unknown", description: "", version: "0.0.0" };
    const block = /^﻿?\s*\/\*\*([\s\S]*?)\*\//.exec(source);
    if (!block) {
        // Legacy BD format: //META{"name":"..."}*//
        const legacy = /\/\/META(\{.*?\})\*\/\//.exec(source);
        if (legacy) {
            try {
                Object.assign(meta, JSON.parse(legacy[1]));
            } catch { /* ignore malformed legacy meta */ }
        }
        return meta;
    }
    let lastKey = "";
    for (const rawLine of block[1].split(/\r?\n/)) {
        const line = rawLine.replace(/^\s*\*\s?/, "");
        const m = /^@(\w+)\s*(.*)$/.exec(line.trim());
        if (m) {
            lastKey = m[1];
            meta[lastKey] = m[2].trim();
        } else if (lastKey && line.trim()) {
            meta[lastKey] += " " + line.trim();
        }
    }
    return meta;
}
