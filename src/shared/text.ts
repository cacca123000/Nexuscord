const STYLES = new Set(["t", "T", "d", "D", "f", "F", "R"]);

/* Pure text helpers used by chat plugins (unit-tested in Node). */

export function parseWhen(input: string, now = new Date()): { unix: number; style: string } | null {
    let [expr, style] = input.split("|").map(s => s.trim());
    if (style && !STYLES.has(style)) return null;
    expr = expr.toLowerCase().replace(/^in\s+/, "+");
    let m = /^\+\s*(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|hour|hours|d|day|days|w|week|weeks)$/.exec(expr);
    if (m) {
        const mult: Record<string, number> = { s: 1, sec: 1, m: 60, min: 60, h: 3600, hr: 3600, hour: 3600, hours: 3600, d: 86400, day: 86400, days: 86400, w: 604800, week: 604800, weeks: 604800 };
        return { unix: Math.round(now.getTime() / 1000 + Number(m[1]) * mult[m[2]]), style: style ?? "R" };
    }
    m = /^(\d{1,2})[:.](\d{2})$/.exec(expr);
    if (m) {
        const d = new Date(now);
        d.setHours(+m[1], +m[2], 0, 0);
        return +m[1] < 24 && +m[2] < 60 ? { unix: Math.round(d.getTime() / 1000), style: style ?? "t" } : null;
    }
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](\d{1,2})[:.](\d{2}))?$/.exec(expr) ?? null;
    let d: Date | null = null;
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    else if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/.exec(expr))) d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
    if (!d || isNaN(d.getTime())) return null;
    return { unix: Math.round(d.getTime() / 1000), style: style ?? (m && m[4] != null ? "f" : "D") };
}

export function convertTimestamps(text: string, now = new Date()): string {
    return text.replace(/\{\{([^{}]{1,40})\}\}/g, (all, inner) => {
        const r = parseWhen(inner, now);
        return r ? `<t:${r.unix}:${r.style}>` : all;
    });
}

export function unindentCode(text: string): string {
    return text.replace(/```(\w*)\n([\s\S]*?)```/g, (_all, lang: string, body: string) => {
        const lines = body.replace(/\t/g, "    ").split("\n");
        const indents = lines.filter(l => l.trim()).map(l => /^ */.exec(l)![0].length);
        const min = indents.length ? Math.min(...indents) : 0;
        return "```" + lang + "\n" + lines.map(l => l.slice(Math.min(min, /^ */.exec(l)![0].length))).join("\n") + "```";
    });
}

export function capitalize(text: string, fixI = true): string {
    if (!text || text.startsWith("/") || text.startsWith("```")) return text;
    // Protect code spans, links, mentions, emoji and timestamps
    const kept: string[] = [];
    const masked = text.replace(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+?(?=[.,!?)]*(?:\s|$))|<[^>\s]+>|:\w+:/g, m => `\u0000${kept.push(m) - 1}\u0000`);
    let out = masked.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, pre, ch) => pre + ch.toUpperCase());
    if (fixI) out = out.replace(/(^|\s)i(?=\s|'|$)/g, "$1I");
    return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => kept[+i]);
}

export function formatDuration(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (hh ? `${hh}:${String(mm).padStart(2, "0")}` : String(mm)) + ":" + String(ss).padStart(2, "0");
}
