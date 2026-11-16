/* Better timestamps (#30): seconds, 24h / absolute or relative times on every message. */
import { observe } from "../core/domObserver";
import { getLanguage } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "betterTimestamps";
let off = () => {};
let timer: ReturnType<typeof setInterval> | null = null;

export function formatStamp(d: Date, mode: string, seconds: boolean, h24: boolean, lang: string, now = Date.now()): string {
    if (mode === "relative") {
        const s = Math.round((now - d.getTime()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
        if (Math.abs(s) < 60) return rtf.format(-s, "second");
        if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), "minute");
        if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), "hour");
        return rtf.format(-Math.round(s / 86400), "day");
    }
    const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: !h24 });
    if (mode === "time") return time;
    return `${d.toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" })} ${time}`;
}

function apply(el: HTMLElement) {
    const iso = el.getAttribute("datetime");
    if (!iso || !el.closest('li[id^="chat-messages-"]')) return;
    const d = new Date(iso);
    if (isNaN(+d)) return;
    if (!el.dataset.ncOrig) el.dataset.ncOrig = el.textContent ?? "";
    const text = formatStamp(d, String(getOption(ID, "mode")), !!getOption(ID, "seconds"), !!getOption(ID, "h24"), getLanguage());
    if (el.textContent !== text) el.textContent = text;
    el.title = d.toLocaleString(getLanguage(), { dateStyle: "full", timeStyle: "medium" });
}

export default definePlugin({
    id: ID,
    name: "plugin.betterTimestamps.name",
    description: "plugin.betterTimestamps.desc",
    category: "chat",
    options: {
        mode: {
            type: "select",
            label: "plugin.betterTimestamps.opt.mode",
            default: "time",
            options: [
                { label: "plugin.betterTimestamps.mode.time", value: "time" },
                { label: "plugin.betterTimestamps.mode.full", value: "full" },
                { label: "plugin.betterTimestamps.mode.relative", value: "relative" }
            ]
        },
        seconds: { type: "boolean", label: "plugin.betterTimestamps.opt.seconds", default: true },
        h24: { type: "boolean", label: "plugin.betterTimestamps.opt.h24", default: true }
    },
    start() {
        off = observe(ID, "time[datetime]", apply);
        timer = setInterval(() => getOption(ID, "mode") === "relative" && document.querySelectorAll<HTMLElement>('li[id^="chat-messages-"] time[datetime]').forEach(apply), 30_000);
    },
    stop() {
        off();
        if (timer) clearInterval(timer);
        document.querySelectorAll<HTMLElement>("time[data-nc-orig]").forEach(el => {
            el.textContent = el.dataset.ncOrig!;
            delete el.dataset.ncOrig;
        });
    },
    onOptionChange() {
        document.querySelectorAll<HTMLElement>('li[id^="chat-messages-"] time[datetime]').forEach(apply);
    }
});
