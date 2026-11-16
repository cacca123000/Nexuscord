/* Private stream previews: your screen-share thumbnail is never uploaded to Discord. */
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";
import { fakeXhrSuccess } from "./noTrack";

const ID = "streamPreviewPrivacy";
const isPreview = (url: unknown) => /\/streams\/[^/]+\/preview\b/.test(String((url as any)?.url ?? url ?? ""));

export default definePlugin({
    id: ID,
    name: "plugin.streamPreviewPrivacy.name",
    description: "plugin.streamPreviewPrivacy.desc",
    category: "privacy",
    start() {
        const urls = new WeakMap<XMLHttpRequest, { url: string; method: string }>();
        Patcher.before(ID, XMLHttpRequest.prototype, "open", (xhr, args) => void urls.set(xhr, { method: String(args[0]).toUpperCase(), url: String(args[1]) }));
        Patcher.instead(ID, XMLHttpRequest.prototype, "send", (xhr, args, original) => {
            const r = urls.get(xhr);
            if (r && r.method === "POST" && isPreview(r.url)) return fakeXhrSuccess(xhr);
            return original(...args);
        });
        Patcher.instead(ID, window, "fetch", (_s, args, original) => {
            const method = String((args[1] as RequestInit | undefined)?.method ?? (args[0] as Request)?.method ?? "GET").toUpperCase();
            if (method === "POST" && isPreview(args[0])) return Promise.resolve(new Response(null, { status: 204 }));
            return original(...args);
        });
    },
    stop() {
        Patcher.unpatchAll(ID);
    }
});
