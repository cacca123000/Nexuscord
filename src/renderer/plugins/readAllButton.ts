/* Read all (#41): one button above your server list marks every server as read. */
import { GuildChannelStore, GuildStore, ReadStateStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { dispatch } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "readAllButton";
let off = () => {};

export function markAllRead(): number {
    const channels: { channelId: string; messageId: string; readStateType: number }[] = [];
    for (const guild of Object.values<any>(GuildStore.getGuilds?.() ?? {})) {
        const c = GuildChannelStore.getChannels?.(guild.id);
        for (const e of [...(c?.SELECTABLE ?? []), ...(c?.VOCAL ?? [])]) {
            const id = e.channel?.id;
            if (id && ReadStateStore.hasUnread?.(id)) channels.push({ channelId: id, messageId: ReadStateStore.lastMessageId?.(id), readStateType: 0 });
        }
    }
    if (channels.length) dispatch({ type: "BULK_ACK", context: "APP", channels });
    return channels.length;
}

function inject(nav: HTMLElement) {
    if (nav.querySelector(".nc-read-all")) return;
    const btn = h("button", { type: "button", className: "nc-read-all", title: t("plugin.readAllButton.title"), onClick: () => toast(t("plugin.readAllButton.done", { n: markAllRead() }), "success", 2000) }, t("plugin.readAllButton.label"));
    (nav.querySelector('[class*="scroller"]') ?? nav).prepend(btn);
}

export default definePlugin({
    id: ID,
    name: "plugin.readAllButton.name",
    description: "plugin.readAllButton.desc",
    category: "chat",
    start() {
        setStyle("nc-read-all", `.nc-read-all{display:block;width:48px;margin:6px auto 4px;padding:4px 0;border:0;border-radius:8px;background:color-mix(in srgb,var(--nc-accent,#e57a4c) 22%,transparent);color:var(--header-primary,#fff);font:700 10px var(--font-primary,sans-serif);text-transform:uppercase;cursor:pointer}.nc-read-all:hover{background:var(--nc-accent,#e57a4c)}`);
        off = observe(ID, 'nav[class*="guilds"], [data-list-id="guildsnav"]', el => inject(el.closest("nav") ?? el));
    },
    stop() {
        off();
        setStyle("nc-read-all", null);
        document.querySelectorAll(".nc-read-all").forEach(e => e.remove());
    }
});
