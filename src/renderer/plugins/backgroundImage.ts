/* Background (#6): image or video wallpaper behind Discord, with blur and dim. */
import { h, onDomReady, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption, setOption } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, toast } from "../core/ui";

const ID = "backgroundImage";
const media = dataStore<{ dataUrl: string; mime: string; name: string }>("background", { dataUrl: "", mime: "", name: "" });
let videoEl: HTMLVideoElement | null = null;

function source(): { url: string; video: boolean } | null {
    const url = String(getOption(ID, "url") || "").trim();
    if (url) return { url, video: /\.(mp4|webm)(\?|$)/i.test(url) };
    const m = media.get();
    return m.dataUrl ? { url: m.dataUrl, video: m.mime.startsWith("video/") } : null;
}

function apply() {
    videoEl?.remove();
    videoEl = null;
    const src = source();
    if (!src) return setStyle("nc-background", null);
    const blur = Number(getOption(ID, "blur")) || 0;
    const dim = (Number(getOption(ID, "dim")) || 0) / 100;
    const alpha = 1 - (Number(getOption(ID, "transparency")) || 0) / 100;
    let css = `html,body,#app-mount{background:transparent!important}
#app-mount::after{content:"";position:fixed;inset:0;background:rgba(0,0,0,${dim});z-index:-1;pointer-events:none}
.nc-bg-layer{position:fixed;inset:-${blur * 2}px;z-index:-2;pointer-events:none;object-fit:cover;width:calc(100% + ${blur * 4}px);height:calc(100% + ${blur * 4}px);filter:blur(${blur}px)}
:root,.theme-dark,.theme-darker,.theme-midnight,.theme-light{--background-base-lowest:rgb(18 19 22/${alpha});--background-base-lower:rgb(27 28 32/${alpha});--background-base-low:rgb(33 34 39/${alpha});--background-primary:rgb(49 51 56/${alpha});--background-secondary:rgb(43 45 49/${alpha});--background-secondary-alt:rgb(35 36 40/${alpha});--background-tertiary:rgb(30 31 34/${alpha});--bg-base-primary:rgb(49 51 56/${alpha});--bg-base-secondary:rgb(43 45 49/${alpha});--bg-base-tertiary:rgb(30 31 34/${alpha});--chat-background:rgb(49 51 56/${alpha})}`;
    if (!src.video) css += `body::before{content:"";position:fixed;inset:-${blur * 2}px;z-index:-2;background:url("${src.url.replace(/"/g, "%22")}") center/cover no-repeat;filter:blur(${blur}px);pointer-events:none}`;
    setStyle("nc-background", css);
    if (src.video)
        onDomReady(() => {
            videoEl = Object.assign(document.createElement("video"), { src: src.url, autoplay: true, loop: true, muted: true, className: "nc-bg-layer" });
            videoEl.setAttribute("playsinline", "");
            document.body.prepend(videoEl);
        });
}

function Panel(): Node {
    const m = media.get();
    return h(
        "div",
        { className: "nc-row-wrap" },
        h(Button as any, {
            onClick: async () => {
                const f = await Native.files.pick({ kind: "any", copyAs: "background" });
                if (!f) return;
                if (!f.dataUrl || !/^(image|video)\//.test(f.mime)) return toast(t("plugin.backgroundImage.unsupported"), "error");
                media.set({ dataUrl: f.dataUrl, mime: f.mime, name: f.name });
                setOption(ID, "url", "");
                apply();
            }
        }, t("plugin.backgroundImage.pick")),
        m.name ? h("span", { className: "nc-sub" }, m.name) : null,
        m.dataUrl ? h(Button as any, { variant: "ghost", onClick: () => (media.set({ dataUrl: "", mime: "", name: "" }), apply()) }, t("appearance.reset")) : null
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.backgroundImage.name",
    description: "plugin.backgroundImage.desc",
    category: "appearance",
    options: {
        url: { type: "string", label: "plugin.backgroundImage.opt.url", default: "", placeholder: "https://…/wallpaper.jpg" },
        blur: { type: "slider", label: "plugin.backgroundImage.opt.blur", default: 6, min: 0, max: 40, unit: "px" },
        dim: { type: "slider", label: "plugin.backgroundImage.opt.dim", default: 35, min: 0, max: 90, unit: "%" },
        transparency: { type: "slider", label: "plugin.backgroundImage.opt.transparency", default: 30, min: 0, max: 85, unit: "%" }
    },
    settingsPanel: Panel,
    start: apply,
    stop() {
        videoEl?.remove();
        videoEl = null;
        setStyle("nc-background", null);
    },
    onOptionChange: apply
});
