/* Pinned DMs (#39): pin conversations to the top of your DM list. */
import { registerMenuItem } from "../core/contextMenu";
import { ChannelStore, PrivateChannelSortStore } from "../core/discord";
import { setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { filters, waitFor } from "../core/webpack";

const ID = "pinDms";
const store = dataStore<{ ids: string[] }>("pinnedDms", { ids: [] });
const cleanups: (() => void)[] = [];

export function sortPinned(ids: string[], pinned: string[]): string[] {
    const set = new Set(pinned);
    return [...pinned.filter(id => ids.includes(id)), ...ids.filter(id => !set.has(id))];
}

function styles() {
    const sel = store.get().ids.map(id => `[data-list-item-id$="___${id}"] [class*="name"]::before`);
    setStyle("nc-pin-dms", sel.length ? `${sel.join(",")}{content:"📌 ";font-size:.85em}` : null);
}

function refresh() {
    styles();
    try {
        (PrivateChannelSortStore as any).emitChange?.();
    } catch { /* ignore */ }
}

export default definePlugin({
    id: ID,
    name: "plugin.pinDms.name",
    description: "plugin.pinDms.desc",
    category: "chat",
    start() {
        cleanups.push(
            waitFor(filters.byStoreName("PrivateChannelSortStore"), s => {
                Patcher.after(ID, s, "getPrivateChannelIds", (_x, _a, ids) => (Array.isArray(ids) && store.get().ids.length ? sortPinned(ids, store.get().ids) : ids));
                refresh();
            }, ID),
            registerMenuItem(ID, {
                id: "nc-pin-dm",
                order: 5,
                label: () => (store.get().ids.includes(lastDm ?? "") ? t("plugin.pinDms.unpin") : t("plugin.pinDms.pin")),
                when: m => {
                    const id = m.channelId;
                    const ch = id ? ChannelStore.getChannel?.(id) : null;
                    lastDm = ch && (ch.type === 1 || ch.type === 3) && !m.messageId ? id! : null;
                    return !!lastDm;
                },
                action: m => {
                    store.update(d => {
                        const i = d.ids.indexOf(m.channelId!);
                        if (i === -1) d.ids.unshift(m.channelId!);
                        else d.ids.splice(i, 1);
                    });
                    refresh();
                }
            })
        );
        styles();
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle("nc-pin-dms", null);
        setTimeout(refresh, 0);
    }
});
let lastDm: string | null = null;
