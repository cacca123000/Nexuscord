/* Time zone converter (#36): "5pm EST" in a message gets your local time next to it. */
import { observe } from "../core/domObserver";
import { getLanguage, t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";

const ID = "timezoneConverter";
let off = () => {};

/** Offsets in hours from UTC. */
export const ZONES: Record<string, number> = {
    UTC: 0, GMT: 0, WET: 0, WEST: 1, BST: 1, CET: 1, CEST: 2, EET: 2, EEST: 3, MSK: 3, IST: 5.5, ICT: 7, CST_CN: 8, SGT: 8, HKT: 8,
    JST: 9, KST: 9, AEST: 10, AEDT: 11, NZST: 12, NZDT: 13, AST: -4, ADT: -3, EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, HST: -10, BRT: -3, ART: -3
};
const RE = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*(${Object.keys(ZONES).filter(z => !z.includes("_")).join("|")})(?:\\s*([+-]\\d{1,2}))?\\b`, "gi");

export function convert(match: RegExpExecArray, now = new Date()): Date | null {
    let hh = Number(match[1]);
    const mm = Number(match[2] ?? 0);
    const ampm = match[3]?.toLowerCase().replace(/\./g, "");
    if (hh > 24 || mm > 59 || (ampm && hh > 12)) return null;
    if (ampm === "pm" && hh < 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
    if (!ampm && !match[2]) return null; // "5 EST" is too ambiguous
    const offset = ZONES[match[4].toUpperCase()] + Number(match[5] ?? 0);
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm) - offset * 3600_000);
    return d;
}

function process(el: HTMLElement) {
    if (el.dataset.ncTz) return;
    el.dataset.ncTz = "1";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (RE.test((n as Text).data)) nodes.push(n as Text), (RE.lastIndex = 0);
    for (const tn of nodes) {
        RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        const additions: [number, string, string][] = [];
        while ((m = RE.exec(tn.data))) {
            const d = convert(m);
            if (!d) continue;
            additions.push([m.index + m[0].length, d.toLocaleTimeString(getLanguage(), { hour: "2-digit", minute: "2-digit" }), d.toLocaleString(getLanguage())]);
        }
        for (const [pos, short, full] of additions.reverse()) {
            const after = tn.splitText(pos);
            const span = document.createElement("span");
            span.className = "nc-tz";
            span.textContent = ` (${short} ${t("plugin.timezoneConverter.local")})`;
            span.title = full;
            after.before(span);
        }
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.timezoneConverter.name",
    description: "plugin.timezoneConverter.desc",
    category: "chat",
    start() {
        const s = document.createElement("style");
        s.id = "nc-tz-css";
        s.textContent = ".nc-tz{color:var(--text-muted,#949ba4);font-size:.85em;border-bottom:1px dotted currentColor;cursor:help}";
        document.head?.appendChild(s);
        off = observe(ID, '[id^="message-content-"]', process);
    },
    stop() {
        off();
        document.getElementById("nc-tz-css")?.remove();
        document.querySelectorAll(".nc-tz").forEach(e => e.remove());
    }
});
