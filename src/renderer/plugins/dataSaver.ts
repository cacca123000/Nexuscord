/* Data saver (#58): smaller image previews, no video preloading, click-to-load GIFs. */
import { setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "dataSaver";
const cleanups: (() => void)[] = [];

export function smallerPreview(src: string, maxWidth: number): string | null {
    try {
        const u = new URL(src);
        if (u.hostname !== "media.discordapp.net") return null;
        const w = Number(u.searchParams.get("width") || 0);
        const hgt = Number(u.searchParams.get("height") || 0);
        if (w && w <= maxWidth) return null;
        if (w && hgt) {
            u.searchParams.set("height", String(Math.round((hgt * maxWidth) / w)));
            u.searchParams.set("width", String(maxWidth));
        } else u.searchParams.set("width", String(maxWidth));
        u.searchParams.set("quality", "low");
        u.searchParams.set("format", "webp");
        return u.toString();
    } catch {
        return null;
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.dataSaver.name",
    description: "plugin.dataSaver.desc",
    category: "performance",
    options: {
        maxWidth: { type: "select", label: "plugin.dataSaver.opt.maxWidth", default: 400, options: [240, 320, 400, 550].map(v => ({ label: `${v}px`, value: v })) },
        noPreload: { type: "boolean", label: "plugin.dataSaver.opt.noPreload", default: true }
    },
    start() {
        cleanups.push(
            observe(ID, 'li[id^="chat-messages-"] img[src*="media.discordapp.net"]', el => {
                const img = el as HTMLImageElement;
                if (img.dataset.ncSaver) return;
                const s = smallerPreview(img.src, Number(getOption(ID, "maxWidth")) || 400);
                if (s) ((img.dataset.ncSaver = img.src), (img.src = s));
            }),
            observe(ID, "video", el => getOption(ID, "noPreload") && ((el as HTMLVideoElement).preload = "none"))
        );
        setStyle("nc-data-saver", "");
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle("nc-data-saver", null);
        document.querySelectorAll<HTMLImageElement>("img[data-nc-saver]").forEach(i => ((i.src = i.dataset.ncSaver!), delete i.dataset.ncSaver));
    }
});
