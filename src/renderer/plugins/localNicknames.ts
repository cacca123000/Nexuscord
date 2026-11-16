/* Local nicknames (#29): give anyone a nickname only YOU see, everywhere in Discord. */
import { registerMenuItem } from "../core/contextMenu";
import { GuildMemberStore, RelationshipStore, UserStore } from "../core/discord";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { openModal, toast } from "../core/ui";
import { filters, waitFor } from "../core/webpack";

const ID = "localNicknames";
const store = dataStore<Record<string, string>>("localNicknames", {});
const cleanups: (() => void)[] = [];

function refresh() {
    for (const s of [GuildMemberStore, RelationshipStore, UserStore]) {
        try {
            (s as any).emitChange?.();
        } catch { /* ignore */ }
    }
}

function edit(userId: string) {
    const input = h("input", { className: "nc-input", style: "width:100%", placeholder: t("plugin.localNicknames.placeholder"), value: store.get()[userId] ?? "" }) as HTMLInputElement;
    let save = false;
    openModal({
        title: t("plugin.localNicknames.title", { name: UserStore.getUser?.(userId)?.username ?? userId }),
        body: input,
        onClose: () => {
            if (!save) return;
            store.update(d => {
                if (input.value.trim()) d[userId] = input.value.trim().slice(0, 64);
                else delete d[userId];
            });
            refresh();
            toast(t("plugin.localNicknames.saved"), "success", 1600);
        },
        buttons: [{ label: t("common.cancel"), variant: "ghost" }, { label: t("common.save"), variant: "primary", onClick: () => void (save = true) }]
    });
    setTimeout(() => input.focus(), 50);
}

export default definePlugin({
    id: ID,
    name: "plugin.localNicknames.name",
    description: "plugin.localNicknames.desc",
    category: "chat",
    start() {
        const nick = (id: unknown) => (typeof id === "string" ? store.get()[id] : undefined);
        cleanups.push(
            waitFor(filters.byStoreName("GuildMemberStore"), s => {
                Patcher.after(ID, s, "getNick", (_x, [, userId], ret) => nick(userId) ?? ret);
                Patcher.after(ID, s, "getMember", (_x, [, userId], ret) => (ret && nick(userId) ? { ...ret, nick: nick(userId) } : ret));
            }, ID),
            waitFor(filters.byStoreName("RelationshipStore"), s => {
                if (typeof s.getNickname === "function") Patcher.after(ID, s, "getNickname", (_x, [userId], ret) => nick(userId) ?? ret);
            }, ID),
            registerMenuItem(ID, { id: "nc-local-nick", label: () => t("plugin.localNicknames.action"), when: m => !!m.userId, action: m => edit(m.userId!), order: 30 })
        );
        refresh();
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setTimeout(refresh, 0);
    }
});
