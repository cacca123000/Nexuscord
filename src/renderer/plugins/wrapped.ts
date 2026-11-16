/* Discord Wrapped (#72): your personal, local-only stats (messages, top places, hours). */
import { addCommands } from "./commandPalette";
import { ChannelStore, currentUser, GuildStore } from "../core/discord";
import { h } from "../core/dom";
import { subscribe } from "../core/flux";
import { getLanguage, t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { openModal } from "../core/ui";

const ID = "wrapped";
interface Stats {
    since: number;
    messages: number;
    chars: number;
    attachments: number;
    byGuild: Record<string, number>;
    byChannel: Record<string, number>;
    byHour: number[];
    byDay: Record<string, number>;
    words: Record<string, number>;
}
const store = dataStore<Stats>("wrapped", { since: Date.now(), messages: 0, chars: 0, attachments: 0, byGuild: {}, byChannel: {}, byHour: Array(24).fill(0), byDay: {}, words: {} });
let off = () => {};
const STOP = new Set("the a an and or to of in is it i you he she we they this that for on with at be are was im i'm my me di e il la che un una per non mi ti si lo le gli da in con su".split(" "));

function track(m: any) {
    if (!m || m.author?.id !== currentUser()?.id) return;
    const ch = ChannelStore.getChannel?.(m.channel_id);
    const d = new Date();
    store.update(s => {
        s.messages++;
        s.chars += (m.content ?? "").length;
        s.attachments += m.attachments?.length ?? 0;
        const g = ch?.guild_id ?? "dm";
        s.byGuild[g] = (s.byGuild[g] ?? 0) + 1;
        s.byChannel[m.channel_id] = (s.byChannel[m.channel_id] ?? 0) + 1;
        s.byHour[d.getHours()]++;
        const day = d.toISOString().slice(0, 10);
        s.byDay[day] = (s.byDay[day] ?? 0) + 1;
        for (const w of String(m.content ?? "").toLowerCase().match(/[\p{L}']{3,24}/gu) ?? []) if (!STOP.has(w)) s.words[w] = (s.words[w] ?? 0) + 1;
        const keys = Object.keys(s.words);
        if (keys.length > 3000) for (const k of keys.sort((a, b) => s.words[a] - s.words[b]).slice(0, 1000)) delete s.words[k];
    });
}

const top = (o: Record<string, number>, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

export function openWrapped() {
    const s = store.get();
    const lang = getLanguage();
    const busiest = s.byHour.indexOf(Math.max(...s.byHour));
    const days = Math.max(1, Math.round((Date.now() - s.since) / 86400000));
    const stat = (v: string | number, l: string) => h("div", { className: "nc-stat" }, h("b", null, typeof v === "number" ? v.toLocaleString(lang) : v), h("span", null, l));
    const list = (title: string, items: [string, number][], name: (k: string) => string) =>
        h("div", { className: "nc-card" }, h("div", { className: "nc-card-title" }, title), ...items.map(([k, v], i) => h("div", { className: "nc-row-wrap", style: "justify-content:space-between" }, h("span", null, `${i + 1}. ${name(k)}`), h("b", null, v.toLocaleString(lang)))));
    const maxH = Math.max(1, ...s.byHour);
    openModal({
        title: t("plugin.wrapped.title"),
        medium: true,
        body: h(
            "div",
            { className: "nc-stack", style: "gap:14px" },
            h("p", { className: "nc-sub", style: "margin:0" }, t("plugin.wrapped.since", { date: new Date(s.since).toLocaleDateString(lang), days })),
            h("div", { className: "nc-stats" }, stat(s.messages, t("plugin.wrapped.messages")), stat(Math.round(s.messages / days), t("plugin.wrapped.perDay")), stat(s.chars, t("plugin.wrapped.chars")), stat(s.attachments, t("plugin.wrapped.files")), stat(`${busiest}:00`, t("plugin.wrapped.busiestHour"))),
            h("div", { className: "nc-card" }, h("div", { className: "nc-card-title" }, t("plugin.wrapped.hours")), h("div", { style: "display:flex;align-items:flex-end;gap:3px;height:90px" }, s.byHour.map((v, i) => h("div", { title: `${i}:00 — ${v}`, style: `flex:1;height:${Math.max(3, (v / maxH) * 100)}%;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#7c5cff,#3ec6ff)` })))),
            h("div", { className: "nc-grid" }, list(t("plugin.wrapped.topServers"), top(s.byGuild), k => (k === "dm" ? t("plugin.wrapped.dms") : GuildStore.getGuild?.(k)?.name ?? k)), list(t("plugin.wrapped.topChannels"), top(s.byChannel), k => `#${ChannelStore.getChannel?.(k)?.name ?? k}`), list(t("plugin.wrapped.topWords"), top(s.words, 8), k => k))
        )
    });
}

addCommands(() => [{ icon: "🎁", label: t("plugin.wrapped.open"), kind: t("palette.kind.action"), run: openWrapped }]);

export default definePlugin({
    id: ID,
    name: "plugin.wrapped.name",
    description: "plugin.wrapped.desc",
    category: "fun",
    settingsPanel: () => h("button", { className: "nc-btn primary", type: "button", onClick: openWrapped }, t("plugin.wrapped.open")),
    start() {
        off = subscribe("MESSAGE_CREATE", a => track(a.message));
    },
    stop: () => off()
});
