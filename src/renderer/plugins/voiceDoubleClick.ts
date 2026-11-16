/* Double-click to join voice: a single click on a voice channel only opens its text chat. */
import { ChannelStore } from "../core/discord";
import { onDomReady } from "../core/dom";
import { definePlugin } from "../core/pluginManager";
import { findByProps } from "../core/webpack";

const ID = "voiceDoubleClick";
const VOICE = new Set([2, 13]);

function channelFrom(e: MouseEvent): any {
    const item = (e.target as HTMLElement | null)?.closest?.('[data-list-item-id^="channels___"]');
    const id = item?.getAttribute("data-list-item-id")?.slice("channels___".length);
    const ch = id && ChannelStore.getChannel?.(id);
    return ch && VOICE.has(ch.type) ? ch : null;
}

function onClick(e: MouseEvent) {
    if (e.button !== 0 || e.detail > 1) return;
    const ch = channelFrom(e);
    // Clicking a user/stream inside the channel keeps working
    if (!ch || (e.target as HTMLElement).closest('[class*="voiceUser"], [class*="list_"] [role="listitem"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
}

function onDblClick(e: MouseEvent) {
    const ch = channelFrom(e);
    if (!ch) return;
    findByProps("selectVoiceChannel", "disconnect")?.selectVoiceChannel?.(ch.id);
}

export default definePlugin({
    id: ID,
    name: "plugin.voiceDoubleClick.name",
    description: "plugin.voiceDoubleClick.desc",
    category: "media",
    start() {
        onDomReady(() => {
            document.addEventListener("click", onClick, true);
            document.addEventListener("dblclick", onDblClick, true);
        });
    },
    stop() {
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("dblclick", onDblClick, true);
    }
});
