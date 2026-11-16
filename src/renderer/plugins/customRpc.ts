/* Custom Rich Presence (#50): show any "Playing / Watching / Listening to ..." status. */
import { RestAPI } from "../core/discord";
import { dispatch } from "../core/flux";
import { definePlugin, getOption, getPlugins, isEnabled, setOption } from "../core/pluginManager";
import { onDispatcherReady } from "../core/flux";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { toast } from "../core/ui";

const ID = "customRpc";
const SOCKET = "NexusCordCustomRPC";
let startedAt = Date.now();

/** The ready-made NexusCord presence (what you get out of the box). */
export const NEXUSCORD_LOGO = "https://raw.githubusercontent.com/cacca123000/Nexuscord/refs/heads/claude/nexuscord-discord-mod-3qj93c/assets/nexuscord-logo.png";
export const PRESET: Record<string, string | number | boolean> = {
    type: 0,
    name: "NexusCord",
    details: "Discord, lighter and smarter",
    state: "{features} features on",
    elapsed: true,
    largeImage: NEXUSCORD_LOGO,
    largeText: "NexusCord {version}",
    button1: "Get NexusCord",
    button1Url: "https://github.com/cacca123000/Nexuscord",
    button2: "",
    button2Url: ""
};

/** {features} and {version} placeholders. */
function fill(text: string): string {
    return text
        .replace(/\{features\}/g, () => String(getPlugins().filter(p => !p.required && isEnabled(p.id)).length))
        .replace(/\{version\}/g, () => "v" + NEXUSCORD_VERSION);
}

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
    const details = fill(String(getOption(ID, "details") || "")), state = fill(String(getOption(ID, "state") || ""));
    if (details) a.details = details;
    if (state) a.state = state;
    if (type === 1) a.url = String(getOption(ID, "streamUrl") || "https://twitch.tv/discord");
    if (getOption(ID, "elapsed")) a.timestamps = { start: startedAt };
    const large = await assetFor(appId, String(getOption(ID, "largeImage") || ""));
    if (large) a.assets = { large_image: large, large_text: fill(String(getOption(ID, "largeText") || name)) };
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
        details: { type: "string", label: "plugin.customRpc.opt.details", default: PRESET.details as string, placeholder: "Building a castle" },
        state: { type: "string", label: "plugin.customRpc.opt.state", default: PRESET.state as string, placeholder: "In a party" },
        elapsed: { type: "boolean", label: "plugin.customRpc.opt.elapsed", default: true },
        appId: { type: "string", label: "plugin.customRpc.opt.appId", hint: "plugin.customRpc.opt.appIdHint", default: "" },
        largeImage: { type: "string", label: "plugin.customRpc.opt.largeImage", default: PRESET.largeImage as string, placeholder: "https://…/image.png" },
        largeText: { type: "string", label: "plugin.customRpc.opt.largeText", default: PRESET.largeText as string },
        streamUrl: { type: "string", label: "plugin.customRpc.opt.streamUrl", default: "" },
        button1: { type: "string", label: "plugin.customRpc.opt.button1", default: PRESET.button1 as string },
        button1Url: { type: "string", label: "plugin.customRpc.opt.button1Url", default: PRESET.button1Url as string },
        button2: { type: "string", label: "plugin.customRpc.opt.button2", default: "" },
        button2Url: { type: "string", label: "plugin.customRpc.opt.button2Url", default: "" }
    },
    settingsPanel: () =>
        h(
            "div",
            { className: "nc-stack", style: "margin-top:8px" },
            h(
                "div",
                { className: "nc-banner info" },
                h(
                    "div",
                    { style: "flex:1" },
                    h("b", null, t("plugin.customRpc.imageTitle")),
                    h("div", { className: "nc-sub", style: "margin-top:4px" }, t("plugin.customRpc.imageSteps"))
                )
            ),
            h(
                "div",
                { className: "nc-row-wrap" },
                h("button", { type: "button", className: "nc-btn", onClick: () => Native.shell.openExternal("https://discord.com/developers/applications") }, t("plugin.customRpc.openPortal")),
                h(
                    "button",
                    {
                        type: "button",
                        className: "nc-btn ghost",
                        onClick: () => {
                            for (const [k, v] of Object.entries(PRESET)) setOption(ID, k, v);
                            toast(t("plugin.customRpc.presetRestored"), "success");
                        }
                    },
                    t("plugin.customRpc.restorePreset")
                )
            )
        ),
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
