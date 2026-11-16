/* Double-click actions (#37): double-click your message to edit it, others' to reply. */
import { ChannelStore, currentUser, dispatch, getMessage, MessageActions } from "../core/discord";
import { onDomReady } from "../core/dom";
import { parseMessageElement } from "../core/domObserver";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "doubleClickActions";

function onDbl(e: MouseEvent) {
    const target = e.target as Element;
    if (target.closest("a, img, video, button, [role='button'], textarea, [contenteditable='true']")) return;
    const ids = parseMessageElement(target);
    if (!ids) return;
    const mod = String(getOption(ID, "modifier"));
    if ((mod === "ctrl" && !e.ctrlKey) || (mod === "shift" && !e.shiftKey)) return;
    const msg = getMessage(ids.channelId, ids.messageId);
    if (!msg) return;
    const own = msg.author?.id === currentUser()?.id;
    if (own && getOption(ID, "editOwn")) {
        MessageActions.startEditMessage?.(ids.channelId, ids.messageId, msg.content);
    } else if (!own && getOption(ID, "replyOthers")) {
        dispatch({ type: "CREATE_PENDING_REPLY", channel: ChannelStore.getChannel?.(ids.channelId), message: msg, shouldMention: !!getOption(ID, "mention"), showMentionToggle: true });
    } else return;
    getSelection()?.removeAllRanges();
    e.preventDefault();
}

export default definePlugin({
    id: ID,
    name: "plugin.doubleClickActions.name",
    description: "plugin.doubleClickActions.desc",
    category: "chat",
    options: {
        editOwn: { type: "boolean", label: "plugin.doubleClickActions.opt.editOwn", default: true },
        replyOthers: { type: "boolean", label: "plugin.doubleClickActions.opt.replyOthers", default: true },
        mention: { type: "boolean", label: "plugin.doubleClickActions.opt.mention", default: true },
        modifier: {
            type: "select",
            label: "plugin.doubleClickActions.opt.modifier",
            default: "none",
            options: [
                { label: "plugin.doubleClickActions.mod.none", value: "none" },
                { label: "Ctrl", value: "ctrl" },
                { label: "Shift", value: "shift" }
            ]
        }
    },
    start() {
        onDomReady(() => document.addEventListener("dblclick", onDbl, true));
    },
    stop() {
        document.removeEventListener("dblclick", onDbl, true);
    }
});
