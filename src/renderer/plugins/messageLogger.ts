/*
 * MessageLogger - deleted messages stay visible with a localized [Deleted] badge,
 * edits keep their full history inline ([Edited]); everything is also saved to a
 * persistent, searchable log (survives restarts and channel reloads).
 *
 * MESSAGE_DELETE is swallowed by a Flux interceptor so the message stays in
 * MessageStore; badges/history are a generated stylesheet keyed by message id, which
 * survives React re-renders and list virtualization.
 */
import { ChannelStore, currentUser, GuildStore, jumpToMessage, MessageStore } from "../core/discord";
import { escapeCssString, h, setStyle } from "../core/dom";
import { intercept } from "../core/flux";
import { getLanguage, onLanguageChange, t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, Icons, SearchBox } from "../core/ui";

const ID = "messageLogger";
const STYLE_ID = "nc-message-logger";
const MAX_TRACKED = 1000;
const MAX_HISTORY = 10;

export interface LogEntry {
    kind: "deleted" | "edited";
    id: string;
    channelId: string;
    guildId: string | null;
    author: string;
    authorId: string;
    content: string;
    newContent?: string;
    attachments: string[];
    at: number;
}
const log = dataStore<{ entries: LogEntry[] }>("messageLog", { entries: [] });

const deleted = new Map<string, string>(); // messageId -> channelId
const edits = new Map<string, { channelId: string; history: string[] }>();
const unsubs: (() => void)[] = [];
let renderQueued = false;

const cssId = (s: string) => String(s).replace(/[^\w-]/g, "");

function trim<K, V>(map: Map<K, V>) {
    while (map.size > MAX_TRACKED) map.delete(map.keys().next().value as K);
}

function persist(kind: LogEntry["kind"], msg: any, channelId: string, newContent?: string) {
    if (!getOption(ID, "persist")) return;
    const max = Number(getOption(ID, "maxEntries")) || 2000;
    log.update(d => {
        d.entries.push({
            kind,
            id: msg.id,
            channelId,
            guildId: ChannelStore.getChannel?.(channelId)?.guild_id ?? null,
            author: msg.author?.globalName ?? msg.author?.username ?? "?",
            authorId: msg.author?.id ?? "",
            content: String(msg.content ?? "").slice(0, 4000),
            newContent: newContent?.slice(0, 4000),
            attachments: (msg.attachments ?? []).map((a: any) => a.url ?? a.proxy_url).filter(Boolean).slice(0, 10),
            at: Date.now()
        });
        if (d.entries.length > max) d.entries.splice(0, d.entries.length - max);
    });
}

