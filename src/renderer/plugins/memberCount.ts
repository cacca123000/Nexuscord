/* Member count: online / total members at the top of the member list. */
import { SelectedGuildStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { subscribe } from "../core/flux";
import { getLanguage, t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { findStore } from "../core/webpack";

const ID = "memberCount";
const cleanups: (() => void)[] = [];

function render(list: HTMLElement) {
    const guildId = SelectedGuildStore.getGuildId?.();
    const store = findStore("GuildMemberCountStore");
    let bar = list.querySelector<HTMLElement>(":scope > .nc-member-count");
    if (!guildId || !store) return bar?.remove();
    const total = store.getMemberCount?.(guildId);
    const online = store.getOnlineCount?.(guildId);
    if (total == null) return bar?.remove();
    const fmt = (n: number) => n.toLocaleString(getLanguage());
    if (!bar) {
        bar = h("div", { className: "nc-member-count" });
        list.prepend(bar);
    }
    bar.replaceChildren(
        ...(online != null ? [h("span", { className: "nc-mc-dot on" }), h("span", null, t("plugin.memberCount.online", { n: fmt(online) }))] : []),
        h("span", { className: "nc-mc-dot" }),
        h("span", null, t("plugin.memberCount.total", { n: fmt(total) }))
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.memberCount.name",
    description: "plugin.memberCount.desc",
    category: "utility",
    start() {
        setStyle(ID, `.nc-member-count{display:flex;align-items:center;gap:6px;padding:14px 16px 2px;font:600 12px var(--font-primary,sans-serif);color:var(--channels-default,var(--text-muted,#949ba4))}.nc-mc-dot{width:8px;height:8px;border-radius:50%;background:var(--status-offline,#80848e);margin-left:4px}.nc-mc-dot.on{background:var(--status-positive,#23a55a);margin-left:0}`);
        const sel = '[class*="membersWrap_"] [class*="members_"], [class*="membersWrap_"] [role="list"]';
        cleanups.push(observe(ID, sel, el => render(el)));
        cleanups.push(subscribe("GUILD_MEMBER_LIST_UPDATE", () => document.querySelectorAll<HTMLElement>(sel).forEach(render)));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        document.querySelectorAll(".nc-member-count").forEach(e => e.remove());
        setStyle(ID, null);
    }
});
