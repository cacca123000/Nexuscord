/* Picture-in-picture (#49): pop any video out into a floating always-on-top window. */
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";

const ID = "pictureInPicture";
let off = () => {};

function decorate(video: HTMLVideoElement) {
    const box = video.parentElement;
    if (!box || box.querySelector(":scope > .nc-pip") || video.closest(".nc-root")) return;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.appendChild(
        h("button", {
            type: "button",
            className: "nc-pip",
            title: t("plugin.pictureInPicture.action"),
            onClick: async (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                try {
                    if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
                    else {
                        if (video.paused) await video.play().catch(() => {});
                        await video.requestPictureInPicture();
                    }
                } catch { /* not allowed for this video */ }
            }
        }, "⧉")
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.pictureInPicture.name",
    description: "plugin.pictureInPicture.desc",
    category: "media",
    start() {
        setStyle("nc-pip", `.nc-pip{position:absolute;top:8px;right:8px;z-index:5;width:30px;height:26px;border:0;border-radius:7px;background:rgba(0,0,0,.6);color:#fff;font-size:15px;cursor:pointer;opacity:0;transition:opacity .15s}*:hover>.nc-pip{opacity:1}.nc-pip:hover{background:var(--brand-500,#5865f2)}`);
        off = observe(ID, "video", el => decorate(el as HTMLVideoElement));
    },
    stop() {
        off();
        setStyle("nc-pip", null);
        document.querySelectorAll(".nc-pip").forEach(e => e.remove());
    }
});
