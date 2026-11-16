/* Image viewer (#32): zoom (wheel), pan (drag), rotate, prev/next through the channel. */
import { h, onDomReady, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "imageViewer";

export function originalUrl(src: string): string {
    try {
        const u = new URL(src);
        if (u.hostname === "media.discordapp.net" && u.pathname.startsWith("/attachments/")) {
            u.hostname = "cdn.discordapp.com";
            for (const k of ["width", "height", "format", "quality"]) u.searchParams.delete(k);
        }
        if (/\/(avatars|emojis|icons|banners|stickers)\//.test(u.pathname)) u.searchParams.set("size", "4096");
        return u.toString();
    } catch {
        return src;
    }
}

function channelImages(): string[] {
    return [...document.querySelectorAll<HTMLImageElement>('li[id^="chat-messages-"] [class*="imageWrapper"] img, li[id^="chat-messages-"] [class*="mosaicItem"] img')]
        .map(i => i.src)
        .filter((s, i, a) => s && a.indexOf(s) === i);
}

function open(src: string) {
    const list = channelImages();
    let idx = Math.max(0, list.indexOf(src));
    let scale = 1, x = 0, y = 0, rot = 0;
    const img = h("img", { className: "nc-iv-img", draggable: "false", alt: "" }) as HTMLImageElement;
    const counter = h("span", { className: "nc-iv-count" });
    const apply = () => (img.style.transform = `translate(${x}px,${y}px) scale(${scale}) rotate(${rot}deg)`);
    const load = () => {
        scale = 1; x = y = rot = 0;
        img.src = originalUrl(list[idx] ?? src);
        counter.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : "";
        apply();
    };
    const btn = (label: string, title: string, fn: () => void) => h("button", { className: "nc-iv-btn", title, type: "button", onClick: (e: Event) => (e.stopPropagation(), fn()) }, label);
    const close = () => (layer.remove(), document.removeEventListener("keydown", onKey, true));
    const step = (d: number) => {
        if (list.length < 2) return;
        idx = (idx + d + list.length) % list.length;
        load();
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowRight") step(1);
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "r") ((rot += 90), apply());
        else return;
        e.preventDefault();
        e.stopPropagation();
    };
    const layer = h(
        "div",
        { className: "nc-iv nc-root", onClick: (e: MouseEvent) => e.target === layer && close() },
        img,
        h("div", { className: "nc-iv-bar" }, counter, btn("−", t("plugin.imageViewer.zoomOut"), () => ((scale = Math.max(0.2, scale / 1.25)), apply())), btn("+", t("plugin.imageViewer.zoomIn"), () => ((scale = Math.min(12, scale * 1.25)), apply())), btn("⟳", t("plugin.imageViewer.rotate"), () => ((rot += 90), apply())), btn("1:1", t("plugin.imageViewer.reset"), () => ((scale = 1), (x = y = 0), apply())), btn("⬇", t("plugin.mediaDownloader.download"), () => Native.files.download(img.src, decodeURIComponent(new URL(img.src).pathname.split("/").pop() || "image"), "images").then(p => toast(t("plugin.mediaDownloader.saved", { path: p }), "success"))), btn("↗", t("plugin.imageViewer.openBrowser"), () => Native.shell.openExternal(img.src)), btn("✕", t("common.close"), close)),
        list.length > 1 ? btn("‹", "", () => step(-1)) : null,
        list.length > 1 ? btn("›", "", () => step(1)) : null
    );
    const arrows = layer.querySelectorAll<HTMLElement>(":scope > .nc-iv-btn");
    arrows[0]?.classList.add("nc-iv-prev");
    arrows[1]?.classList.add("nc-iv-next");
    layer.addEventListener("wheel", e => {
        e.preventDefault();
        scale = Math.min(12, Math.max(0.2, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        apply();
    }, { passive: false });
    let drag: { sx: number; sy: number; x: number; y: number } | null = null;
    img.addEventListener("mousedown", e => ((drag = { sx: e.clientX, sy: e.clientY, x, y }), e.preventDefault()));
    layer.addEventListener("mousemove", e => drag && ((x = drag.x + e.clientX - drag.sx), (y = drag.y + e.clientY - drag.sy), apply()));
    layer.addEventListener("mouseup", () => (drag = null));
    img.addEventListener("dblclick", () => ((scale = scale === 1 ? 2.5 : 1), (x = y = 0), apply()));
    document.body.appendChild(layer);
    document.addEventListener("keydown", onKey, true);
    load();
}

function onClick(e: MouseEvent) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const img = (e.target as Element)?.closest?.('li[id^="chat-messages-"] [class*="imageWrapper"] img, li[id^="chat-messages-"] [class*="mosaicItem"] img') as HTMLImageElement | null;
    if (!img?.src || img.closest('[class*="embedVideo"], [class*="gifFavorite"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(img.src);
}

export default definePlugin({
    id: ID,
    name: "plugin.imageViewer.name",
    description: "plugin.imageViewer.desc",
    category: "chat",
    start() {
        setStyle("nc-image-viewer", `.nc-iv{position:fixed;inset:0;z-index:100004;background:rgba(5,6,10,.88);backdrop-filter:blur(6px);display:grid;place-items:center;overflow:hidden;animation:nc-fade .15s}
.nc-iv-img{max-width:92vw;max-height:86vh;transition:transform .08s;cursor:grab;user-select:none;box-shadow:0 20px 60px rgba(0,0,0,.6);border-radius:6px}
.nc-iv-bar{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:14px;background:rgba(20,22,32,.75);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1)}
.nc-iv-btn{min-width:36px;height:34px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font:600 15px var(--font-primary,sans-serif);cursor:pointer}.nc-iv-btn:hover{background:rgba(255,255,255,.18)}
.nc-iv-count{color:#cfd3dc;font-size:12px;padding:0 6px;font-variant-numeric:tabular-nums}
.nc-iv-prev,.nc-iv-next{position:fixed;top:50%;width:48px;height:64px;font-size:30px;margin-top:-32px}.nc-iv-prev{left:18px}.nc-iv-next{right:18px}`);
        onDomReady(() => window.addEventListener("click", onClick, true));
    },
    stop() {
        window.removeEventListener("click", onClick, true);
        setStyle("nc-image-viewer", null);
    }
});
