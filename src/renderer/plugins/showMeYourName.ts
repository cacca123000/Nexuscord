/* Show usernames: the real @username next to display names and server nicknames in chat. */
import { MessageStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe, parseMessageElement } from "../core/domObserver";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "showMeYourName";
let off = () => {};

function onName(el: HTMLElement) {
    if (el.parentElement?.querySelector(":scope > .nc-real-name")) return;
    const ids = parseMessageElement(el);
    const author = ids && MessageStore.getMessage?.(ids.channelId, ids.messageId)?.author;
    if (!author?.username || author.bot) return;
    const shown = (el.textContent ?? "").trim().toLowerCase();
    if (getOption(ID, "onlyDifferent") && shown === author.username.toLowerCase()) return;
    el.after(h("span", { className: "nc-real-name" }, "@" + author.username));
}

export default definePlugin({
    id: ID,
    name: "plugin.showMeYourName.name",
    description: "plugin.showMeYourName.desc",
    category: "chat",
    options: { onlyDifferent: { type: "boolean", label: "plugin.showMeYourName.opt.onlyDifferent", default: true } },
    start() {
        setStyle(ID, `.nc-real-name{margin-left:6px;font-size:.85em;font-weight:500;color:var(--text-muted,#949ba4)}`);
        off = observe(ID, 'li[id^="chat-messages-"] h3 [class*="username_"]', onName);
    },
    stop() {
        off();
        document.querySelectorAll(".nc-real-name").forEach(e => e.remove());
        setStyle(ID, null);
    }
});
