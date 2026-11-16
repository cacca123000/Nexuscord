/* Copy tools (#38): copy text / markdown quote / link / IDs / raw JSON, view raw message. */
import { registerMenuItem } from "../core/contextMenu";
import { ChannelStore, GuildStore, UserStore } from "../core/discord";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { copyText, openModal } from "../core/ui";

const ID = "copyTools";
const cleanups: (() => void)[] = [];

export function safeJson(value: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(
        value,
        (_k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (v && typeof v === "object") {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
                if (v._isAMomentObject) return v.toISOString?.();
            }
            return v;
        },
        2
    );
}

export function asQuote(content: string, author: string): string {
    return content.split("\n").map(l => `> ${l}`).join("\n") + `\n— ${author}`;
}

function viewRaw(title: string, obj: unknown, content?: string) {
    openModal({
        title,
        medium: true,
        body: h("div", { className: "nc-stack" }, content != null ? h("pre", { className: "nc-code" }, content || "—") : null, h("pre", { className: "nc-code" }, safeJson(obj))),
        buttons: [{ label: t("plugin.windowTweaks.copyJson"), onClick: () => void copyText(safeJson(obj)) }, { label: t("common.close"), variant: "primary" }]
    });
}

export default definePlugin({
    id: ID,
    name: "plugin.copyTools.name",
    description: "plugin.copyTools.desc",
    category: "utility",
    options: { ids: { type: "boolean", label: "plugin.copyTools.opt.ids", default: true } },
    start() {
        const add = (item: Parameters<typeof registerMenuItem>[1]) => cleanups.push(registerMenuItem(ID, item));
        add({ id: "nc-copy-text", order: 40, label: () => t("plugin.copyTools.text"), when: m => !!m.message?.content, action: m => copyText(m.message.content) });
        add({ id: "nc-copy-quote", order: 41, label: () => t("plugin.copyTools.quote"), when: m => !!m.message?.content, action: m => copyText(asQuote(m.message.content, m.message.author?.username ?? "?")) });
        add({ id: "nc-copy-link", order: 42, label: () => t("plugin.copyTools.link"), when: m => !!m.messageId, action: m => copyText(`https://discord.com/channels/${ChannelStore.getChannel?.(m.channelId)?.guild_id ?? "@me"}/${m.channelId}/${m.messageId}`) });
        add({ id: "nc-view-raw", order: 43, label: () => t("plugin.copyTools.viewRaw"), when: m => !!m.message, action: m => viewRaw(t("plugin.copyTools.viewRaw"), m.message, m.message.content) });
        add({ id: "nc-copy-user-id", order: 50, label: () => t("plugin.windowTweaks.copyUserId"), when: m => !!m.userId && !!getOption(ID, "ids"), action: m => copyText(m.userId!) });
        add({ id: "nc-copy-msg-id", order: 51, label: () => t("plugin.windowTweaks.copyMessageId"), when: m => !!m.messageId && !!getOption(ID, "ids"), action: m => copyText(m.messageId!) });
        add({ id: "nc-copy-ch-id", order: 52, label: () => t("plugin.windowTweaks.copyChannelId"), when: m => !!m.channelId && !m.messageId && !!getOption(ID, "ids"), action: m => copyText(m.channelId!) });
        add({ id: "nc-copy-user-json", order: 53, label: () => t("plugin.copyTools.userJson"), when: m => !!m.userId && !m.messageId, action: m => viewRaw(UserStore.getUser?.(m.userId)?.username ?? m.userId!, UserStore.getUser?.(m.userId)) });
        add({ id: "nc-copy-guild-id", order: 54, label: () => t("plugin.copyTools.guildId"), when: m => !!m.el.closest('[data-list-item-id^="guildsnav___"]') && !!m.guildId, action: m => copyText(m.guildId!) });
        void GuildStore;
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
