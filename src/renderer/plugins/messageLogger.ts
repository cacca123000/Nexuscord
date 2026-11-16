/*
 * MessageLogger - deleted messages stay visible with a localized [Deleted]
 * badge, edits keep their full history inline ([Edited]).
 *
 * MESSAGE_DELETE actions are swallowed by a Flux interceptor so the message
 * never leaves MessageStore; the badges/history are rendered with a generated
 * stylesheet keyed by message id, which survives React re-renders and list
 * virtualization without touching Discord's DOM.
 */
import { escapeCssString, setStyle } from "../core/dom";
import { intercept } from "../core/flux";
import { onLanguageChange, t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { findStoreLazy } from "../core/webpack";

const ID = "messageLogger";
const STYLE_ID = "nc-message-logger";
const MAX_TRACKED = 1000;
const MAX_HISTORY = 10;

const MessageStore = findStoreLazy("MessageStore");
const UserStore = findStoreLazy("UserStore");

const deleted = new Map<string, string>(); // messageId -> channelId
const edits = new Map<string, { channelId: string; history: string[] }>();
const unsubs: (() => void)[] = [];
let renderQueued = false;

const cssId = (s: string) => String(s).replace(/[^\w-]/g, "");

function trim<K, V>(map: Map<K, V>) {
    while (map.size > MAX_TRACKED) map.delete(map.keys().next().value as K);
}

function render() {
    renderQueued = false;
    const deletedLabel = escapeCssString(t("plugin.messageLogger.deleted"));
    const editedLabel = escapeCssString(t("plugin.messageLogger.edited"));
    let css = "";
    for (const [msgId, channelId] of deleted) {
        const li = `#chat-messages-${cssId(channelId)}-${cssId(msgId)}`;
        css += `${li}{background:rgba(240,71,71,.08)!important;box-shadow:inset 3px 0 0 #f04747}`;
        css += `${li} #message-content-${cssId(msgId)}{opacity:.8}`;
        css += `${li} #message-content-${cssId(msgId)}::after{content:"${deletedLabel}";display:inline-block;margin-left:6px;padding:0 6px;border-radius:4px;font-size:11px;font-weight:700;line-height:16px;vertical-align:middle;color:#fff;background:#d83c3e;text-transform:uppercase}`;
    }
    for (const [msgId, { channelId, history }] of edits) {
        if (!history.length) continue;
        const text = history.map(h => `[${editedLabel}] ${h}`).join("\n");
        css += `#chat-messages-${cssId(channelId)}-${cssId(msgId)} #message-content-${cssId(msgId)}::before{content:"${escapeCssString(text)}";display:block;white-space:pre-wrap;opacity:.55;font-size:.92em;border-left:2px solid var(--text-muted,#80848e);padding-left:8px;margin-bottom:4px}`;
    }
    setStyle(STYLE_ID, css || null);
}

function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
}

function shouldIgnore(message: any): boolean {
    if (!message) return true;
    if (getOption<boolean>(ID, "ignoreBots") && message.author?.bot) return true;
    if (getOption<boolean>(ID, "ignoreSelf") && message.author?.id && message.author.id === UserStore.getCurrentUser?.()?.id) return true;
    return false;
}

export default definePlugin({
    id: ID,
    name: "plugin.messageLogger.name",
    description: "plugin.messageLogger.desc",
    authors: ["NexusCord"],
    options: {
        logDeletes: { type: "boolean", label: "plugin.messageLogger.opt.logDeletes", default: true },
        logEdits: { type: "boolean", label: "plugin.messageLogger.opt.logEdits", default: true },
        ignoreBots: { type: "boolean", label: "plugin.messageLogger.opt.ignoreBots", default: false },
        ignoreSelf: { type: "boolean", label: "plugin.messageLogger.opt.ignoreSelf", default: false }
    },

    start() {
        unsubs.push(
            intercept(ID, action => {
                switch (action.type) {
                    case "MESSAGE_DELETE": {
                        if (!getOption(ID, "logDeletes") || action.mlDeleted) return;
                        const msg = MessageStore.getMessage?.(action.channelId, action.id);
                        if (shouldIgnore(msg)) return;
                        deleted.set(action.id, action.channelId);
                        trim(deleted);
                        queueRender();
                        return true; // swallow: the message stays in the store
                    }
                    case "MESSAGE_DELETE_BULK": {
                        if (!getOption(ID, "logDeletes") || !Array.isArray(action.ids)) return;
                        const passthrough: string[] = [];
                        for (const id of action.ids) {
                            const msg = MessageStore.getMessage?.(action.channelId, id);
                            if (shouldIgnore(msg)) passthrough.push(id);
                            else deleted.set(id, action.channelId);
                        }
                        trim(deleted);
                        queueRender();
                        if (!passthrough.length) return true;
                        action.ids = passthrough;
                        return;
                    }
                    case "MESSAGE_UPDATE": {
                        if (!getOption(ID, "logEdits")) return;
                        const next = action.message;
                        if (!next?.id || typeof next.content !== "string") return;
                        const channelId = next.channel_id ?? next.channelId;
                        const prev = MessageStore.getMessage?.(channelId, next.id);
                        if (!prev || shouldIgnore(prev) || typeof prev.content !== "string" || prev.content === next.content) return;
                        const entry = edits.get(next.id) ?? { channelId, history: [] as string[] };
                        entry.history.push(prev.content);
                        if (entry.history.length > MAX_HISTORY) entry.history.shift();
                        edits.set(next.id, entry);
                        trim(edits);
                        queueRender();
                        return;
                    }
                }
            }),
            onLanguageChange(queueRender)
        );
        queueRender();
    },

    stop() {
        unsubs.splice(0).forEach(u => u());
        setStyle(STYLE_ID, null);
    },

    onOptionChange() {
        queueRender();
    }
});

/** Exposed for tests / other plugins. */
export const MessageLoggerState = { deleted, edits };
