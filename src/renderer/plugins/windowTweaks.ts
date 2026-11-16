/*
 * WindowTweaks (TesCord-style QoL)
 *  - Keeps -webkit-app-region: drag on Discord's custom titlebar (and no-drag on
 *    its buttons) so the frameless window can always be moved
 *  - Optional Windows 11 acrylic transparency
 *  - "Copy User ID / Message ID / Channel ID / Raw JSON" context menu items
 */
import { h, onDomReady, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";
import { copyText } from "../core/ui";
import { findStoreLazy } from "../core/webpack";

const ID = "windowTweaks";
const MessageStore = findStoreLazy("MessageStore");
const UserStore = findStoreLazy("UserStore");
const ChannelStore = findStoreLazy("ChannelStore");
const cleanups: (() => void)[] = [];

const DRAG_CSS = `
[class*="titleBar"], [class^="bar_"]:has([class*="winButton"]), [class*=" bar_"]:has([class*="winButton"]) { -webkit-app-region: drag; }
[class*="titleBar"] :is([class*="winButton"], button, a, input, [role="button"], [class*="trailing"] > *, [class*="leading"] > *),
[class^="bar_"] :is([class*="winButton"], button, a, input, [role="button"], [class*="trailing"] > *) { -webkit-app-region: no-drag; }
`;

const ACRYLIC_CSS = `
html.nc-acrylic, html.nc-acrylic body, html.nc-acrylic #app-mount, html.nc-acrylic [class*="appMount"] { background: transparent !important; }
html.nc-acrylic .theme-dark, html.nc-acrylic.theme-dark {
  --background-primary: rgba(49, 51, 56, .72); --background-secondary: rgba(43, 45, 49, .62);
  --background-secondary-alt: rgba(35, 36, 40, .62); --background-tertiary: rgba(30, 31, 34, .55);
  --background-base-lowest: rgba(30, 31, 34, .5); --background-base-lower: rgba(35, 36, 40, .58);
  --background-base-low: rgba(43, 45, 49, .62); --background-surface-high: rgba(49, 51, 56, .7);
  --bg-base-primary: rgba(49, 51, 56, .72); --bg-base-secondary: rgba(43, 45, 49, .62); --bg-base-tertiary: rgba(30, 31, 34, .55);
  --chat-background: rgba(49, 51, 56, .5);
}
`;

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
interface MenuTarget {
    userId?: string;
    messageId?: string;
    channelId?: string;
    at: number;
}
let lastTarget: MenuTarget | null = null;

function extractTarget(el: Element | null): MenuTarget {
    const target: MenuTarget = { at: Date.now() };
    if (!el) return target;
    const msgLi = el.closest('[id^="chat-messages-"]');
    const m = msgLi && /^chat-messages-(\d+)-(\d+)$/.exec(msgLi.id);
    if (m) {
        target.channelId = m[1];
        target.messageId = m[2];
    }
    const userEl = el.closest("[data-user-id]");
    if (userEl) target.userId = userEl.getAttribute("data-user-id")!;
    if (!target.userId) {
        const img = (el.closest("img") ?? el.querySelector?.("img")) as HTMLImageElement | null;
        const a = img?.src && /\/avatars\/(\d+)\//.exec(img.src);
        if (a) target.userId = a[1];
    }
    if (!target.userId && target.messageId && (el.closest('[class*="username"]') || el.closest('[class*="avatar"]'))) {
        target.userId = MessageStore.getMessage?.(target.channelId, target.messageId)?.author?.id;
    }
    const chEl = el.closest('[data-list-item-id^="channels___"]');
    if (chEl) target.channelId = chEl.getAttribute("data-list-item-id")!.slice("channels___".length);
    return target;
}

function safeJson(value: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(
        value,
        (_k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (v && typeof v === "object") {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
                if (typeof v.toJSON === "function" && v._isAMomentObject) return v.toISOString?.();
            }
            return v;
        },
        2
    );
}

function buildItems(menu: HTMLElement, target: MenuTarget) {
    if (menu.querySelector(".nc-ctx-group")) return;
    const sample = menu.querySelector<HTMLElement>('[role="menuitem"]');
    const itemClass = sample?.className ?? "";
    const labelClass = sample?.firstElementChild?.className ?? "";
    const groupClass = menu.querySelector<HTMLElement>('[role="group"]')?.className ?? "";
    const scroller = sample?.closest('[role="group"]')?.parentElement ?? menu;

    const close = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    const item = (label: string, action: () => void) =>
        h(
            "div",
            {
                className: `${itemClass} nc-ctx-item`,
                role: "menuitem",
                tabindex: "-1",
                onClick: (e: MouseEvent) => {
                    e.stopPropagation();
                    action();
                    close();
                },
                onMouseEnter: (e: MouseEvent) => (e.currentTarget as HTMLElement).classList.add("nc-ctx-hover"),
                onMouseLeave: (e: MouseEvent) => (e.currentTarget as HTMLElement).classList.remove("nc-ctx-hover")
            },
            h("div", { className: labelClass }, label)
        );

    const items: HTMLElement[] = [];
    if (target.userId) items.push(item(t("plugin.windowTweaks.copyUserId"), () => copyText(target.userId!)));
    if (target.messageId) items.push(item(t("plugin.windowTweaks.copyMessageId"), () => copyText(target.messageId!)));
    if (target.channelId && !target.messageId) items.push(item(t("plugin.windowTweaks.copyChannelId"), () => copyText(target.channelId!)));
    const raw =
        (target.messageId && MessageStore.getMessage?.(target.channelId, target.messageId)) ||
        (target.userId && UserStore.getUser?.(target.userId)) ||
        (target.channelId && ChannelStore.getChannel?.(target.channelId));
    if (raw) items.push(item(t("plugin.windowTweaks.copyJson"), () => copyText(safeJson(raw))));
    if (!items.length) return;

    const sep = scroller.querySelector('[role="separator"]')?.cloneNode(false) as HTMLElement | undefined;
    if (sep) scroller.appendChild(sep);
    scroller.appendChild(h("div", { className: `${groupClass} nc-ctx-group`, role: "group" }, items));
}

export default definePlugin({
    id: ID,
    name: "plugin.windowTweaks.name",
    description: "plugin.windowTweaks.desc",
    authors: ["NexusCord"],
    options: {
        fixDrag: { type: "boolean", label: "plugin.windowTweaks.opt.fixDrag", default: true },
        acrylic: { type: "boolean", label: "plugin.windowTweaks.opt.acrylic", default: false },
        contextMenu: { type: "boolean", label: "plugin.windowTweaks.opt.contextMenu", default: true }
    },

    start() {
        const applyStyles = () => {
            setStyle("nc-window-drag", getOption(ID, "fixDrag") ? DRAG_CSS : null);
            const acrylic = !!getOption(ID, "acrylic");
            setStyle("nc-window-acrylic", acrylic ? ACRYLIC_CSS : null);
            document.documentElement.classList.toggle("nc-acrylic", acrylic);
            setStyle("nc-window-ctx", `.nc-ctx-item.nc-ctx-hover{background:var(--menu-item-default-hover-bg,var(--brand-500,#5865f2));color:#fff}`);
        };
        onDomReady(applyStyles);
        if (getOption(ID, "acrylic")) Native.perf.setAcrylic(true);

        const onContext = (e: MouseEvent) => {
            if (!getOption(ID, "contextMenu")) return;
            lastTarget = extractTarget(e.target as Element);
        };
        document.addEventListener("contextmenu", onContext, true);
        cleanups.push(() => document.removeEventListener("contextmenu", onContext, true));

        const obs = new MutationObserver(records => {
            if (!lastTarget || Date.now() - lastTarget.at > 1500) return;
            for (const r of records) {
                for (const n of r.addedNodes) {
                    if (!(n instanceof HTMLElement)) continue;
                    const menu = n.matches('[role="menu"]') ? n : n.querySelector<HTMLElement>('[role="menu"]');
                    if (menu) {
                        const target = lastTarget;
                        // Let Discord finish rendering its own items first
                        requestAnimationFrame(() => buildItems(menu, target));
                        lastTarget = null;
                        return;
                    }
                }
            }
        });
        onDomReady(() => obs.observe(document.body, { childList: true, subtree: true }));
        cleanups.push(() => obs.disconnect());
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
        for (const id of ["nc-window-drag", "nc-window-acrylic", "nc-window-ctx"]) setStyle(id, null);
        document.documentElement.classList.remove("nc-acrylic");
        if (getOption(ID, "acrylic")) Native.perf.setAcrylic(false);
    },

    onOptionChange(key, value) {
        if (key === "acrylic") Native.perf.setAcrylic(!!value);
        setStyle("nc-window-drag", getOption(ID, "fixDrag") ? DRAG_CSS : null);
        setStyle("nc-window-acrylic", getOption(ID, "acrylic") ? ACRYLIC_CSS : null);
        document.documentElement.classList.toggle("nc-acrylic", !!getOption(ID, "acrylic"));
    }
});
