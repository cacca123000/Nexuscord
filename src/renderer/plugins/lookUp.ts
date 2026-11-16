/* Look up: select text, right-click -> search it on the web, Wikipedia, a dictionary or Urban Dictionary. */
import { registerMenuItem } from "../core/contextMenu";
import { getLanguage, t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "lookUp";
const cleanups: (() => void)[] = [];

const SEARCH: Record<string, (q: string) => string> = {
    google: q => `https://www.google.com/search?q=${q}`,
    duckduckgo: q => `https://duckduckgo.com/?q=${q}`,
    bing: q => `https://www.bing.com/search?q=${q}`,
    brave: q => `https://search.brave.com/search?q=${q}`
};

let last = "";
function selection(m?: { selection?: string }): string {
    const s = (m?.selection ?? window.getSelection()?.toString() ?? "").trim().slice(0, 300);
    if (m) last = s;
    return s || last;
}

export default definePlugin({
    id: ID,
    name: "plugin.lookUp.name",
    description: "plugin.lookUp.desc",
    category: "utility",
    options: {
        engine: {
            type: "select",
            label: "plugin.lookUp.opt.engine",
            default: "google",
            options: [
                { label: "Google", value: "google" },
                { label: "DuckDuckGo", value: "duckduckgo" },
                { label: "Bing", value: "bing" },
                { label: "Brave", value: "brave" }
            ]
        },
        urban: { type: "boolean", label: "plugin.lookUp.opt.urban", default: true }
    },
    start() {
        const open = (url: string) => void Native.shell.openExternal(url);
        const q = () => encodeURIComponent(last);
        const has = (m: { selection?: string }) => !!selection(m);
        cleanups.push(
            registerMenuItem(ID, { id: "nc-lookup-web", order: 70, label: () => t("plugin.lookUp.web", { q: last.length > 24 ? last.slice(0, 24) + "…" : last }), when: has, action: () => open((SEARCH[String(getOption(ID, "engine"))] ?? SEARCH.google)(q())) }),
            registerMenuItem(ID, { id: "nc-lookup-wiki", order: 71, label: () => t("plugin.lookUp.wiki"), when: has, action: () => open(`https://${getLanguage().slice(0, 2)}.wikipedia.org/w/index.php?search=${q()}`) }),
            registerMenuItem(ID, { id: "nc-lookup-dict", order: 72, label: () => t("plugin.lookUp.dictionary"), when: m => has(m) && last.split(/\s+/).length <= 3, action: () => open(`https://${getLanguage().slice(0, 2)}.wiktionary.org/w/index.php?search=${q()}`) }),
            registerMenuItem(ID, { id: "nc-lookup-urban", order: 73, label: () => t("plugin.lookUp.urban"), when: m => has(m) && !!getOption(ID, "urban") && last.split(/\s+/).length <= 4, action: () => open(`https://www.urbandictionary.com/define.php?term=${q()}`) })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
