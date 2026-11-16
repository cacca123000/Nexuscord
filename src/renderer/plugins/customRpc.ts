/* Custom Rich Presence (#50): show any "Playing / Watching / Listening to ..." status. */
import { RestAPI } from "../core/discord";
import { dispatch } from "../core/flux";
import { definePlugin, getOption } from "../core/pluginManager";
import { onDispatcherReady } from "../core/flux";

const ID = "customRpc";
const SOCKET = "NexusCordCustomRPC";
let startedAt = Date.now();

async function assetFor(appId: string, url: string): Promise<string | undefined> {
    if (!url) return undefined;
    if (!appId || !/^https?:\/\//.test(url)) return url;
    try {
        const res = await RestAPI.post({ url: `/applications/${appId}/external-assets`, body: { urls: [url] }, oldFormErrors: true });
        const path = res.body?.[0]?.external_asset_path;
        return path ? `mp:${path}` : undefined;
    } catch {
        return undefined;
    }
}

export async function buildActivity(): Promise<any | null> {
    const name = String(getOption(ID, "name") || "").trim();
    if (!name) return null;
    const appId = String(getOption(ID, "appId") || "").trim();
    const type = Number(getOption(ID, "type")) || 0;
    const a: any = { application_id: appId || "0", name, type, flags: 1 };
    const details = String(getOption(ID, "details") || ""), state = String(getOption(ID, "state") || "");
    if (details) a.details = details;
    if (state) a.state = state;
    if (type === 1) a.url = String(getOption(ID, "streamUrl") || "https://twitch.tv/discord");
    if (getOption(ID, "elapsed")) a.timestamps = { start: startedAt };
    const large = await assetFor(appId, String(getOption(ID, "largeImage") || ""));
    if (large) a.assets = { large_image: large, large_text: String(getOption(ID, "largeText") || name) };
    const buttons = [1, 2].map(i => [String(getOption(ID, `button${i}`) || ""), String(getOption(ID, `button${i}Url`) || "")]).filter(([l, u]) => l && /^https?:\/\//.test(u));
    if (buttons.length) {
        a.buttons = buttons.map(b => b[0]);
        a.metadata = { button_urls: buttons.map(b => b[1]) };
    }
    return a;
}

async function update(clear = false) {
    const activity = clear ? null : await buildActivity();
    dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity, socketId: SOCKET });
}

export default definePlugin({
    id: ID,
    name: "plugin.customRpc.name",
    description: "plugin.customRpc.desc",
    category: "media",
    options: {
        type: { type: "select", label: "plugin.customRpc.opt.type", default: 0, options: [{ label: "plugin.customRpc.type.playing", value: 0 }, { label: "plugin.customRpc.type.streaming", value: 1 }, { label: "plugin.customRpc.type.listening", value: 2 }, { label: "plugin.customRpc.type.watching", value: 3 }, { label: "plugin.customRpc.type.competing", value: 5 }] },
        name: { type: "string", label: "plugin.customRpc.opt.name", default: "NexusCord", placeholder: "Minecraft" },
        details: { type: "string", label: "plugin.customRpc.opt.details", default: "", placeholder: "Building a castle" },
        state: { type: "string", label: "plugin.customRpc.opt.state", default: "", placeholder: "In a party" },
        elapsed: { type: "boolean", label: "plugin.customRpc.opt.elapsed", default: true },
        appId: { type: "string", label: "plugin.customRpc.opt.appId", hint: "plugin.customRpc.opt.appIdHint", default: "" },
        largeImage: { type: "string", label: "plugin.customRpc.opt.largeImage", default: "", placeholder: "https://…/image.png" },
        largeText: { type: "string", label: "plugin.customRpc.opt.largeText", default: "" },
        streamUrl: { type: "string", label: "plugin.customRpc.opt.streamUrl", default: "" },
        button1: { type: "string", label: "plugin.customRpc.opt.button1", default: "" },
        button1Url: { type: "string", label: "plugin.customRpc.opt.button1Url", default: "" },
        button2: { type: "string", label: "plugin.customRpc.opt.button2", default: "" },
        button2Url: { type: "string", label: "plugin.customRpc.opt.button2Url", default: "" }
    },
    start() {
        startedAt = Date.now();
        onDispatcherReady(() => setTimeout(() => update(), 2000));
    },
    stop() {
        update(true);
    },
    onOptionChange() {
        update();
    }
});
