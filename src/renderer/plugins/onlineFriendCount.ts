/* Online friends: "N online" under the Home button of the server list. */
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { NavigationRouter, PresenceStore, RelationshipStore } from "../core/discord";
import { findStore } from "../core/webpack";

const ID = "onlineFriendCount";
const cleanups: (() => void)[] = [];

function count(): number | null {
    try {
        const direct = findStore("OnlineFriendsStore")?.getOnlineFriendCount?.();
        if (typeof direct === "number") return direct;
        // Fallback: friends list + presence
        const ids: string[] = RelationshipStore.getFriendIDs?.() ?? [];
        if (!ids.length) return null;
        return ids.filter(id => {
            const s = PresenceStore.getStatus?.(id);
            return s && s !== "offline" && s !== "invisible";
        }).length;
    } catch {
        return null;
    }
}

function paint() {
    const n = count();
    document.querySelectorAll<HTMLElement>(".nc-online-friends").forEach(el => {
        el.textContent = n == null ? "" : t("plugin.onlineFriendCount.label", { n });
        el.hidden = n == null;
    });
}

function inject(nav: HTMLElement) {
    if (nav.querySelector(".nc-online-friends")) return;
    const el = h("button", { type: "button", className: "nc-online-friends", title: t("plugin.onlineFriendCount.title"), onClick: () => NavigationRouter.transitionTo?.("/channels/@me") });
    const home = nav.querySelector('[data-list-item-id="guildsnav___home"]')?.closest("[class*='listItem_']");
    home ? home.after(el) : (nav.querySelector('[class*="scroller"]') ?? nav).prepend(el);
    paint();
}

export default definePlugin({
    id: ID,
    name: "plugin.onlineFriendCount.name",
    description: "plugin.onlineFriendCount.desc",
    category: "utility",
    start() {
        setStyle(ID, `.nc-online-friends{display:block;width:56px;margin:2px auto 6px;padding:2px 0;border:0;background:none;color:var(--text-muted,#949ba4);font:700 10px/1.3 var(--font-primary,sans-serif);text-transform:uppercase;letter-spacing:.02em;text-align:center;cursor:pointer}.nc-online-friends:hover{color:var(--text-default,#dbdee1)}`);
        cleanups.push(observe(ID, 'nav[class*="guilds"], [data-list-id="guildsnav"]', el => inject((el.closest("nav") as HTMLElement) ?? el)));
        for (const type of ["PRESENCE_UPDATES", "PRESENCES_REPLACE", "RELATIONSHIP_ADD", "RELATIONSHIP_REMOVE", "CONNECTION_OPEN"]) cleanups.push(subscribe(type, () => setTimeout(paint, 50)));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        document.querySelectorAll(".nc-online-friends").forEach(e => e.remove());
        setStyle(ID, null);
    }
});
