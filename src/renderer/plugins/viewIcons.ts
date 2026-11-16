/* View icons: open avatars, banners and server icons in full resolution from the right-click menu. */
import { registerMenuItem } from "../core/contextMenu";
import { GuildStore, UserStore } from "../core/discord";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, isEnabled } from "../core/pluginManager";
import { findStore } from "../core/webpack";
import { openImageViewer } from "./imageViewer";

const ID = "viewIcons";
const cleanups: (() => void)[] = [];

function view(url: string) {
    if (isEnabled("imageViewer")) openImageViewer(url);
    else void Native.shell.openExternal(url);
}

const cdn = (path: string, animated: boolean) => `https://cdn.discordapp.com/${path}.${animated ? "gif" : "png"}?size=4096`;

function avatarUrl(userId: string, guildId?: string): string | null {
    const member = guildId ? findStore("GuildMemberStore")?.getMember?.(guildId, userId) : null;
    if (member?.avatar) return cdn(`guilds/${guildId}/users/${userId}/avatars/${member.avatar}`, member.avatar.startsWith("a_"));
    const u = UserStore.getUser?.(userId);
    if (!u) return null;
    if (u.avatar) return cdn(`avatars/${userId}/${u.avatar}`, u.avatar.startsWith("a_"));
    return u.getAvatarURL?.(undefined, 4096) ?? null;
}

function bannerUrl(userId: string): string | null {
    const p = findStore("UserProfileStore")?.getUserProfile?.(userId);
    const banner = p?.banner ?? UserStore.getUser?.(userId)?.banner;
    return banner ? cdn(`banners/${userId}/${banner}`, banner.startsWith("a_")) : null;
}

export default definePlugin({
    id: ID,
    name: "plugin.viewIcons.name",
    description: "plugin.viewIcons.desc",
    category: "utility",
    start() {
        cleanups.push(
            registerMenuItem(ID, { id: "nc-view-avatar", order: 30, label: () => t("plugin.viewIcons.avatar"), when: m => !!m.userId && !!avatarUrl(m.userId, m.guildId), action: m => view(avatarUrl(m.userId!, m.guildId)!) }),
            registerMenuItem(ID, { id: "nc-view-banner", order: 31, label: () => t("plugin.viewIcons.banner"), when: m => !!m.userId && !!bannerUrl(m.userId), action: m => view(bannerUrl(m.userId!)!) }),
            registerMenuItem(ID, {
                id: "nc-view-guild-icon",
                order: 32,
                label: () => t("plugin.viewIcons.serverIcon"),
                when: m => !!m.el.closest('[data-list-item-id^="guildsnav___"]') && !!GuildStore.getGuild?.(m.guildId!)?.icon,
                action: m => {
                    const g = GuildStore.getGuild?.(m.guildId!);
                    view(cdn(`icons/${g.id}/${g.icon}`, String(g.icon).startsWith("a_")));
                }
            })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
