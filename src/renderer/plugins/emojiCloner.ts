/* Emoji cloner (#53): copy any emoji into one of your servers (needs "Manage Expressions"). */
import { registerMenuItem } from "../core/contextMenu";
import { GuildStore, PermissionStore, RestAPI } from "../core/discord";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { openModal, Select, toast } from "../core/ui";

const ID = "emojiCloner";
const MANAGE_EXPRESSIONS = 1n << 30n;
let off = () => {};

function manageableGuilds(): any[] {
    return Object.values<any>(GuildStore.getGuilds?.() ?? {}).filter(g => {
        try {
            return PermissionStore.can?.(MANAGE_EXPRESSIONS, g);
        } catch {
            return false;
        }
    });
}

async function toDataUrl(url: string): Promise<string> {
    const blob = await (await fetch(url)).blob();
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(blob);
    });
}

function clone(emoji: { id: string; name: string; animated: boolean }) {
    const guilds = manageableGuilds();
    if (!guilds.length) return toast(t("plugin.emojiCloner.noGuilds"), "error");
    let guildId = guilds[0].id;
    const name = h("input", { className: "nc-input", value: emoji.name.replace(/[^\w]/g, "_").slice(0, 32) || "emoji" }) as HTMLInputElement;
    openModal({
        title: t("plugin.emojiCloner.title"),
        body: h("div", { className: "nc-stack" }, h("img", { src: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=96`, style: "width:64px;height:64px;object-fit:contain" }), Select({ value: guildId, options: guilds.map(g => ({ value: g.id, label: g.name })), onChange: v => (guildId = String(v)) }), name),
        buttons: [
            { label: t("common.cancel"), variant: "ghost" },
            {
                label: t("plugin.emojiCloner.clone"),
                variant: "primary",
                onClick: async () => {
                    try {
                        const image = await toDataUrl(`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=128`);
                        await RestAPI.post({ url: `/guilds/${guildId}/emojis`, body: { name: name.value.trim() || "emoji", image } });
                        toast(t("plugin.emojiCloner.done", { guild: GuildStore.getGuild?.(guildId)?.name ?? "" }), "success");
                    } catch (e: any) {
                        toast(t("common.error", { error: e?.body?.message ?? String(e?.message ?? e) }), "error");
                    }
                }
            }
        ]
    });
}

export default definePlugin({
    id: ID,
    name: "plugin.emojiCloner.name",
    description: "plugin.emojiCloner.desc",
    category: "media",
    start() {
        off = registerMenuItem(ID, { id: "nc-clone-emoji", order: 64, label: () => t("plugin.emojiCloner.action"), when: m => !!m.emoji, action: m => clone(m.emoji!) });
    },
    stop: () => off()
});
