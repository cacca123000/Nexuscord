/* Friend online (#73): a notification when friends come online (all, or only chosen ones). */
import { RelationshipStore, UserStore } from "../core/discord";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "friendOnline";
const lastStatus = new Map<string, string>();
const cooldown = new Map<string, number>();
let off = () => {};

function onPresence(a: any) {
    const updates = a.updates ?? (a.user ? [a] : []);
    const only = String(getOption(ID, "only") || "").split(/[\s,]+/).filter(Boolean);
    for (const u of updates) {
        const id = u.user?.id;
        if (!id || u.guildId) continue;
        const prev = lastStatus.get(id);
        lastStatus.set(id, u.status);
        if (!RelationshipStore.isFriend?.(id) || (only.length && !only.includes(id))) continue;
        if (u.status === "online" && prev && prev !== "online" && prev !== "idle" && prev !== "dnd") {
            if (Date.now() - (cooldown.get(id) ?? 0) < 10 * 60_000) continue;
            cooldown.set(id, Date.now());
            const user = UserStore.getUser?.(id);
            const name = user?.globalName ?? user?.username ?? id;
            toast(t("plugin.friendOnline.online", { name }), "success", 4000);
            if (getOption(ID, "system") && document.visibilityState !== "visible" && "Notification" in window) new Notification(t("plugin.friendOnline.online", { name }), { silent: true });
        }
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.friendOnline.name",
    description: "plugin.friendOnline.desc",
    category: "fun",
    options: {
        only: { type: "string", label: "plugin.friendOnline.opt.only", hint: "plugin.friendOnline.opt.onlyHint", default: "" },
        system: { type: "boolean", label: "plugin.friendOnline.opt.system", default: true }
    },
    start() {
        off = subscribe("PRESENCE_UPDATES", onPresence);
    },
    stop() {
        off();
        lastStatus.clear();
    }
});
