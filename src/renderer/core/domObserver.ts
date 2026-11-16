/*
 * ONE shared MutationObserver for every DOM-based feature (instead of one per plugin).
 * Subscribers register a CSS selector; matching elements are delivered in batches
 * once per animation frame, both for newly added nodes and (on subscribe) for
 * elements already in the page.
 */
import { onDomReady } from "./dom";
import { Logger } from "./logger";

const log = new Logger("DomObserver");

interface Sub {
    selector: string;
    cb: (el: HTMLElement) => void;
    owner: string;
}

const subs = new Set<Sub>();
let pending: Element[] = [];
let scheduled = false;
let observer: MutationObserver | null = null;

function flush() {
    scheduled = false;
    const roots = pending;
    pending = [];
    if (!subs.size) return;
    for (const sub of subs) {
        const seen = new Set<Element>();
        for (const root of roots) {
            if (!root.isConnected) continue;
            try {
                if (root.matches(sub.selector) && !seen.has(root)) {
                    seen.add(root);
                    sub.cb(root as HTMLElement);
                }
                for (const el of root.querySelectorAll(sub.selector)) {
                    if (seen.has(el)) continue;
                    seen.add(el);
                    sub.cb(el as HTMLElement);
                }
            } catch (e) {
                log.error(`Observer callback from ${sub.owner} threw`, e);
            }
        }
    }
}

function ensureObserver() {
    if (observer) return;
    onDomReady(() => {
        if (observer) return;
        observer = new MutationObserver(records => {
            for (const r of records) {
                for (const n of r.addedNodes) if (n.nodeType === 1) pending.push(n as Element);
                // Text edits inside messages (edits, translations) re-trigger the parent
                if (r.type === "characterData" && r.target.parentElement) pending.push(r.target.parentElement);
            }
            if (pending.length && !scheduled) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/** Calls `cb` for every current and future element matching `selector`. */
export function observe(owner: string, selector: string, cb: (el: HTMLElement) => void): () => void {
    const sub: Sub = { selector, cb, owner };
    subs.add(sub);
    ensureObserver();
    onDomReady(() => {
        if (!subs.has(sub)) return;
        for (const el of document.querySelectorAll(selector)) {
            try {
                cb(el as HTMLElement);
            } catch (e) {
                log.error(`Observer callback from ${owner} threw`, e);
            }
        }
    });
    return () => subs.delete(sub);
}

/** Message list items: id="chat-messages-<channelId>-<messageId>" */
export const MESSAGE_SELECTOR = 'li[id^="chat-messages-"]';

export function parseMessageElement(el: Element | null): { channelId: string; messageId: string } | null {
    const li = el?.closest?.('[id^="chat-messages-"]');
    const m = li && /^chat-messages-(\w+)-(\w+)$/.exec(li.id);
    return m ? { channelId: m[1], messageId: m[2] } : null;
}

/** Best-effort user id from an element (data attributes, avatar URLs, message author). */
export function userIdFromElement(el: Element | null): string | null {
    if (!el) return null;
    const withAttr = el.closest("[data-user-id]");
    if (withAttr) return withAttr.getAttribute("data-user-id");
    const img = (el.closest("img") ?? el.querySelector?.("img")) as HTMLImageElement | null;
    const m = img?.src && /\/(?:avatars|users)\/(\d{15,22})\//.exec(img.src);
    return m ? m[1] : null;
}
