/*
 * LinkShield - anti-phishing & link protection.
 * Every click on an <a> (and every window.open) is analysed synchronously:
 *   phishing blacklist (FishFish + CERT.PL, cached in the main process)
 *   -> spoofed link text -> lookalike domain -> dangerous executable
 *   -> URL shortener (resolved via HEAD redirects) -> tracking parameters.
 * Clean links pass through untouched; Discord's own links are never touched.
 */
import { h, onDomReady, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Logger } from "../core/logger";
import { Native } from "../core/native";
import { Patcher } from "../core/patcher";
import { definePlugin, getOption } from "../core/pluginManager";
import { Settings } from "../core/settings";
import { Icons, openModal, toast } from "../core/ui";
import type { LinkShieldStats } from "../../shared/settings";
import { detectExecutable, detectSpoof, detectTyposquat, isDiscordInternal, isShortener, registrableDomain, stripTracking } from "../../shared/linkAnalysis";
import { dataStore } from "../core/storage";

/** Personal trusted / blocked domains (Privacy page). */
export const linkLists = dataStore<{ allow: string[]; block: string[] }>("linkLists", { allow: [], block: [] });
const inList = (list: string[], host: string) => {
    const h = host.toLowerCase();
    return list.some(d => d && (h === d || h.endsWith("." + d)));
};

const ID = "linkShield";
const log = new Logger("LinkShield");
const cleanups: (() => void)[] = [];

export type Verdict =
    | { kind: "phishing"; url: string; personal?: boolean }
    | { kind: "qrlogin"; url: string }
    | { kind: "spoof"; url: string; shown: string }
    | { kind: "typosquat"; url: string; domain: string; target: string }
    | { kind: "executable"; url: string; file: string }
    | { kind: "shortener"; url: string }
    | { kind: "tracking"; url: string; cleaned: string; removed: string[] }
    | { kind: "clean"; url: string };

function bump(key: keyof LinkShieldStats, by = 1) {
    Settings.update(s => void (s.linkShieldStats[key] += by));
}

