/* Relationship notifier (#45): know when someone unfriends you or you lose a server. */
import { GuildStore, RelationshipStore, UserStore } from "../core/discord";
import { h } from "../core/dom";
import { subscribe } from "../core/flux";
import { getLanguage, t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { toast } from "../core/ui";

const ID = "relationshipNotifier";
const logStore = dataStore<{ items: { at: number; text: string }[] }>("relationshipLog", { items: [] });
const unsubs: (() => void)[] = [];
const guildNames = new Map<string, string>();
let selfRemoving = new Set<string>();

function record(text: string) {
    logStore.update(d => {
        d.items.push({ at: Date.now(), text });
        if (d.items.length > 300) d.items.shift();
    });
    toast(text, "warn", 10000);
    if (getOption(ID, "system") && "Notification" in window) new Notification("NexusCord", { body: text });
}

function Panel(): Node {
    const items = logStore.get().items.slice().reverse();
    return h("div", { className: "nc-stack" }, items.length ? items.slice(0, 100).map(i => h("div", { className: "nc-row", style: "padding:8px 12px" }, h("div", { className: "nc-row-label", style: "font-weight:400" }, i.text), h("span", { className: "nc-sub" }, new Date(i.at).toLocaleString(getLanguage())))) : h("div", { className: "nc-empty" }, t("plugin.relationshipNotifier.empty")));
}

export default definePlugin({
    id: ID,
    name: "plugin.relationshipNotifier.name",
    description: "plugin.relationshipNotifier.desc",
    category: "chat",
    options: {
        friends: { type: "boolean", label: "plugin.relationshipNotifier.opt.friends", default: true },
        servers: { type: "boolean", label: "plugin.relationshipNotifier.opt.servers", default: true },
        system: { type: "boolean", label: "plugin.relationshipNotifier.opt.system", default: false }
    },
    settingsPanel: Panel,
    start() {
        const snapshot = () => Object.values<any>(GuildStore.getGuilds?.() ?? {}).forEach(g => guildNames.set(g.id, g.name));
        setTimeout(snapshot, 3000);
        unsubs.push(
            subscribe("GUILD_CREATE", a => a.guild?.id && guildNames.set(a.guild.id, a.guild.name)),
            subscribe("RELATIONSHIP_REMOVE", a => {
                const rel = a.relationship;
                if (!getOption(ID, "friends") || rel?.type !== 1 || selfRemoving.has(rel.id)) return;
                const u = UserStore.getUser?.(rel.id);
                record(t("plugin.relationshipNotifier.unfriended", { name: u?.globalName ?? u?.username ?? rel.id }));
            }),
            subscribe("GUILD_DELETE", a => {
                const g = a.guild;
                if (!getOption(ID, "servers") || !g?.id || g.unavailable || selfRemoving.has(g.id)) return;
                record(t("plugin.relationshipNotifier.removed", { name: guildNames.get(g.id) ?? g.id }));
            })
        );
        // Ignore removals the user started themselves (leave server / remove friend buttons)
        const mark = (e: MouseEvent) => {
            const txt = (e.target as Element)?.closest?.('[role="menuitem"], button')?.textContent?.toLowerCase() ?? "";
            if (/leave|lascia|remove friend|rimuovi/.test(txt)) {
                selfRemoving = new Set([...Object.keys(GuildStore.getGuilds?.() ?? {}), ...Object.keys(RelationshipStore.getMutableRelationships?.() ?? RelationshipStore.getRelationships?.() ?? {})]);
                setTimeout(() => (selfRemoving = new Set()), 8000);
            }
        };
        document.addEventListener("click", mark, true);
        unsubs.push(() => document.removeEventListener("click", mark, true));
    },
    stop() {
        unsubs.splice(0).forEach(u => u());
    }
});
