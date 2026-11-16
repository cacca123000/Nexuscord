/* Text snippets (#46): type `;name` and it expands to your saved text when sent. */
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { addPreSendHook } from "../core/outgoing";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, TextInput } from "../core/ui";

const ID = "textSnippets";
const store = dataStore<Record<string, string>>("snippets", { shrug: "¯\\_(ツ)_/¯", tableflip: "(╯°□°)╯︵ ┻━┻", lenny: "( ͡° ͜ʖ ͡°)" });
let off = () => {};

export function expand(text: string, snippets: Record<string, string>): string {
    return text.replace(/(^|\s);([\w-]{1,32})\b/g, (m, pre, key) => (snippets[key] !== undefined ? pre + snippets[key] : m));
}

function Panel(): Node {
    const list = h("div", { className: "nc-stack" });
    let k = "", v = "";
    const draw = () =>
        list.replaceChildren(
            ...Object.entries(store.get()).map(([key, val]) =>
                h("div", { className: "nc-row" }, h("code", { className: "nc-kbd" }, `;${key}`), h("div", { className: "nc-row-label", style: "font-weight:400;white-space:pre-wrap" }, val), Button({ variant: "icon", title: t("store.remove"), children: "✕", onClick: () => (store.update(d => void delete d[key]), draw()) }))
            )
        );
    draw();
    return h(
        "div",
        { className: "nc-stack" },
        h("div", { className: "nc-toolbar" }, TextInput({ value: "", placeholder: t("plugin.textSnippets.key"), live: true, onChange: x => (k = x) }), TextInput({ value: "", placeholder: t("plugin.textSnippets.value"), grow: true, live: true, onChange: x => (v = x) }), Button({ variant: "primary", children: t("common.save"), onClick: () => { const key = k.trim().replace(/^;/, ""); if (/^[\w-]{1,32}$/.test(key) && v) { store.update(d => void (d[key] = v)); draw(); } } })),
        list
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.textSnippets.name",
    description: "plugin.textSnippets.desc",
    category: "chat",
    settingsPanel: Panel,
    start() {
        off = addPreSendHook(ID, ({ message }) => void (message.content = expand(message.content, store.get())), 10);
    },
    stop: () => off()
});
