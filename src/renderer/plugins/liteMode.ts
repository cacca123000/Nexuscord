/* Lite mode (#57): no animations, no animated avatars/emojis, no autoplaying GIFs. */
import { setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { definePlugin, getOption } from "../core/pluginManager";
import { staticVariant } from "./lowRamOptimizer";

const ID = "liteMode";
let off = () => {};

function freeze(img: HTMLImageElement) {
    if (!getOption(ID, "staticMedia") || img.dataset.ncLite) return;
    const s = staticVariant(img.src);
    if (!s) return;
    img.dataset.ncLite = img.src;
    img.src = s;
}

function apply() {
    let css = "";
    if (getOption(ID, "noAnimations")) css += `*,*::before,*::after{animation-duration:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}`;
    if (getOption(ID, "noBlur")) css += `*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}`;
    if (getOption(ID, "noShadows")) css += `*{box-shadow:none!important;text-shadow:none!important}`;
    setStyle("nc-lite", css || null);
}

export default definePlugin({
    id: ID,
    name: "plugin.liteMode.name",
    description: "plugin.liteMode.desc",
    category: "performance",
    options: {
        noAnimations: { type: "boolean", label: "plugin.liteMode.opt.noAnimations", default: true },
        staticMedia: { type: "boolean", label: "plugin.liteMode.opt.staticMedia", default: true },
        noBlur: { type: "boolean", label: "plugin.liteMode.opt.noBlur", default: true },
        noShadows: { type: "boolean", label: "plugin.liteMode.opt.noShadows", default: false }
    },
    start() {
        apply();
        off = observe(ID, "img[src]", el => freeze(el as HTMLImageElement));
    },
    stop() {
        off();
        setStyle("nc-lite", null);
        document.querySelectorAll<HTMLImageElement>("img[data-nc-lite]").forEach(i => ((i.src = i.dataset.ncLite!), delete i.dataset.ncLite));
    },
    onOptionChange: apply
});
