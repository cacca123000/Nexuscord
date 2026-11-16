/* Reverse image search: right-click any image -> Google Lens, Yandex, TinEye, SauceNAO, Bing. */
import { registerMenuItem } from "../core/contextMenu";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";
import { originalUrl } from "./imageViewer";

const ID = "reverseImageSearch";
const cleanups: (() => void)[] = [];
export const ENGINES: Record<string, (u: string) => string> = {
    google: u => `https://lens.google.com/uploadbyurl?url=${u}`,
    yandex: u => `https://yandex.com/images/search?rpt=imageview&url=${u}`,
    tineye: u => `https://tineye.com/search?url=${u}`,
    saucenao: u => `https://saucenao.com/search.php?url=${u}`,
    bing: u => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${u}`
};

export default definePlugin({
    id: ID,
    name: "plugin.reverseImageSearch.name",
    description: "plugin.reverseImageSearch.desc",
    category: "utility",
    options: {
        engine: {
            type: "select",
            label: "plugin.reverseImageSearch.opt.engine",
            default: "google",
            options: [
                { label: "Google Lens", value: "google" },
                { label: "Yandex", value: "yandex" },
                { label: "TinEye", value: "tineye" },
                { label: "SauceNAO", value: "saucenao" },
                { label: "Bing", value: "bing" },
                { label: "plugin.reverseImageSearch.all", value: "all" }
            ]
        }
    },
    start() {
        cleanups.push(
            registerMenuItem(ID, {
                id: "nc-reverse-search",
                order: 60,
                label: () => t("plugin.reverseImageSearch.menu"),
                when: m => !!m.imageUrl && !m.emoji,
                action: m => {
                    const url = encodeURIComponent(originalUrl(m.imageUrl!));
                    const engine = String(getOption(ID, "engine"));
                    for (const key of engine === "all" ? Object.keys(ENGINES) : [engine]) void Native.shell.openExternal((ENGINES[key] ?? ENGINES.google)(url));
                }
            })
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
