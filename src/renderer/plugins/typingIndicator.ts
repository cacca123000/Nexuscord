/* Typing indicator: animated dots next to channels and DMs where someone is typing. */
import { currentUser, TypingStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "typingIndicator";
const cleanups: (() => void)[] = [];
const typing = new Map<string, Set<string>>();

function refresh(channelId: string) {
    const me = currentUser()?.id;
    let users: string[] = [];
    try {
        users = Object.keys(TypingStore.getTypingUsers?.(channelId) ?? {}).filter(u => u !== me);
    } catch { /* ignore */ }
    if (users.length) typing.set(channelId, new Set(users));
    else typing.delete(channelId);
    paint(channelId);
}

function paint(channelId: string) {
    const n = typing.get(channelId)?.size ?? 0;
    for (const item of document.querySelectorAll<HTMLElement>(`[data-list-item-id="channels___${channelId}"], [data-list-item-id$="___${channelId}"]`)) {
        if (getOption(ID, "dmsOnly") && item.getAttribute("data-list-item-id")!.startsWith("channels___")) continue;
        const host = (item.querySelector('[class*="name_"], [class*="channelName"]') as HTMLElement | null)?.parentElement ?? item;
        let dot = host.querySelector<HTMLElement>(":scope > .nc-typing-dots");
        if (!n) {
            dot?.remove();
            continue;
        }
        if (!dot) {
            dot = h("span", { className: "nc-typing-dots", "aria-hidden": "true" }, h("i", null), h("i", null), h("i", null));
            host.appendChild(dot);
        }
        dot.title = t("plugin.typingIndicator.title", { n });
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.typingIndicator.name",
    description: "plugin.typingIndicator.desc",
    category: "chat",
    options: { dmsOnly: { type: "boolean", label: "plugin.typingIndicator.opt.dmsOnly", default: false } },
    start() {
        setStyle(ID, `.nc-typing-dots{display:inline-flex;gap:2px;margin-left:6px;align-items:center;flex:none}.nc-typing-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.35;animation:nc-typing 1.2s infinite}.nc-typing-dots i:nth-child(2){animation-delay:.2s}.nc-typing-dots i:nth-child(3){animation-delay:.4s}@keyframes nc-typing{30%{opacity:1;transform:translateY(-2px)}60%{opacity:.35;transform:none}}`);
        for (const type of ["TYPING_START", "TYPING_STOP"]) cleanups.push(subscribe(type, a => a.channelId && refresh(a.channelId)));
        cleanups.push(subscribe("MESSAGE_CREATE", a => a.channelId && setTimeout(() => refresh(a.channelId), 50)));
        // Re-apply when Discord re-renders a channel row
        cleanups.push(
            observe(ID, '[data-list-item-id^="channels___"], [data-list-item-id^="private-channels-"]', el => {
                const id = /___(\d+)$/.exec(el.getAttribute("data-list-item-id") ?? "")?.[1];
                if (id && typing.has(id)) paint(id);
            })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        typing.clear();
        document.querySelectorAll(".nc-typing-dots").forEach(e => e.remove());
        setStyle(ID, null);
    }
});