/** Synchronous verdict for a URL (+ optional visible link text). */
export function analyze(href: string, text?: string): Verdict {
    let u: URL;
    try {
        u = new URL(href);
    } catch {
        return { kind: "clean", url: href };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { kind: "clean", url: href };
    const host = u.hostname;
    const lists = linkLists.get();
    if (inList(lists.block, host)) return { kind: "phishing", url: href, personal: true };
    // Remote-auth (QR login) links: scanning/opening one hands your session to someone else
    if (/(?:^|\.)discord(?:app)?\.com$/.test(host) && /^\/ra\//.test(u.pathname)) return { kind: "qrlogin", url: href };
    if (inList(lists.allow, host)) return { kind: "clean", url: href };

    if (getOption(ID, "blockPhishing") && Native.linkShield.isPhishing(host)) return { kind: "phishing", url: href };
    if (isDiscordInternal(href)) return { kind: "clean", url: href };
    if (text && getOption(ID, "detectSpoofing")) {
        const shown = detectSpoof(href, text);
        if (shown) return { kind: "spoof", url: href, shown };
    }
    if (getOption(ID, "detectTyposquat")) {
        const hit = detectTyposquat(host);
        if (hit) return { kind: "typosquat", url: href, ...hit };
    }
    if (getOption(ID, "executableGuard")) {
        const file = detectExecutable(href);
        if (file) return { kind: "executable", url: href, file };
    }
    if (getOption(ID, "unshorten") && isShortener(host)) return { kind: "shortener", url: href };
    if (getOption(ID, "stripTracking")) {
        const { url, removed } = stripTracking(href);
        if (removed.length) return { kind: "tracking", url: href, cleaned: url, removed };
    }
    return { kind: "clean", url: href };
}

/** Highlights the registrable part of the host so users see where they really go. */
function UrlBox(url: string) {
    let host = "";
    try {
        host = new URL(url).hostname;
    } catch { /* ignore */ }
    const i = host ? url.indexOf(host) : -1;
    return i === -1
        ? h("div", { className: "nc-url" }, url)
        : h("div", { className: "nc-url" }, url.slice(0, i), h("mark", null, host), url.slice(i + host.length));
}

function open(url: string, bypass = false) {
    Native.shell.openExternal(url, { bypassShield: bypass }).catch(e => log.error("openExternal failed", e));
}

function warn(v: Exclude<Verdict, { kind: "clean" | "tracking" | "shortener" }>) {
    const titles = {
        qrlogin: t("shield.title.qrlogin"),
        phishing: t("shield.title.phishing"),
        spoof: t("shield.title.spoof"),
        typosquat: t("shield.title.typosquat"),
        executable: t("shield.title.executable")
    } as const;
    const text =
        v.kind === "qrlogin"
            ? t("shield.body.qrlogin")
            : v.kind === "phishing"
            ? t(v.personal ? "shield.body.personal" : "shield.body.phishing")
            : v.kind === "spoof"
              ? t("shield.body.spoof", { shown: v.shown })
              : v.kind === "typosquat"
                ? t("shield.body.typosquat", { domain: v.domain, target: v.target })
                : t("shield.body.executable", { file: v.file });

    const buttons = [
        { label: t("shield.openAnyway"), variant: "danger" as const, onClick: () => open(v.url, true) },
        ...(v.kind === "executable"
            ? [{ label: t("shield.virusTotal"), onClick: () => (open(`https://www.virustotal.com/gui/search/${encodeURIComponent(encodeURIComponent(v.url))}`), false) }]
            : []),
        { label: t("shield.goBack"), variant: "primary" as const }
    ];

    openModal({
        title: titles[v.kind],
        tone: v.kind === "executable" ? "warn" : "danger",
        icon: v.kind === "executable" ? Icons.alert : Icons.shield,
        body: h("div", null, h("p", { style: "margin:0" }, text), h("h3", { className: "nc-section-title", style: "margin-top:14px" }, t("shield.realDestination")), UrlBox(v.url)),
        buttons
    });
}

/** Handles a verdict. Returns true if the navigation was taken over (caller must cancel it). */
async function handle(v: Verdict, fromShortener = false): Promise<void> {
    switch (v.kind) {
        case "phishing":
        case "qrlogin":
            bump("phishingBlocked");
            return warn(v);
        case "spoof":
            bump("spoofsBlocked");
            return warn(v);
        case "typosquat":
            bump("typosquatsFlagged");
            return warn(v);
        case "executable":
            bump("executablesIntercepted");
            return warn(v);
        case "shortener": {
            if (getOption(ID, "confirmUnshorten")) {
                const choice = await new Promise<"resolve" | "open" | "cancel">(res => {
                    let picked: "resolve" | "open" | "cancel" = "cancel";
                    openModal({
                        title: t("shield.title.shortener"),
                        icon: Icons.shield,
                        body: h("div", null, h("p", { style: "margin:0" }, t("shield.body.shortener")), UrlBox(v.url)),
                        onClose: () => res(picked),
                        buttons: [
                            { label: t("common.cancel"), variant: "ghost" },
                            { label: t("shield.openDirect"), onClick: () => void (picked = "open") },
                            { label: t("shield.resolve"), variant: "primary", onClick: () => void (picked = "resolve") }
                        ]
                    });
                });
                if (choice === "cancel") return;
                if (choice === "open") return open(v.url);
            }
            toast(t("shield.resolving"), "info", 1500);
            const { url } = await Native.linkShield.unshorten(v.url);
            bump("linksUnshortened");
            const next = url !== v.url ? analyze(url) : ({ kind: "clean", url } as Verdict);
            if (next.kind === "shortener") return open(url);
            if (next.kind !== "clean" && next.kind !== "tracking") return handle(next, true);
            const final = next.kind === "tracking" ? next.cleaned : url;
            if (next.kind === "tracking") bump("trackersStripped", next.removed.length);
            // Show where the short link really goes, then let the user continue
            openModal({
                title: t("shield.title.redirect"),
                icon: Icons.shield,
                body: h("div", null, h("p", { style: "margin:0" }, t("shield.body.redirect")), UrlBox(final)),
                buttons: [
                    { label: t("common.cancel"), variant: "ghost" },
                    { label: t("shield.continue"), variant: "primary", onClick: () => open(final) }
                ]
            });
            return;
        }
        case "tracking":
            bump("trackersStripped", v.removed.length);
            if (!fromShortener) toast(t("shield.trackersRemoved", { count: v.removed.length }), "success", 2000);
            return open(v.cleaned);
        case "clean":
            return open(v.url);
    }
}

// ---------------------------------------------------------------------------
// Hover preview: real destination + verdict, shown after a short hover
// ---------------------------------------------------------------------------
let tip: HTMLElement | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function hideTip() {
    if (hoverTimer) clearTimeout(hoverTimer);
    tip?.remove();
    tip = null;
}

function onHover(e: MouseEvent) {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !getOption(ID, "hoverPreview") || !/^https?:/i.test(a.href) || a.closest(".nc-root") || isDiscordInternal(a.href)) return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
        hideTip();
        let v: Verdict;
        try {
            v = analyze(a.href, a.textContent ?? undefined);
        } catch {
            return;
        }
        const host = new URL(a.href).hostname;
        const [label, cls] =
            v.kind === "clean" ? [t("shield.hover.safe"), "ok"] : v.kind === "tracking" ? [t("shield.hover.tracking"), "accent"] : v.kind === "shortener" ? [t("shield.hover.short"), "warn"] : [t("shield.hover.danger"), "danger"];
        tip = h("div", { className: "nc-root nc-link-tip" }, h("span", { className: `nc-tag ${cls}` }, label), h("b", null, registrableDomain(host)), h("span", { className: "nc-sub" }, host !== registrableDomain(host) ? host : ""));
        document.body.appendChild(tip);
        const r = a.getBoundingClientRect();
        tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left))}px`;
        tip.style.top = `${r.top - tip.offsetHeight - 6 < 0 ? r.bottom + 6 : r.top - tip.offsetHeight - 6}px`;
    }, 350);
    a.addEventListener("mouseleave", hideTip, { once: true });
}

function ListsPanel(): Node {
    const lists = linkLists.get();
    const area = (key: "allow" | "block", label: string) =>
        h(
            "div",
            { className: "nc-stack", style: "gap:4px;flex:1;min-width:220px" },
            h("div", { className: "nc-row-label" }, label),
            h(
                "textarea",
                {
                    className: "nc-textarea",
                    style: "min-height:90px;font-family:var(--nc-mono);font-size:12.5px",
                    placeholder: "example.com",
                    onChange: (e: Event) =>
                        linkLists.update(l => void (l[key] = (e.target as HTMLTextAreaElement).value.split(/[\s,]+/).map(x => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean)))
                },
                lists[key].join("\n")
            )
        );
    return h("div", { className: "nc-row-wrap", style: "align-items:flex-start" }, area("allow", t("shield.lists.allow")), area("block", t("shield.lists.block")));
}

function onClick(e: MouseEvent) {
    if (e.defaultPrevented && e.type === "click") return;
    if (e.type === "auxclick" && e.button !== 1) return;
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.closest(".nc-root")) return;
    const href = a.href;
    if (!/^https?:/i.test(href)) return;
    let verdict: Verdict;
    try {
        verdict = analyze(href, a.textContent ?? undefined);
    } catch (err) {
        log.error("analysis failed", err);
        return;
    }
    if (verdict.kind === "clean") return; // let Discord handle it normally
    e.preventDefault();
    e.stopImmediatePropagation();
    handle(verdict).catch(err => log.error("handler failed", err));
}

export default definePlugin({
    id: ID,
    name: "plugin.linkShield.name",
    description: "plugin.linkShield.desc",
    category: "privacy",
    authors: ["NexusCord"],
    options: {
        blockPhishing: { type: "boolean", label: "plugin.linkShield.opt.blockPhishing", default: true },
        detectSpoofing: { type: "boolean", label: "plugin.linkShield.opt.detectSpoofing", default: true },
        detectTyposquat: { type: "boolean", label: "plugin.linkShield.opt.detectTyposquat", default: true },
        stripTracking: { type: "boolean", label: "plugin.linkShield.opt.stripTracking", default: true },
        unshorten: { type: "boolean", label: "plugin.linkShield.opt.unshorten", default: true },
        executableGuard: { type: "boolean", label: "plugin.linkShield.opt.executableGuard", default: true },
        confirmUnshorten: { type: "boolean", label: "plugin.linkShield.opt.confirmUnshorten", default: true },
        hoverPreview: { type: "boolean", label: "plugin.linkShield.opt.hoverPreview", default: true }
    },
    settingsPanel: ListsPanel,

    start() {
        onDomReady(() => {
            // Window-level capture runs before React's root listeners
            window.addEventListener("click", onClick, true);
            window.addEventListener("auxclick", onClick, true);
            window.addEventListener("mouseover", onHover, true);
            setStyle("nc-link-tip", `.nc-link-tip{position:fixed;z-index:100003;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:10px;background:var(--nc-modal);backdrop-filter:blur(14px);border:1px solid var(--nc-border);box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:12.5px;pointer-events:none;max-width:420px}.nc-link-tip b{color:var(--nc-text)}`);
        });
        cleanups.push(() => {
            window.removeEventListener("click", onClick, true);
            window.removeEventListener("auxclick", onClick, true);
            window.removeEventListener("mouseover", onHover, true);
            hideTip();
            setStyle("nc-link-tip", null);
        });

        Patcher.instead(ID, window, "open", (self, args, original) => {
            const url = args[0] == null ? "" : String(args[0]);
            if (!/^https?:/i.test(url)) return original.apply(self, args);
            const v = analyze(url);
            if (v.kind === "clean") return original.apply(self, args);
            if (v.kind === "tracking") {
                bump("trackersStripped", v.removed.length);
                return original.apply(self, [v.cleaned, ...args.slice(1)]);
            }
            handle(v).catch(err => log.error("handler failed", err));
            return null;
        });
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
    },

    onOptionChange() {
        /* options are read live on every click */
    }
});
