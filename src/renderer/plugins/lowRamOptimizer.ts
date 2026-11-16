/*
 * Low-RAM Optimizer & media hibernation.
 *  - Minimized / hidden (optionally: unfocused): pause videos, freeze CSS
 *    keyframe animations, swap animated Discord CDN images (GIF/APNG/animated
 *    WebP) to their static variants, then drop Blink's decoded-resource cache.
 *  - Channel switch: release decoder buffers of off-screen videos; they are
 *    restored lazily by an IntersectionObserver when scrolled back into view.
 *  - While hidden, webFrame.clearCache() runs periodically.
 */
import { onDomReady, setStyle } from "../core/dom";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { Logger } from "../core/logger";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "lowRamOptimizer";
const log = new Logger("LowRAM");
const HIBERNATE_CLASS = "nc-hibernating";

let hibernating = false;
const pausedVideos = new Set<HTMLVideoElement>();
const swappedImages = new Map<HTMLImageElement, string>();
const cleanups: (() => void)[] = [];
let cacheTimer: ReturnType<typeof setInterval> | null = null;
let firstClearTimer: ReturnType<typeof setTimeout> | null = null;
let lazyObserver: IntersectionObserver | null = null;

const CDN_RE = /^https:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\//;

/** Returns a static (non-animated) variant of a Discord CDN image URL, or null. */
export function staticVariant(src: string): string | null {
    if (!CDN_RE.test(src)) return null;
    let url: URL;
    try {
        url = new URL(src);
    } catch {
        return null;
    }
    const animated = /\.gif$/i.test(url.pathname) || url.searchParams.get("animated") === "true" || /\/a_[0-9a-f]+\.(?:webp|png)$/i.test(url.pathname);
    if (!animated) return null;
    // Only avatars, emojis, icons, banners & decorations have reliable static variants
    if (!/^\/(?:avatars|emojis|icons|banners|guilds|avatar-decoration-presets|role-icons)\//.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\.gif$/i, ".webp");
    url.searchParams.delete("animated");
    return url.toString();
}

function hibernate() {
    if (hibernating) return;
    hibernating = true;
    document.documentElement.classList.add(HIBERNATE_CLASS);

    for (const v of document.querySelectorAll("video")) {
        if (!v.paused) {
            v.pause();
            pausedVideos.add(v);
        }
    }
    for (const img of document.querySelectorAll<HTMLImageElement>("img[src]")) {
        const s = staticVariant(img.src);
        if (s) {
            swappedImages.set(img, img.src);
            img.src = s;
        }
    }
    log.info(`${t("plugin.lowRamOptimizer.hibernating")} (${pausedVideos.size} videos, ${swappedImages.size} images)`);

    firstClearTimer = setTimeout(() => Native.perf.clearWebFrameCache(), 30_000);
    const minutes = Number(getOption(ID, "cacheInterval")) || 0;
    if (minutes > 0) cacheTimer = setInterval(() => Native.perf.clearWebFrameCache(), minutes * 60_000);
}

function wake() {
    if (!hibernating) return;
    hibernating = false;
    document.documentElement.classList.remove(HIBERNATE_CLASS);
    if (firstClearTimer) clearTimeout(firstClearTimer);
    if (cacheTimer) clearInterval(cacheTimer);
    firstClearTimer = cacheTimer = null;

    for (const [img, src] of swappedImages) if (img.isConnected) img.src = src;
    swappedImages.clear();
    for (const v of pausedVideos) if (v.isConnected) v.play().catch(() => {});
    pausedVideos.clear();
}

function evaluateState() {
    const hidden = document.visibilityState === "hidden";
    const unfocused = getOption<boolean>(ID, "pauseOnBlur") && !document.hasFocus();
    if (hidden || unfocused) hibernate();
    else wake();
}

/** Releases buffers of videos that are paused and off-screen. */
function cleanupOffscreenMedia() {
    lazyObserver ??= new IntersectionObserver(entries => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            const v = e.target as HTMLVideoElement;
            const src = v.dataset.ncSrc;
            if (src) {
                v.src = src;
                delete v.dataset.ncSrc;
            }
            lazyObserver?.unobserve(v);
        }
    }, { rootMargin: "400px" });

    const vh = window.innerHeight;
    let freed = 0;
    for (const v of document.querySelectorAll<HTMLVideoElement>("video[src]")) {
        if (!v.paused || v.dataset.ncSrc) continue;
        const r = v.getBoundingClientRect();
        if (r.bottom > -vh && r.top < vh * 2) continue; // near viewport - keep
        v.dataset.ncSrc = v.getAttribute("src")!;
        v.preload = "none";
        v.removeAttribute("src");
        v.load(); // drops the decoder & media buffers
        lazyObserver.observe(v);
        freed++;
    }
    if (freed) log.info(`Freed ${freed} off-screen videos`);
}

export default definePlugin({
    id: ID,
    name: "plugin.lowRamOptimizer.name",
    description: "plugin.lowRamOptimizer.desc",
    category: "performance",
    authors: ["NexusCord"],
    options: {
        pauseOnBlur: { type: "boolean", label: "plugin.lowRamOptimizer.opt.pauseOnBlur", default: false },
        cleanupOnSwitch: { type: "boolean", label: "plugin.lowRamOptimizer.opt.cleanupOnSwitch", default: true },
        cacheInterval: { type: "number", label: "plugin.lowRamOptimizer.opt.cacheInterval", default: 10, min: 0, max: 120 }
    },

    start() {
        setStyle(
            "nc-low-ram",
            `html.${HIBERNATE_CLASS} *, html.${HIBERNATE_CLASS} *::before, html.${HIBERNATE_CLASS} *::after { animation-play-state: paused !important; transition: none !important; }`
        );
        const onVis = () => evaluateState();
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("blur", onVis);
        window.addEventListener("focus", onVis);
        cleanups.push(() => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onVis);
            window.removeEventListener("focus", onVis);
        });
        cleanups.push(subscribe("WINDOW_FOCUS", () => setTimeout(evaluateState, 0)));

        let switchTimer: ReturnType<typeof setTimeout> | null = null;
        cleanups.push(
            subscribe("CHANNEL_SELECT", () => {
                if (!getOption(ID, "cleanupOnSwitch")) return;
                if (switchTimer) clearTimeout(switchTimer);
                switchTimer = setTimeout(cleanupOffscreenMedia, 1500);
            })
        );
        onDomReady(evaluateState);
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
        wake();
        lazyObserver?.disconnect();
        lazyObserver = null;
        for (const v of document.querySelectorAll<HTMLVideoElement>("video[data-nc-src]")) {
            v.src = v.dataset.ncSrc!;
            delete v.dataset.ncSrc;
        }
        setStyle("nc-low-ram", null);
    },

    onOptionChange() {
        if (hibernating) {
            wake();
        }
        evaluateState();
    }
});
