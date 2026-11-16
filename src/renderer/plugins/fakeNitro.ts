/*
 * FakeNitro & client cosmetics.
 *  - Emoji/sticker pickers are unlocked client-side (canUse* checks)
 *  - On send, emojis you can't use natively are replaced with resized,
 *    transparent CDN image links (lossless WebP / GIF for animated)
 *  - Unavailable stickers are sent as image links (Lottie stickers are skipped)
 *  - Client-side previews of profile themes/decorations + a local profile badge
 * Users who actually have Nitro are left completely untouched.
 */
import { h, onDomReady, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { definePlugin, getOption } from "../core/pluginManager";
import { Icons } from "../core/ui";
import { filters, findStoreLazy, waitFor } from "../core/webpack";

const ID = "fakeNitro";
const UserStore = findStoreLazy("UserStore");
const ChannelStore = findStoreLazy("ChannelStore");
const StickersStore = findStoreLazy("StickersStore");
const cleanups: (() => void)[] = [];

const EMOJI_CHECKS = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];
const STICKER_CHECKS = ["canUseStickersEverywhere", "canUseCustomStickersEverywhere"];
const COSMETIC_CHECKS = ["canUsePremiumProfileCustomization", "canUseClientThemes", "canUseAvatarDecorations"];

function hasRealNitro(): boolean {
    try {
        return (UserStore.getCurrentUser?.()?.premiumType ?? 0) > 0;
    } catch {
        return false;
    }
}

export function emojiUrl(emoji: { id: string; animated?: boolean; name?: string }, size: number): string {
    const ext = emoji.animated ? "gif" : "webp";
    return `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=${size}&quality=lossless${emoji.name ? `&name=${encodeURIComponent(emoji.name)}` : ""}`;
}

