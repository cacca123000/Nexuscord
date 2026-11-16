/* Media downloader (#33, #52): full-resolution downloads + "download all media" for a channel. */
import { registerMenuItem } from "../core/contextMenu";
import { ChannelStore, MessageStore, UserProfileStore, UserStore } from "../core/discord";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin } from "../core/pluginManager";
import { toast } from "../core/ui";
import { originalUrl } from "./imageViewer";

const ID = "mediaDownloader";
const cleanups: (() => void)[] = [];

const fileNameOf = (url: string, fallback: string) => {
    try {
        return decodeURIComponent(new URL(url).pathname.split("/").pop() || fallback);
    } catch {
        return fallback;
    }
};

async function download(url: string, name?: string, folder = "media") {
    try {
        const path = await Native.files.download(url, name ?? fileNameOf(url, "file"), folder);
        toast(t("plugin.mediaDownloader.saved", { path }), "success", 4000);
        return path;
    } catch (e) {
        toast(t("common.error", { error: String((e as Error).message) }), "error");
    }
}

export function channelMedia(channelId: string): { url: string; name: string }[] {
    const msgs: any[] = MessageStore.getMessages?.(channelId)?._array ?? MessageStore.getMessages?.(channelId)?.toArray?.() ?? [];
    const out: { url: string; name: string }[] = [];
    for (const m of msgs) {
        for (const a of m.attachments ?? []) if (a.url) out.push({ url: a.url, name: a.filename ?? fileNameOf(a.url, "file") });
        for (const e of m.embeds ?? []) {
            const u = e.image?.url ?? e.video?.url ?? e.thumbnail?.url;
            if (u && /^https?:/.test(u)) out.push({ url: u, name: fileNameOf(u, "embed") });
        }
    }
    return out;
}

async function downloadAll(channelId: string) {
    const items = channelMedia(channelId);
    if (!items.length) return toast(t("plugin.mediaDownloader.none"), "info");
    const folder = `${ChannelStore.getChannel?.(channelId)?.name ?? "channel"}-${channelId}`;
    toast(t("plugin.mediaDownloader.starting", { n: items.length }), "info");
    let ok = 0;
    for (const it of items) {
        try {
            await Native.files.download(it.url, it.name, folder);
            ok++;
        } catch { /* skip */ }
    }
    toast(t("plugin.mediaDownloader.doneAll", { n: ok, folder }), "success", 6000);
}

export default definePlugin({
    id: ID,
    name: "plugin.mediaDownloader.name",
    description: "plugin.mediaDownloader.desc",
    category: "media",
    start() {
        cleanups.push(
            registerMenuItem(ID, { id: "nc-dl-image", order: 60, label: () => t("plugin.mediaDownloader.download"), when: m => !!(m.imageUrl || m.videoUrl || m.emoji), action: m => download(originalUrl(m.emoji ? m.emoji.url.replace(/\.webp/, m.emoji.animated ? ".gif" : ".png") : (m.videoUrl ?? m.imageUrl)!), m.emoji ? `${m.emoji.name}.${m.emoji.animated ? "gif" : "png"}` : undefined) }),
            registerMenuItem(ID, {
                id: "nc-dl-avatar",
                order: 61,
                label: () => t("plugin.mediaDownloader.avatar"),
                when: m => !!m.userId && !m.messageId,
                action: m => {
                    const u = UserStore.getUser?.(m.userId);
                    if (!u?.avatar) return toast(t("plugin.mediaDownloader.none"), "info");
                    download(`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=4096`, `${u.username}-avatar.${u.avatar.startsWith("a_") ? "gif" : "png"}`, "avatars");
                }
            }),
            registerMenuItem(ID, {
                id: "nc-dl-banner",
                order: 62,
                label: () => t("plugin.mediaDownloader.banner"),
                when: m => !!m.userId && !m.messageId && !!UserProfileStore.getUserProfile?.(m.userId)?.banner,
                action: m => {
                    const b = UserProfileStore.getUserProfile?.(m.userId).banner;
                    download(`https://cdn.discordapp.com/banners/${m.userId}/${b}.${b.startsWith("a_") ? "gif" : "png"}?size=4096`, `${m.userId}-banner.png`, "avatars");
                }
            }),
            registerMenuItem(ID, { id: "nc-dl-all", order: 63, label: () => t("plugin.mediaDownloader.all"), when: m => !!m.channelId && !m.userId, action: m => downloadAll(m.channelId!) })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
