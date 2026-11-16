/*
 * Scheduled messages (#27): type `!later 10m your message` (or 2h, 1d, or a clock time
 * like `!later 18:30 text`). Discord must be running when the time comes.
 */
import { ChannelStore, MessageActions } from "../core/discord";
import { h } from "../core/dom";
import { getLanguage, t } from "../core/i18n";
import { addPreSendHook } from "../core/outgoing";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, toast } from "../core/ui";

const ID = "scheduledMessages";
interface Scheduled {
    id: string;
    channelId: string;
    content: string;
    at: number;
}
const store = dataStore<{ items: Scheduled[] }>("scheduled", { items: [] });
let timer: ReturnType<typeof setInterval> | null = null;
let off = () => {};

/** Parses "10m", "2h", "1d", "90s", "18:30" -> absolute timestamp, or null. */
export function parseWhen(token: string, now = new Date()): number | null {
    const rel = /^(\d+(?:\.\d+)?)(s|m|h|d)$/i.exec(token);
    if (rel) return now.getTime() + Number(rel[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[rel[2].toLowerCase() as "s"]!;
    const clock = /^(\d{1,2}):(\d{2})$/.exec(token);
    if (clock) {
        const d = new Date(now);
        d.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
        if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
        return d.getTime();
    }
    return null;
}

function tick() {
    const due = store.get().items.filter(i => i.at <= Date.now());
    if (!due.length) return;
    store.update(d => void (d.items = d.items.filter(i => i.at > Date.now())));
    for (const i of due) {
        MessageActions.sendMessage(i.channelId, { content: i.content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] });
        toast(t("plugin.scheduledMessages.sent", { channel: ChannelStore.getChannel?.(i.channelId)?.name ?? "DM" }), "success");
    }
}

function Panel(): Node {
    const items = store.get().items.slice().sort((a, b) => a.at - b.at);
    if (!items.length) return h("div", { className: "nc-empty" }, t("plugin.scheduledMessages.empty"));
    return h(
        "div",
        { className: "nc-stack" },
        items.map(i =>
            h(
                "div",
                { className: "nc-row" },
                h("div", { className: "nc-row-label" }, i.content.slice(0, 120), h("small", null, `#${ChannelStore.getChannel?.(i.channelId)?.name ?? "DM"} · ${new Date(i.at).toLocaleString(getLanguage())}`)),
                Button({ variant: "danger", onClick: () => store.update(d => void (d.items = d.items.filter(x => x.id !== i.id))), children: t("common.cancel") })
            )
        )
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.scheduledMessages.name",
    description: "plugin.scheduledMessages.desc",
    category: "chat",
    settingsPanel: Panel,
    start() {
        off = addPreSendHook(ID, ({ channelId, message, edit }) => {
            if (edit) return;
            const m = /^!later\s+(\S+)\s+([\s\S]+)$/i.exec(message.content.trim());
            if (!m) return;
            const at = parseWhen(m[1]);
            if (!at) {
                toast(t("plugin.scheduledMessages.badTime"), "error");
                return "cancel";
            }
            store.update(d => d.items.push({ id: Math.random().toString(36).slice(2), channelId, content: m[2], at }));
            toast(t("plugin.scheduledMessages.scheduled", { when: new Date(at).toLocaleString(getLanguage()) }), "success");
            return "cancel";
        }, 5);
        tick();
        timer = setInterval(tick, 10_000);
    },
    stop() {
        off();
        if (timer) clearInterval(timer);
    }
});