function render() {
    renderQueued = false;
    const deletedLabel = escapeCssString(t("plugin.messageLogger.deleted"));
    const editedLabel = escapeCssString(t("plugin.messageLogger.edited"));
    let css = "";
    for (const [msgId, channelId] of deleted) {
        const li = `#chat-messages-${cssId(channelId)}-${cssId(msgId)}`;
        css += `${li}{background:color-mix(in srgb,var(--status-danger,#f23f43) 8%,transparent)!important;box-shadow:inset 3px 0 0 var(--status-danger,#f23f43)}`;
        css += `${li} #message-content-${cssId(msgId)}{opacity:.8}`;
        css += `${li} #message-content-${cssId(msgId)}::after{content:"${deletedLabel}";display:inline-block;margin-left:6px;padding:0 6px;border-radius:4px;font-size:11px;font-weight:700;line-height:16px;vertical-align:middle;color:#fff;background:var(--status-danger,#d83c3e);text-transform:uppercase}`;
    }
    for (const [msgId, { channelId, history }] of edits) {
        if (!history.length) continue;
        const text = history.map(hh => `[${editedLabel}] ${hh}`).join("\n");
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
    if (getOption<boolean>(ID, "ignoreSelf") && message.author?.id && message.author.id === currentUser()?.id) return true;
    return false;
}

/** Searchable viewer of the persistent log (shown in the plugin's settings). */
function LogViewer(): Node {
    let q = "";
    const list = h("div", { className: "nc-stack" });
    const draw = () => {
        const needle = q.trim().toLowerCase();
        const items = log
            .get()
            .entries.slice()
            .reverse()
            .filter(e => !needle || `${e.author} ${e.content} ${e.newContent ?? ""}`.toLowerCase().includes(needle))
            .slice(0, 100);
        list.replaceChildren(
            ...(items.length
                ? items.map(e =>
                      h(
                          "div",
                          { className: "nc-row", style: "align-items:flex-start" },
                          h("span", { className: `nc-tag ${e.kind === "deleted" ? "danger" : "warn"}` }, t(e.kind === "deleted" ? "plugin.messageLogger.deleted" : "plugin.messageLogger.edited")),
                          h(
                              "div",
                              { className: "nc-row-label", style: "font-weight:400" },
                              h("b", null, e.author),
                              " · ",
                              h("span", { className: "nc-sub" }, `${GuildStore.getGuild?.(e.guildId ?? "")?.name ?? "DM"} · ${new Date(e.at).toLocaleString(getLanguage())}`),
                              h("div", { style: "white-space:pre-wrap;margin-top:4px" }, e.content || "—"),
                              e.newContent != null ? h("div", { className: "nc-sub", style: "white-space:pre-wrap" }, "→ " + e.newContent) : null,
                              e.attachments.length ? h("div", { className: "nc-sub" }, `${t("plugin.messageLogger.attachments")}: ${e.attachments.length}`) : null
                          ),
                          h(Button as any, { variant: "icon", title: t("plugin.messageLogger.jump"), icon: Icons.external, onClick: () => jumpToMessage(e.guildId, e.channelId, e.id) })
                      )
                  )
                : [h("div", { className: "nc-empty" }, t("plugin.messageLogger.empty"))])
        );
    };
    draw();
    return h(
        "div",
        { className: "nc-stack" },
        h(
            "div",
            { className: "nc-toolbar" },
            SearchBox({ value: "", placeholder: t("common.search"), focusKey: "ml-search", onInput: v => ((q = v), draw()) }),
            h(Button as any, { variant: "danger", onClick: () => (log.set({ entries: [] }), draw()) }, t("plugin.messageLogger.clear"))
        ),
        list
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.messageLogger.name",
    description: "plugin.messageLogger.desc",
    category: "chat",
    authors: ["NexusCord"],
    options: {
        logDeletes: { type: "boolean", label: "plugin.messageLogger.opt.logDeletes", default: true },
        logEdits: { type: "boolean", label: "plugin.messageLogger.opt.logEdits", default: true },
        ignoreBots: { type: "boolean", label: "plugin.messageLogger.opt.ignoreBots", default: false },
        ignoreSelf: { type: "boolean", label: "plugin.messageLogger.opt.ignoreSelf", hint: "plugin.messageLogger.opt.ignoreSelfHint", default: true },
        persist: { type: "boolean", label: "plugin.messageLogger.opt.persist", default: true },
        maxEntries: { type: "number", label: "plugin.messageLogger.opt.maxEntries", default: 2000, min: 100, max: 20000, step: 100 }
    },
    settingsPanel: LogViewer,

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
                        persist("deleted", msg, action.channelId);
                        queueRender();
                        return true; // swallow: the message stays in the store
                    }
                    case "MESSAGE_DELETE_BULK": {
                        if (!getOption(ID, "logDeletes") || !Array.isArray(action.ids)) return;
                        const passthrough: string[] = [];
                        for (const id of action.ids) {
                            const msg = MessageStore.getMessage?.(action.channelId, id);
                            if (shouldIgnore(msg)) passthrough.push(id);
                            else {
                                deleted.set(id, action.channelId);
                                persist("deleted", msg, action.channelId);
                            }
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
                        persist("edited", prev, channelId, next.content);
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

export const MessageLoggerState = { deleted, edits, log };
