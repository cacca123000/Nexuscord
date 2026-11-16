/* Platform indicators (#42): 🖥️ 📱 🌐 next to names - see which device people use. */
import { MessageStore, PresenceStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe, parseMessageElement, userIdFromElement } from "../core/domObserver";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "platformIndicators";
const cleanups: (() => void)[] = [];
const ICON: Record<string, string> = { desktop: "🖥️", mobile: "📱", web: "🌐", embedded: "🎮" };

function statusOf(userId: string): Record<string, string> {
    try {
        return PresenceStore.getClientStatus?.(userId) ?? PresenceStore.getState?.()?.clientStatuses?.[userId] ?? {};
    } catch {
        return {};
    }
}

function render(target: HTMLElement, userId: string) {
    target.parentElement?.querySelector(":scope > .nc-platforms")?.remove();
    const st = statusOf(userId);
    const keys = Object.keys(st).filter(k => ICON[k]);
    if (!keys.length) return;
    target.after(h("span", { className: "nc-platforms", title: keys.map(k => `${t(`plugin.platformIndicators.${k}` as any)}: ${st[k]}`).join("\n") }, keys.map(k => h("span", { className: `nc-pf nc-pf-${st[k]}` }, ICON[k]))));
}

function onUsername(el: HTMLElement) {
    const ids = parseMessageElement(el);
    const uid = userIdFromElement(el) ?? (ids ? MessageStore.getMessage?.(ids.channelId, ids.messageId)?.author?.id : null);
    if (uid) render(el, uid);
}

function onMember(el: HTMLElement) {
    if (!getOption(ID, "memberList")) return;
    const uid = userIdFromElement(el);
    const name = el.querySelector<HTMLElement>('[class*="username"], [class*="name"]');
    if (uid && name) render(name, uid);
}

export default definePlugin({
    id: ID,
    name: "plugin.platformIndicators.name",
    description: "plugin.platformIndicators.desc",
    category: "chat",
    options: { memberList: { type: "boolean", label: "plugin.platformIndicators.opt.memberList", default: true } },
    start() {
        setStyle("nc-platforms", `.nc-platforms{display:inline-flex;gap:2px;margin-left:5px;font-size:11px;vertical-align:1px}.nc-pf-idle{filter:sepia(1) saturate(4) hue-rotate(5deg)}.nc-pf-dnd{filter:sepia(1) saturate(5) hue-rotate(-40deg)}.nc-pf-offline{opacity:.4}`);
        cleanups.push(observe(ID, 'li[id^="chat-messages-"] h3 [class*="username"]', onUsername), observe(ID, '[data-list-item-id^="members-"], [class*="member_"]', onMember));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle("nc-platforms", null);
        document.querySelectorAll(".nc-platforms").forEach(e => e.remove());
    }
});
