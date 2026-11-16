/* Keyword alerts (#35): get notified when anyone writes your keywords (regex supported). */
import { ChannelStore, currentUser, GuildStore, jumpToMessage } from "../core/discord";
import { escapeCssString, setStyle } from "../core/dom";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "keywordAlerts";
let off = () => {};
const hits = new Map<string, string>();

export function compileKeywords(text: string): RegExp[] {
    return text
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
            const m = /^\/(.+)\/([gimsuy]*)$/.exec(l);
            try {
                return m ? new RegExp(m[1], m[2].replace("g", "") || "i") : new RegExp(`\\b${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            } catch {
                return null;
            }
        })
        .filter((r): r is RegExp => !!r);
}

function onMessage(a: any) {
    const m = a.message;
    if (!m?.content || m.author?.id === currentUser()?.id || (getOption(ID, "ignoreBots") && m.author?.bot)) return;
    const res = compileKeywords(String(getOption(ID, "keywords") || ""));
    const hit = res.find(r => r.test(m.content));
    if (!hit) return;
    const ch = ChannelStore.getChannel?.(m.channel_id);
    const where = ch?.guild_id ? `${GuildStore.getGuild?.(ch.guild_id)?.name ?? ""} #${ch?.name ?? ""}` : "DM";
    const author = m.author?.globalName ?? m.author?.username ?? "?";
    hits.set(m.id, m.channel_id);
    setStyle("nc-keyword-hits", [...hits].map(([id, c]) => `#chat-messages-${c}-${id}{background:color-mix(in srgb,var(--status-warning,#f0b232) 12%,transparent)!important;box-shadow:inset 3px 0 0 var(--status-warning,#f0b232)}`).join(""));
    toast(t("plugin.keywordAlerts.toast", { author, where }), "warn", 6000);
    if (getOption(ID, "system") && document.visibilityState !== "visible" && "Notification" in window) {
        const n = new Notification(t("plugin.keywordAlerts.title"), { body: `${author} (${where}): ${m.content.slice(0, 140)}`, silent: false });
        n.onclick = () => (window.focus(), jumpToMessage(ch?.guild_id, m.channel_id, m.id));
    }
    void escapeCssString;
}

export default definePlugin({
    id: ID,
    name: "plugin.keywordAlerts.name",
    description: "plugin.keywordAlerts.desc",
    category: "chat",
    options: {
        keywords: { type: "text", label: "plugin.keywordAlerts.opt.keywords", hint: "plugin.keywordAlerts.opt.keywordsHint", default: "", placeholder: "nexuscord\n/\\bmy\\s?name\\b/i" },
        system: { type: "boolean", label: "plugin.keywordAlerts.opt.system", default: true },
        ignoreBots: { type: "boolean", label: "plugin.keywordAlerts.opt.ignoreBots", default: true }
    },
    start() {
        off = subscribe("MESSAGE_CREATE", onMessage);
    },
    stop() {
        off();
        setStyle("nc-keyword-hits", null);
    }
});
