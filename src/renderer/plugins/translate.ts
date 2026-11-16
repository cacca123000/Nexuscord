/* Translate (#25): translate any message inline (context menu) or automatically. */
import { setAccessory, clearAccessories } from "../core/accessories";
import { registerMenuItem } from "../core/contextMenu";
import { currentChannelId, currentUser } from "../core/discord";
import { h } from "../core/dom";
import { subscribe } from "../core/flux";
import { getLanguage, t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "translate";
const cache = new Map<string, { text: string; from: string }>();
const cleanups: (() => void)[] = [];
let lastCall = 0;

export const LANGS = ["en", "it", "es", "fr", "de", "pt", "nl", "pl", "ru", "uk", "tr", "ar", "ja", "ko", "zh-CN", "hi", "sv", "cs", "ro", "el"];

function target(): string {
    const v = String(getOption(ID, "target") || "auto");
    return v === "auto" ? getLanguage() : v;
}

export async function translateText(text: string, to = target()): Promise<{ text: string; from: string }> {
    const key = `${to}:${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const wait = Math.max(0, lastCall + 400 - Date.now()); // gentle rate limit
    lastCall = Date.now() + wait;
    if (wait) await new Promise(r => setTimeout(r, wait));
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text.slice(0, 4500))}`;
    const res = await Native.net.request(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    const out = { text: (data[0] ?? []).map((s: any[]) => s[0]).join(""), from: String(data[2] ?? "?") };
    cache.set(key, out);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return out;
}

function show(messageId: string, result: { text: string; from: string } | { error: string }) {
    setAccessory(messageId, ID, () =>
        h(
            "div",
            { className: "nc-translation" },
            "error" in result
                ? h("span", { className: "nc-sub" }, t("plugin.translate.failed", { error: result.error }))
                : [h("div", { className: "nc-translation-text" }, result.text), h("div", { className: "nc-sub", style: "font-size:11px" }, t("plugin.translate.from", { lang: result.from.toUpperCase() }), " · ", h("a", { href: "#", onClick: (e: Event) => (e.preventDefault(), setAccessory(messageId, ID, null)) }, t("common.close")))]
        )
    );
}

export async function translateMessage(messageId: string, content: string, auto = false) {
    if (!content.trim()) return;
    try {
        const r = await translateText(content);
        if (auto && (r.from === target() || r.from.split("-")[0] === target().split("-")[0] || r.text.trim() === content.trim())) return;
        show(messageId, r);
    } catch (e) {
        if (!auto) show(messageId, { error: String((e as Error).message) });
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.translate.name",
    description: "plugin.translate.desc",
    category: "chat",
    options: {
        target: { type: "select", label: "plugin.translate.opt.target", default: "auto", options: [{ label: "plugin.translate.auto", value: "auto" }, ...LANGS.map(l => ({ label: l.toUpperCase(), value: l }))] },
        auto: { type: "boolean", label: "plugin.translate.opt.auto", hint: "plugin.translate.opt.autoHint", default: false }
    },
    start() {
        const css = document.createElement("style");
        css.id = "nc-translate-css";
        css.textContent = `.nc-translation{margin:4px 0 2px;padding:6px 10px;border-left:3px solid var(--nc-accent,#7c5cff);border-radius:0 8px 8px 0;background:color-mix(in srgb,var(--nc-accent,#7c5cff) 8%,transparent)}.nc-translation-text{white-space:pre-wrap;color:var(--text-normal,#dbdee1)}`;
        document.head?.appendChild(css);
        cleanups.push(() => css.remove());
        cleanups.push(
            registerMenuItem(ID, {
                id: "nc-translate",
                label: () => t("plugin.translate.action"),
                when: m => !!m.message?.content,
                action: m => translateMessage(m.messageId!, m.selection || m.message.content),
                order: 10
            })
        );
        cleanups.push(
            subscribe("MESSAGE_CREATE", a => {
                const m = a.message;
                if (!getOption(ID, "auto") || !m?.content || m.author?.id === currentUser()?.id) return;
                if ((m.channel_id ?? a.channelId) !== currentChannelId()) return;
                translateMessage(m.id, m.content, true);
            })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        clearAccessories(ID);
    }
});
