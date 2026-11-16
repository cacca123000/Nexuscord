/* Hide blocked users (#40): no more "1 blocked message" bars or replies to blocked users. */
import { RelationshipStore } from "../core/discord";
import { setStyle } from "../core/dom";
import { subscribe } from "../core/flux";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "hideBlocked";
const hidden = new Map<string, string>();
const unsubs: (() => void)[] = [];

function blocked(id?: string) {
    try {
        return !!id && (RelationshipStore.isBlocked?.(id) || (getOption(ID, "ignored") && RelationshipStore.isIgnored?.(id)));
    } catch {
        return false;
    }
}

function render() {
    let css = `li[class*="messageListItem"]:has([class*="blockedSystemMessage"]),[class*="blockedSystemMessage"],[class*="groupStart"]:has(> [class*="blockedMessage"]){display:none!important}`;
    if (getOption(ID, "replies")) css += `[class*="repliedMessage"]:has([class*="blocked"]){display:none!important}`;
    for (const [id, ch] of hidden) css += `#chat-messages-${ch}-${id}{display:none!important}`;
    setStyle("nc-hide-blocked", css);
}

function scan(messages: any[]) {
    let changed = false;
    for (const m of messages ?? []) {
        if (m?.id && blocked(m.author?.id)) {
            hidden.set(m.id, m.channel_id);
            changed = true;
        }
    }
    if (changed) render();
}

export default definePlugin({
    id: ID,
    name: "plugin.hideBlocked.name",
    description: "plugin.hideBlocked.desc",
    category: "chat",
    options: {
        replies: { type: "boolean", label: "plugin.hideBlocked.opt.replies", default: true },
        ignored: { type: "boolean", label: "plugin.hideBlocked.opt.ignored", default: true }
    },
    start() {
        render();
        unsubs.push(subscribe("MESSAGE_CREATE", a => scan([a.message])), subscribe("LOAD_MESSAGES_SUCCESS", a => scan(a.messages)));
    },
    stop() {
        unsubs.splice(0).forEach(u => u());
        hidden.clear();
        setStyle("nc-hide-blocked", null);
    },
    onOptionChange: render
});
