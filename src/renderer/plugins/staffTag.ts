/* Owner & staff tags: a small tag next to the server owner (and optionally admins) in chat. */
import { GuildMemberStore, GuildRoleStore, GuildStore, MessageStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe, parseMessageElement } from "../core/domObserver";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { ChannelStore } from "../core/discord";

const ID = "staffTag";
let off = () => {};
const ADMIN = 8n;

function role(guildId: string, userId: string): "owner" | "admin" | null {
    const g = GuildStore.getGuild?.(guildId);
    if (!g) return null;
    if (g.ownerId === userId) return "owner";
    if (!getOption(ID, "admins")) return null;
    const member = GuildMemberStore.getMember?.(guildId, userId);
    const roles = GuildRoleStore.getRoles?.(guildId) ?? GuildRoleStore.getSortedRoles?.(guildId) ?? {};
    for (const rid of member?.roles ?? []) {
        const r = Array.isArray(roles) ? roles.find((x: any) => x.id === rid) : roles[rid];
        try {
            if (r && (BigInt(r.permissions ?? 0) & ADMIN) === ADMIN) return "admin";
        } catch { /* ignore */ }
    }
    return null;
}

function onHeader(el: HTMLElement) {
    if (el.parentElement?.querySelector(":scope > .nc-staff-tag")) return;
    const ids = parseMessageElement(el);
    if (!ids) return;
    const msg = MessageStore.getMessage?.(ids.channelId, ids.messageId);
    const guildId = ChannelStore.getChannel?.(ids.channelId)?.guild_id;
    if (!msg || !guildId) return;
    const r = role(guildId, msg.author?.id);
    if (!r) return;
    el.after(h("span", { className: `nc-staff-tag ${r}`, title: t(`plugin.staffTag.${r}` as any) }, t(`plugin.staffTag.${r}` as any)));
}

export default definePlugin({
    id: ID,
    name: "plugin.staffTag.name",
    description: "plugin.staffTag.desc",
    category: "chat",
    options: { admins: { type: "boolean", label: "plugin.staffTag.opt.admins", default: true } },
    start() {
        setStyle(ID, `.nc-staff-tag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font:700 10px/16px var(--font-primary,sans-serif);text-transform:uppercase;vertical-align:1px;background:color-mix(in srgb,var(--text-muted,#949ba4) 22%,transparent);color:var(--text-default,#dbdee1)}.nc-staff-tag.owner{background:color-mix(in srgb,#e8a33a 28%,transparent);color:#f3c15e}`);
        off = observe(ID, 'li[id^="chat-messages-"] h3 [class*="username_"]', onHeader);
    },
    stop() {
        off();
        document.querySelectorAll(".nc-staff-tag").forEach(e => e.remove());
        setStyle(ID, null);
    },
    onOptionChange() {
        this.stop();
        this.start();
    }
});
