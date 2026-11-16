/*
 * Shared context-menu extension API (DOM based, so it survives Discord's frequent
 * menu refactors). On right-click we resolve WHAT was clicked once, then every
 * registered item whose `when()` matches is appended to Discord's menu using
 * Discord's own item classes so it looks native.
 */
import { h, onDomReady, setStyle } from "./dom";
import { getMessage, currentGuildId } from "./discord";
import { Logger } from "./logger";
import { observe, parseMessageElement, userIdFromElement } from "./domObserver";

const log = new Logger("ContextMenu");

export interface MenuTarget {
    el: Element;
    at: number;
    userId?: string;
    messageId?: string;
    channelId?: string;
    guildId?: string;
    message?: any;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    emoji?: { id: string; name: string; animated: boolean; url: string };
    selection?: string;
    isChatInput?: boolean;
    isOwnMessage?: boolean;
}

export interface MenuItem {
    id: string;
    label: () => string;
    when: (t: MenuTarget) => boolean;
    action: (t: MenuTarget) => void;
    danger?: boolean;
    /** Lower = higher in our group */
    order?: number;
}

const items = new Map<string, MenuItem & { owner: string }>();
let target: MenuTarget | null = null;
let started = false;

export function resolveTarget(el: Element): MenuTarget {
    const t: MenuTarget = { el, at: Date.now() };
    const msg = parseMessageElement(el);
    if (msg) {
        t.channelId = msg.channelId;
        t.messageId = msg.messageId;
        t.message = getMessage(msg.channelId, msg.messageId);
    }
    const uid = userIdFromElement(el);
    if (uid) t.userId = uid;
    else if (t.message && el.closest('[class*="username"], [class*="avatar"], [class*="header"] img')) t.userId = t.message.author?.id;

    const chItem = el.closest('[data-list-item-id^="channels___"], [data-list-item-id^="private-channels-"]');
    if (chItem) {
        const id = chItem.getAttribute("data-list-item-id")!.replace(/^(channels___|private-channels-uid_\d+___)/, "");
        if (/^\d+$/.test(id)) t.channelId = id;
    }
    const guildItem = el.closest('[data-list-item-id^="guildsnav___"]');
    if (guildItem) {
        const id = guildItem.getAttribute("data-list-item-id")!.slice("guildsnav___".length);
        if (/^\d+$/.test(id)) t.guildId = id;
    }
    t.guildId ??= currentGuildId();

    const img = (el.closest("img") ?? (el.closest('[class*="imageWrapper"], [class*="mosaicItem"]')?.querySelector("img") ?? null)) as HTMLImageElement | null;
    if (img?.src) {
        const em = /\/emojis\/(\d+)\.(\w+)/.exec(img.src);
        if (em) {
            const name = (img.getAttribute("data-name") ?? img.alt ?? "emoji").replace(/:/g, "") || "emoji";
            t.emoji = { id: em[1], name, animated: em[2] === "gif" || img.src.includes("animated=true"), url: img.src };
        } else t.imageUrl = img.src;
    }
    const video = el.closest("video") ?? el.closest('[class*="video"]')?.querySelector("video");
    if (video?.src) t.videoUrl = video.src;
    const a = el.closest("a[href]") as HTMLAnchorElement | null;
    if (a && /^https?:/.test(a.href)) t.linkUrl = a.href;
    t.isChatInput = !!el.closest('[role="textbox"], [class*="channelTextArea"]');
    const sel = getSelection()?.toString().trim();
    if (sel) t.selection = sel;
    return t;
}

export function registerMenuItem(owner: string, item: MenuItem): () => void {
    items.set(item.id, { ...item, owner });
    start();
    return () => items.delete(item.id);
}

function close() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
}

function build(menu: HTMLElement, t: MenuTarget) {
    if (menu.querySelector(".nc-ctx-group")) return;
    const matching = [...items.values()]
        .filter(i => {
            try {
                return i.when(t);
            } catch {
                return false;
            }
        })
        .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    if (!matching.length) return;

    const sample = menu.querySelector<HTMLElement>('[role="menuitem"]');
    const itemClass = sample?.className ?? "";
    const labelClass = sample?.querySelector("div")?.className ?? "";
    const groupEl = menu.querySelector<HTMLElement>('[role="group"]');
    const scroller = groupEl?.parentElement ?? menu;
    const sep = scroller.querySelector('[role="separator"]')?.cloneNode(false) as HTMLElement | undefined;

    const els = matching.map(i =>
        h(
            "div",
            {
                className: `${itemClass} nc-ctx-item${i.danger ? " nc-ctx-danger" : ""}`,
                role: "menuitem",
                tabindex: "-1",
                "data-nc-item": i.id,
                onClick: (e: MouseEvent) => {
                    e.stopPropagation();
                    close();
                    try {
                        i.action(t);
                    } catch (err) {
                        log.error(`Menu item ${i.id} failed`, err);
                    }
                },
                onMouseEnter: (e: MouseEvent) => (e.currentTarget as HTMLElement).classList.add("nc-ctx-hover"),
                onMouseLeave: (e: MouseEvent) => (e.currentTarget as HTMLElement).classList.remove("nc-ctx-hover")
            },
            h("div", { className: labelClass }, i.label())
        )
    );
    if (sep) scroller.appendChild(sep);
    scroller.appendChild(h("div", { className: `${groupEl?.className ?? ""} nc-ctx-group`, role: "group" }, els));
}

function start() {
    if (started) return;
    started = true;
    setStyle(
        "nc-ctx",
        `.nc-ctx-item.nc-ctx-hover{background:var(--menu-item-default-hover-bg,var(--brand-500,#5865f2))!important;color:#fff!important}
         .nc-ctx-item.nc-ctx-danger{color:var(--status-danger,#f23f43)}.nc-ctx-item.nc-ctx-danger.nc-ctx-hover{background:var(--status-danger,#f23f43)!important}
         .nc-ctx-group:not(:first-child){margin-top:2px}`
    );
    onDomReady(() =>
        document.addEventListener(
            "contextmenu",
            e => {
                try {
                    target = resolveTarget(e.target as Element);
                    if (target.message && target.message.author?.id) {
                        const me = (window as any).NexusCord?.Discord?.currentUser?.();
                        target.isOwnMessage = !!me && me.id === target.message.author.id;
                    }
                } catch (err) {
                    log.error("target resolution failed", err);
                }
            },
            true
        )
    );
    observe("contextMenu", '[role="menu"]', menu => {
        if (!target || Date.now() - target.at > 2000) return;
        const t = target;
        requestAnimationFrame(() => build(menu, t));
    });
}

export function getLastTarget(): MenuTarget | null {
    return target;
}
