/* Clean outgoing links (#26): tracking parameters are removed from links YOU send. */
import { t } from "../core/i18n";
import { addPreSendHook } from "../core/outgoing";
import { definePlugin, getOption } from "../core/pluginManager";
import { Settings } from "../core/settings";
import { toast } from "../core/ui";
import { stripTracking } from "../../shared/linkAnalysis";

const ID = "clearUrlsOutgoing";
let off = () => {};

/** Replaces every http(s) URL in `text` with its tracker-free version. */
export function cleanText(text: string): { text: string; removed: number } {
    let removed = 0;
    const out = text.replace(/https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g, url => {
        const r = stripTracking(url);
        removed += r.removed.length;
        return r.url;
    });
    return { text: out, removed };
}

export default definePlugin({
    id: ID,
    name: "plugin.clearUrlsOutgoing.name",
    description: "plugin.clearUrlsOutgoing.desc",
    category: "privacy",
    options: { notify: { type: "boolean", label: "plugin.clearUrlsOutgoing.opt.notify", default: false } },
    start() {
        off = addPreSendHook(ID, ({ message }) => {
            const r = cleanText(message.content);
            if (!r.removed) return;
            message.content = r.text;
            Settings.update(s => void (s.linkShieldStats.trackersStripped += r.removed));
            if (getOption(ID, "notify")) toast(t("shield.trackersRemoved", { count: r.removed }), "success", 1800);
        }, 30);
    },
    stop: () => off()
});
