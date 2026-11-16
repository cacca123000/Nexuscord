/* Quick reply: Ctrl+↑ / Ctrl+↓ in the message box picks the message you're replying to. */
import { ChannelStore, MessageStore, SelectedChannelStore } from "../core/discord";
import { onDomReady } from "../core/dom";
import { dispatch, subscribe } from "../core/flux";
import { definePlugin, getOption, isEnabled } from "../core/pluginManager";

const ID = "quickReply";
const cleanups: (() => void)[] = [];
let index = -1;

function messages(channelId: string): any[] {
    const cm = MessageStore.getMessages?.(channelId);
    const arr: any[] = cm?._array ?? cm?.toArray?.() ?? [];
    return arr.filter(m => m && (m.type === 0 || m.type === 19) && !m.deleted);
}

function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const box = (e.target as HTMLElement | null)?.closest?.('[role="textbox"]');
    if (!box) return;
    const channelId = SelectedChannelStore.getChannelId?.();
    const channel = channelId && ChannelStore.getChannel?.(channelId);
    if (!channel) return;
    const list = messages(channelId);
    if (!list.length) return;
    e.preventDefault();
    e.stopPropagation();
    index = Math.max(-1, Math.min(list.length - 1, index + (e.key === "ArrowUp" ? 1 : -1)));
    if (index < 0) {
        dispatch({ type: "DELETE_PENDING_REPLY", channelId });
        return;
    }
    const message = list[list.length - 1 - index];
    const mention = isEnabled("noReplyMention") ? false : getOption(ID, "mention") !== false;
    dispatch({ type: "CREATE_PENDING_REPLY", channel, message, shouldMention: mention, showMentionToggle: channel.guild_id != null });
}

export default definePlugin({
    id: ID,
    name: "plugin.quickReply.name",
    description: "plugin.quickReply.desc",
    category: "chat",
    options: { mention: { type: "boolean", label: "plugin.quickReply.opt.mention", default: true } },
    start() {
        onDomReady(() => document.addEventListener("keydown", onKey, true));
        cleanups.push(() => document.removeEventListener("keydown", onKey, true));
        for (const type of ["CHANNEL_SELECT", "DELETE_PENDING_REPLY", "MESSAGE_CREATE"]) cleanups.push(subscribe(type, a => (type !== "MESSAGE_CREATE" || a.optimistic) && (index = -1)));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
