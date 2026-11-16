/*
 * Streamer mode+ (#22): blurs emails, phone numbers, IP addresses and (optionally)
 * images until hovered; panic key (Ctrl+Shift+F9 or the tray menu) blurs everything.
 */
import { addCommands } from "./commandPalette";
import { StreamerModeStore } from "../core/discord";
import { onDomReady, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "streamerPlus";
const cleanups: (() => void)[] = [];
let panic = false;

export const SENSITIVE: { key: string; re: RegExp }[] = [
    { key: "blurEmails", re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g },
    { key: "blurPhones", re: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g },
    { key: "blurIps", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g }
];

function active(): boolean {
    if (!getOption(ID, "onlyInStreamerMode")) return true;
    try {
        return !!StreamerModeStore.enabled;
    } catch {
        return false;
    }
}

function blurText(root: HTMLElement) {
    if (!active()) return;
    const regs = SENSITIVE.filter(s => getOption(ID, s.key)).map(s => s.re);
    if (!regs.length) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const tn = n as Text;
        if (tn.parentElement?.closest(".nc-sensitive, code, pre")) continue;
        if (regs.some(r => ((r.lastIndex = 0), r.test(tn.data)))) targets.push(tn);
    }
    for (const tn of targets) {
        const frag = document.createDocumentFragment();
        let rest = tn.data;
        const combined = new RegExp(regs.map(r => r.source).join("|"), "g");
        let last = 0;
        for (const m of rest.matchAll(combined)) {
            if (m[0].replace(/\D/g, "").length < 7 && /^\+?[\d\s().-]+$/.test(m[0])) continue; // short numbers are not phones
            frag.append(rest.slice(last, m.index));
            const span = document.createElement("span");
            span.className = "nc-sensitive";
            span.textContent = m[0];
            frag.append(span);
            last = m.index! + m[0].length;
        }
        if (!last) continue;
        frag.append(rest.slice(last));
        rest = "";
        tn.replaceWith(frag);
    }
}

function setPanic(on: boolean) {
    panic = on;
    document.documentElement?.classList.toggle("nc-panic", on);
}

const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.code === "F9") {
        e.preventDefault();
        setPanic(!panic);
    }
};

addCommands(() => [{ icon: "🚨", label: t("plugin.streamerPlus.panic"), kind: t("palette.kind.action"), run: () => setPanic(!panic) }]);

export default definePlugin({
    id: ID,
    name: "plugin.streamerPlus.name",
    description: "plugin.streamerPlus.desc",
    category: "privacy",
    options: {
        onlyInStreamerMode: { type: "boolean", label: "plugin.streamerPlus.opt.onlyInStreamerMode", default: false },
        blurEmails: { type: "boolean", label: "plugin.streamerPlus.opt.blurEmails", default: true },
        blurPhones: { type: "boolean", label: "plugin.streamerPlus.opt.blurPhones", default: true },
        blurIps: { type: "boolean", label: "plugin.streamerPlus.opt.blurIps", default: true },
        blurImages: { type: "boolean", label: "plugin.streamerPlus.opt.blurImages", default: false }
    },
    start() {
        const css = `.nc-sensitive{filter:blur(5px);transition:filter .15s;border-radius:3px;background:color-mix(in srgb,currentColor 12%,transparent)}.nc-sensitive:hover{filter:none}
html.nc-panic #app-mount{filter:blur(22px) saturate(.6)!important;pointer-events:none}
html.nc-panic body::after{content:"🚨  Ctrl+Shift+F9";position:fixed;inset:auto 0 40px 0;text-align:center;font:700 16px var(--font-primary,sans-serif);color:#fff;z-index:2147483647}`;
        const imgCss = `html:not(.nc-no-streamer) li[id^="chat-messages-"] img:not([class*="emoji"]):not([class*="avatar"]),html:not(.nc-no-streamer) li[id^="chat-messages-"] video{filter:blur(18px);transition:filter .2s}li[id^="chat-messages-"] [class*="imageWrapper"]:hover img,li[id^="chat-messages-"] video:hover{filter:none!important}`;
        setStyle("nc-streamer-plus", css + (getOption(ID, "blurImages") && active() ? imgCss : ""));
        cleanups.push(observe(ID, '[id^="message-content-"], [class*="embedDescription"]', blurText));
        onDomReady(() => document.addEventListener("keydown", onKey, true));
        cleanups.push(() => document.removeEventListener("keydown", onKey, true));
        cleanups.push(Native.system?.onEvent?.((ev: string) => ev === "panic" && setPanic(!panic)) ?? (() => {}));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setPanic(false);
        setStyle("nc-streamer-plus", null);
        document.querySelectorAll(".nc-sensitive").forEach(s => s.replaceWith(document.createTextNode(s.textContent ?? "")));
    }
});
