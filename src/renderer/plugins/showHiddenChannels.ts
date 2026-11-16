/*
 * ShowHiddenChannels - lists channels you can't access (with a lock) and shows
 * their metadata read-only. Messages of hidden channels are never requested:
 * selecting one is intercepted and a details modal opens instead.
 *
 * Strategy (each step isolated, any may fail after a Discord update):
 *  1. GuildChannelStore.getChannels() is patched to append hidden channels
 *  2. PermissionStore.can(VIEW_CHANNEL) answers true for hidden channels ONLY
 *     while the channel list is being computed (ChannelListStore)
 *  3. Navigation (transitionTo / CHANNEL_SELECT / sidebar clicks) to a hidden
 *     channel is cancelled and replaced by the read-only modal
 */
import { h, onDomReady, setStyle } from "../core/dom";
import { intercept } from "../core/flux";
import { getLanguage, t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";
import { Icons, openModal } from "../core/ui";
import { findStore, waitFor, filters } from "../core/webpack";

const ID = "showHiddenChannels";
const VIEW_CHANNEL = 1n << 10n;
const DISCORD_EPOCH = 1420070400000n;
const TEXT_TYPES = new Set([0, 5, 15, 16]); // text, announcement, forum, media
const VOICE_TYPES = new Set([2, 13]); // voice, stage

const hidden = new Set<string>();
const cleanups: (() => void)[] = [];
let computingList = 0;
let origCan: ((perm: any, ch: any) => boolean) | null = null;

const toBig = (v: unknown): bigint => {
    try {
        return typeof v === "bigint" ? v : BigInt(v as any);
    } catch {
        return 0n;
    }
};

function canView(channel: any): boolean {
    const PermissionStore = findStore("PermissionStore");
    const can = origCan ?? PermissionStore?.can?.bind(PermissionStore);
    if (!can) return true;
    try {
        return can.call(PermissionStore, VIEW_CHANNEL, channel);
    } catch {
        return true;
    }
}

function isHiddenChannel(channel: any): boolean {
    if (!channel?.guild_id || channel.type === 4 /* category */) return false;
    if (!(TEXT_TYPES.has(channel.type) || VOICE_TYPES.has(channel.type))) return false;
    const h = !canView(channel);
    if (h) hidden.add(channel.id);
    else hidden.delete(channel.id);
    return h;
}

function updateLockStyles() {
    const sel = [...hidden].map(id => `[data-list-item-id="channels___${id}"]`);
    if (!sel.length) return setStyle("nc-hidden-channels", null);
    const lock = `url("data:image/svg+xml,${encodeURIComponent(Icons.lock.replace("currentColor", "#000"))}")`;
    setStyle(
        "nc-hidden-channels",
        `${sel.join(",")}{opacity:.55;position:relative}` +
            `${sel.map(s => s + "::after").join(",")}{content:"";position:absolute;right:8px;top:50%;width:14px;height:14px;margin-top:-7px;background:var(--channel-icon,#949ba4);-webkit-mask:${lock} center/contain no-repeat;mask:${lock} center/contain no-repeat;pointer-events:none}`
    );
}

function getRole(guildId: string, roleId: string): any {
    try {
        return (
            findStore("GuildRoleStore")?.getRole?.(guildId, roleId) ??
            findStore("GuildStore")?.getRole?.(guildId, roleId) ??
            findStore("GuildStore")?.getGuild?.(guildId)?.roles?.[roleId]
        );
    } catch {
        return undefined;
    }
}

export function showHiddenChannelModal(channel: any) {
    const locale = getLanguage() === "it" ? "it-IT" : "en-US";
    let created = "—";
    try {
        created = new Date(Number((toBig(channel.id) >> 22n) + DISCORD_EPOCH)).toLocaleString(locale);
    } catch { /* invalid id */ }

    const overwrites: any[] = Object.values(channel.permissionOverwrites ?? channel.permission_overwrites ?? {});
    const roles = overwrites
        .filter(o => (o.type === 0 || o.type === "role") && (toBig(o.allow) & VIEW_CHANNEL) !== 0n)
        .map(o => getRole(channel.guild_id, o.id))
        .filter(Boolean);

    const type = TEXT_TYPES.has(channel.type)
        ? t("plugin.showHiddenChannels.text")
        : VOICE_TYPES.has(channel.type)
          ? t("plugin.showHiddenChannels.voice")
          : t("plugin.showHiddenChannels.other");
    const slow = Number(channel.rateLimitPerUser ?? channel.rate_limit_per_user ?? 0);

    openModal({
        title: t("plugin.showHiddenChannels.modalTitle", { name: channel.name ?? channel.id }),
        icon: Icons.lock,
        body: h(
            "div",
            null,
            h("p", { className: "nc-sub" }, t("plugin.showHiddenChannels.noAccess")),
            h(
                "dl",
                { className: "nc-kv" },
                h("dt", null, t("plugin.showHiddenChannels.type")),
                h("dd", null, type),
                h("dt", null, t("plugin.showHiddenChannels.topic")),
                h("dd", null, channel.topic || t("plugin.showHiddenChannels.noTopic")),
                h("dt", null, t("plugin.showHiddenChannels.slowmode")),
                h("dd", null, slow ? t("plugin.showHiddenChannels.seconds", { n: slow }) : t("plugin.showHiddenChannels.slowmodeOff")),
                h("dt", null, t("plugin.showHiddenChannels.created")),
                h("dd", null, created),
                h("dt", null, t("plugin.showHiddenChannels.roles")),
                h(
                    "dd",
                    null,
                    roles.length
                        ? roles.map(r => h("span", { className: "nc-role" }, h("i", { style: { background: r.colorString || "#99aab5" } }), r.name))
                        : t("plugin.showHiddenChannels.everyone")
                )
            )
        )
    });
}

function openIfHidden(channelId: string | undefined): boolean {
    if (!channelId || !hidden.has(channelId)) return false;
    const channel = findStore("ChannelStore")?.getChannel?.(channelId);
    if (!channel || !isHiddenChannel(channel)) return false;
    showHiddenChannelModal(channel);
    return true;
}

export default definePlugin({
    id: ID,
    name: "plugin.showHiddenChannels.name",
    description: "plugin.showHiddenChannels.desc",
    authors: ["NexusCord"],

    start() {
        // (1) GuildChannelStore.getChannels
        cleanups.push(
            waitFor(filters.byStoreName("GuildChannelStore"), store => {
                Patcher.after(ID, store, "getChannels", (_s, [guildId], res) => {
                    const ChannelStore = findStore("ChannelStore");
                    const all = ChannelStore?.getMutableGuildChannelsForGuild?.(guildId);
                    if (!res || !all) return res;
                    const present = new Set<string>();
                    for (const k of ["SELECTABLE", "VOCAL"]) for (const e of res[k] ?? []) present.add(e.channel?.id);
                    const out = { ...res, SELECTABLE: [...(res.SELECTABLE ?? [])], VOCAL: [...(res.VOCAL ?? [])] };
                    for (const ch of Object.values<any>(all)) {
                        if (present.has(ch.id) || !isHiddenChannel(ch)) continue;
                        const entry = { channel: ch, comparator: ch.position ?? 0 };
                        (VOICE_TYPES.has(ch.type) ? out.VOCAL : out.SELECTABLE).push(entry);
                    }
                    updateLockStyles();
                    return out;
                });
            }, ID)
        );

        // (2) PermissionStore.can - only lie while the sidebar list is computed
        cleanups.push(
            waitFor(filters.byStoreName("PermissionStore"), store => {
                origCan = store.can.bind(store);
                Patcher.after(ID, store, "can", (_s, [perm, channel], res) => {
                    if (res || !computingList || toBig(perm) !== VIEW_CHANNEL || !channel?.id) return res;
                    return isHiddenChannel(channel) ? true : res;
                });
            }, ID)
        );
        cleanups.push(
            waitFor(filters.byStoreName("ChannelListStore"), store => {
                for (const method of ["getGuild", "getGuildWithoutChangingCommunityRows"]) {
                    if (typeof store[method] !== "function") continue;
                    Patcher.instead(ID, store, method, (self, args, original) => {
                        computingList++;
                        try {
                            return original.apply(self, args);
                        } finally {
                            computingList--;
                            queueMicrotask(updateLockStyles);
                        }
                    });
                }
            }, ID)
        );

        // (3) Never actually open a hidden channel
        cleanups.push(
            intercept(ID, action => {
                if (action.type === "CHANNEL_SELECT" && openIfHidden(action.channelId)) return true;
            })
        );
        cleanups.push(
            waitFor(filters.byProps("transitionTo", "replaceWith", "getHistory"), nav => {
                Patcher.instead(ID, nav, "transitionTo", (self, args, original) => {
                    const m = /^\/channels\/\d+\/(\d+)/.exec(String(args[0] ?? ""));
                    if (m && openIfHidden(m[1])) return;
                    return original.apply(self, args);
                });
            }, ID)
        );

        const onClick = (e: MouseEvent) => {
            const item = (e.target as Element | null)?.closest?.('[data-list-item-id^="channels___"]');
            const id = item?.getAttribute("data-list-item-id")?.slice("channels___".length);
            if (id && openIfHidden(id)) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        };
        onDomReady(() => document.addEventListener("click", onClick, true));
        cleanups.push(() => document.removeEventListener("click", onClick, true));
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
        hidden.clear();
        origCan = null;
        setStyle("nc-hidden-channels", null);
    }
});
