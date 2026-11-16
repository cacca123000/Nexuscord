/* Bookmarks & notes (#28): save messages locally, add notes, jump back later. */
import { addCommands } from "./commandPalette";
import { registerMenuItem } from "../core/contextMenu";
import { ChannelStore, GuildStore, jumpToMessage } from "../core/discord";
import { h } from "../core/dom";
import { getLanguage, t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, Icons, openModal, SearchBox, toast } from "../core/ui";

const ID = "bookmarks";
export interface Bookmark {
    id: string;
    channelId: string;
    guildId: string | null;
    author: string;
    content: string;
    note: string;
    savedAt: number;
}
const store = dataStore<{ items: Bookmark[] }>("bookmarks", { items: [] });
const cleanups: (() => void)[] = [];

function promptNote(initial: string): Promise<string | null> {
    return new Promise(res => {
        const ta = h("textarea", { className: "nc-textarea", placeholder: t("plugin.bookmarks.notePlaceholder") }, initial) as HTMLTextAreaElement;
        let value: string | null = null;
        openModal({ title: t("plugin.bookmarks.note"), body: ta, onClose: () => res(value), buttons: [{ label: t("common.cancel"), variant: "ghost" }, { label: t("common.save"), variant: "primary", onClick: () => void (value = ta.value) }] });
        setTimeout(() => ta.focus(), 50);
    });
}

function List(): Node {
    let q = "";
    const list = h("div", { className: "nc-stack" });
    const draw = () => {
        const needle = q.toLowerCase();
        const items = store.get().items.slice().reverse().filter(b => !needle || `${b.author} ${b.content} ${b.note}`.toLowerCase().includes(needle));
        list.replaceChildren(
            ...(items.length
                ? items.map(b =>
                      h(
                          "div",
                          { className: "nc-row", style: "align-items:flex-start" },
                          h("div", { className: "nc-row-label", style: "font-weight:400" }, h("b", null, b.author), h("span", { className: "nc-sub" }, ` · ${GuildStore.getGuild?.(b.guildId ?? "")?.name ?? "DM"} #${ChannelStore.getChannel?.(b.channelId)?.name ?? ""} · ${new Date(b.savedAt).toLocaleDateString(getLanguage())}`), h("div", { style: "white-space:pre-wrap;margin-top:3px" }, b.content || "—"), b.note ? h("div", { className: "nc-tag accent", style: "margin-top:6px;text-transform:none;letter-spacing:0;font-size:12px;white-space:normal" }, "📝 " + b.note) : null),
                          Button({ variant: "icon", title: t("plugin.bookmarks.note"), icon: Icons.gear, onClick: async () => { const n = await promptNote(b.note); if (n != null) { store.update(d => void (d.items.find(x => x.id === b.id)!.note = n)); draw(); } } }),
                          Button({ variant: "icon", title: t("plugin.messageLogger.jump"), icon: Icons.external, onClick: () => jumpToMessage(b.guildId, b.channelId, b.id) }),
                          Button({ variant: "icon", title: t("store.remove"), icon: Icons.trash, onClick: () => (store.update(d => void (d.items = d.items.filter(x => x.id !== b.id))), draw()) })
                      )
                  )
                : [h("div", { className: "nc-empty" }, t("plugin.bookmarks.empty"))])
        );
    };
    draw();
    return h("div", { className: "nc-stack" }, SearchBox({ value: "", placeholder: t("common.search"), focusKey: "bm-search", onInput: v => ((q = v), draw()) }), list);
}

export const openBookmarks = () => openModal({ title: t("plugin.bookmarks.name"), body: List(), medium: true });

addCommands(() => [{ icon: "🔖", label: t("plugin.bookmarks.open"), kind: t("palette.kind.action"), run: openBookmarks }]);

export default definePlugin({
    id: ID,
    name: "plugin.bookmarks.name",
    description: "plugin.bookmarks.desc",
    category: "chat",
    settingsPanel: List,
    start() {
        const save = async (m: any, withNote: boolean) => {
            const note = withNote ? await promptNote("") : "";
            if (note === null) return;
            store.update(d => {
                d.items = d.items.filter(x => x.id !== m.messageId);
                d.items.push({ id: m.messageId, channelId: m.channelId, guildId: ChannelStore.getChannel?.(m.channelId)?.guild_id ?? null, author: m.message?.author?.globalName ?? m.message?.author?.username ?? "?", content: String(m.message?.content ?? "").slice(0, 2000), note: note ?? "", savedAt: Date.now() });
            });
            toast(t("plugin.bookmarks.saved"), "success", 1800);
        };
        cleanups.push(
            registerMenuItem(ID, { id: "nc-bookmark", label: () => t("plugin.bookmarks.add"), when: m => !!m.messageId, action: m => save(m, false), order: 20 }),
            registerMenuItem(ID, { id: "nc-bookmark-note", label: () => t("plugin.bookmarks.addNote"), when: m => !!m.messageId, action: m => save(m, true), order: 21 })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
