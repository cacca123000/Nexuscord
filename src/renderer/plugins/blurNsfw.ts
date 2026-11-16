/* Blur NSFW: images and videos in age-restricted channels stay blurred until you hover them. */
import { ChannelStore, SelectedChannelStore } from "../core/discord";
import { setStyle } from "../core/dom";
import { subscribe } from "../core/flux";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "blurNsfw";
const cleanups: (() => void)[] = [];

function update(channelId?: string) {
    const id = channelId ?? SelectedChannelStore.getChannelId?.();
    let nsfw = false;
    try {
        const ch = id && ChannelStore.getChannel?.(id);
        nsfw = !!(ch?.nsfw || ch?.isNSFW?.());
    } catch { /* ignore */ }
    document.body?.classList.toggle("nc-nsfw-channel", nsfw || !!getOption(ID, "everywhere"));
}

export default definePlugin({
    id: ID,
    name: "plugin.blurNsfw.name",
    description: "plugin.blurNsfw.desc",
    category: "privacy",
    options: {
        amount: { type: "slider", label: "plugin.blurNsfw.opt.amount", default: 18, min: 4, max: 40, unit: "px" },
        everywhere: { type: "boolean", label: "plugin.blurNsfw.opt.everywhere", default: false }
    },
    start() {
        const px = Number(getOption(ID, "amount")) || 18;
        setStyle(
            ID,
            `.nc-nsfw-channel li[id^="chat-messages-"] :is([class*="imageWrapper_"] img,[class*="mosaicItem_"] img,video,[class*="embedImage"] img,[class*="embedThumbnail"] img){filter:blur(${px}px);transition:filter .2s}
.nc-nsfw-channel li[id^="chat-messages-"] :is([class*="imageWrapper_"],[class*="mosaicItem_"],[class*="embedImage"],[class*="embedThumbnail"],[class*="wrapperPlaying"]):hover :is(img,video){filter:none}`
        );
        cleanups.push(subscribe("CHANNEL_SELECT", a => update(a.channelId)));
        update();
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        document.body?.classList.remove("nc-nsfw-channel");
        setStyle(ID, null);
    },
    onOptionChange() {
        this.stop();
        this.start();
    }
});