function stickerUrl(sticker: any): string | null {
    // format_type: 1 PNG, 2 APNG, 3 LOTTIE (cannot be linked), 4 GIF
    if (sticker.format_type === 3) return null;
    const ext = sticker.format_type === 4 ? "gif" : "png";
    return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=160`;
}

/** Rewrites unusable custom emojis in an outgoing message. Exported for tests. */
export function rewriteMessage(message: any, guildId: string | undefined, size: number): void {
    const emojis: any[] = message?.validNonShortcutEmojis;
    if (!Array.isArray(emojis) || typeof message.content !== "string") return;
    const keep: any[] = [];
    for (const emoji of emojis) {
        const needsFake = emoji?.id && (emoji.animated || emoji.available === false || (emoji.guildId ?? emoji.guild_id) !== guildId);
        if (!needsFake) {
            keep.push(emoji);
            continue;
        }
        const re = new RegExp(`<a?:${(emoji.originalName ?? emoji.name ?? "[\\w~]+").replace(/[^\w~]/g, "\\$&")}(?:~\\d+)?:${emoji.id}>`, "g");
        message.content = message.content.replace(re, ` ${emojiUrl(emoji, size)} `);
    }
    message.content = message.content.replace(/ {2,}/g, " ").trim();
    message.validNonShortcutEmojis = keep;
}

function isStickerUnavailable(sticker: any, guildId: string | undefined) {
    return sticker && sticker.type === 2 /* GUILD */ && sticker.guild_id !== guildId;
}

function injectBadges() {
    const me = UserStore.getCurrentUser?.();
    if (!me || !getOption(ID, "badge")) return;
    for (const list of document.querySelectorAll<HTMLElement>('[class*="badgeList"], [aria-label="User Badges"]')) {
        if (list.querySelector(".nc-local-badge")) continue;
        const profile = list.closest('[class*="userPopout"], [class*="userProfile"], [class*="profilePanel"], [class*="user-profile"], [role="dialog"]');
        if (!profile?.querySelector(`img[src*="/avatars/${me.id}/"], [data-user-id="${me.id}"]`)) continue;
        list.appendChild(h("div", { className: "nc-local-badge", title: t("plugin.fakeNitro.badge"), "aria-label": t("plugin.fakeNitro.badge"), html: Icons.logo }));
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.fakeNitro.name",
    description: "plugin.fakeNitro.desc",
    authors: ["NexusCord"],
    options: {
        emojiSize: {
            type: "select",
            label: "plugin.fakeNitro.opt.emojiSize",
            default: 48,
            options: [
                { label: "32 px", value: 32 },
                { label: "48 px", value: 48 },
                { label: "64 px", value: 64 },
                { label: "96 px", value: 96 },
                { label: "128 px", value: 128 }
            ]
        },
        stickers: { type: "boolean", label: "plugin.fakeNitro.opt.stickers", default: true },
        cosmetics: { type: "boolean", label: "plugin.fakeNitro.opt.cosmetics", default: true },
        badge: { type: "boolean", label: "plugin.fakeNitro.opt.badge", default: true }
    },

    start() {
        // Client-side unlocks
        cleanups.push(
            waitFor(filters.byProps("canUseEmojisEverywhere"), utils => {
                const checks = [
                    ...EMOJI_CHECKS,
                    ...(getOption(ID, "stickers") ? STICKER_CHECKS : []),
                    ...(getOption(ID, "cosmetics") ? COSMETIC_CHECKS : [])
                ];
                for (const name of checks) {
                    if (typeof utils[name] === "function") Patcher.instead(ID, utils, name, (s, a, orig) => (hasRealNitro() ? orig.apply(s, a) : true));
                }
            }, ID)
        );

        // Outgoing messages
        cleanups.push(
            waitFor(filters.byProps("sendMessage", "editMessage"), MessageActions => {
                Patcher.before(ID, MessageActions, "sendMessage", (_s, args) => {
                    if (hasRealNitro()) return;
                    const [channelId, message, , options] = args;
                    const guildId = ChannelStore.getChannel?.(channelId)?.guild_id;
                    rewriteMessage(message, guildId, Number(getOption(ID, "emojiSize")) || 48);

                    const ids: string[] | undefined = options?.stickerIds;
                    if (getOption(ID, "stickers") && Array.isArray(ids) && ids.length) {
                        const links: string[] = [];
                        options.stickerIds = ids.filter(id => {
                            const sticker = StickersStore.getStickerById?.(id);
                            const url = isStickerUnavailable(sticker, guildId) ? stickerUrl(sticker) : null;
                            if (url) links.push(url);
                            return !url;
                        });
                        if (links.length) message.content = [message.content, ...links].filter(Boolean).join(" ");
                    }
                    return args;
                });
                Patcher.before(ID, MessageActions, "editMessage", (_s, args) => {
                    if (hasRealNitro()) return;
                    const [channelId, , message] = args;
                    rewriteMessage(message, ChannelStore.getChannel?.(channelId)?.guild_id, Number(getOption(ID, "emojiSize")) || 48);
                });
                if (typeof MessageActions.sendStickers === "function") {
                    Patcher.instead(ID, MessageActions, "sendStickers", (self, args, original) => {
                        const [channelId, stickerIds, content = ""] = args;
                        if (hasRealNitro() || !getOption(ID, "stickers") || !Array.isArray(stickerIds)) return original.apply(self, args);
                        const guildId = ChannelStore.getChannel?.(channelId)?.guild_id;
                        const links = stickerIds
                            .map((id: string) => StickersStore.getStickerById?.(id))
                            .filter((s: any) => isStickerUnavailable(s, guildId))
                            .map(stickerUrl)
                            .filter(Boolean);
                        if (!links.length) return original.apply(self, args);
                        return MessageActions.sendMessage(channelId, {
                            content: [content, ...links].filter(Boolean).join(" "),
                            tts: false,
                            invalidEmojis: [],
                            validNonShortcutEmojis: []
                        });
                    });
                }
            }, ID)
        );

        // Local badge on your own profile
        setStyle("nc-fake-nitro", `.nc-local-badge{width:22px;height:22px;border-radius:6px;display:inline-grid;place-items:center;background:linear-gradient(135deg,#7c5cff,#3ec6ff);margin:0 2px}.nc-local-badge svg{width:14px;height:14px}`);
        let queued = false;
        const obs = new MutationObserver(() => {
            if (queued) return;
            queued = true;
            setTimeout(() => {
                queued = false;
                injectBadges();
            }, 150);
        });
        onDomReady(() => obs.observe(document.body, { childList: true, subtree: true }));
        cleanups.push(() => obs.disconnect());
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle("nc-fake-nitro", null);
        document.querySelectorAll(".nc-local-badge").forEach(el => el.remove());
    }
});
