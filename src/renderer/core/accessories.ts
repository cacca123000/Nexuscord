/*
 * Message accessories: extra UI attached under a message (translations, account-age
 * badges, reactor avatars...). Stored by message id and re-attached automatically
 * whenever Discord re-renders or virtualizes the message list.
 */
import { MESSAGE_SELECTOR, observe } from "./domObserver";

type Factory = () => Node;
const accessories = new Map<string, Map<string, Factory>>(); // messageId -> key -> factory
let started = false;

function attach(li: Element) {
    const m = /^chat-messages-\d+-(\d+)$/.exec(li.id);
    if (!m) return;
    const map = accessories.get(m[1]);
    const content = li.querySelector(`#message-content-${m[1]}`) ?? li.querySelector('[id^="message-content-"]');
    const anchor = content?.parentElement ?? li;
    // Remove stale ones
    for (const el of anchor.querySelectorAll<HTMLElement>(":scope > .nc-acc")) {
        if (!map?.has(el.dataset.key!)) el.remove();
    }
    if (!map) return;
    for (const [key, factory] of map) {
        if (anchor.querySelector(`:scope > .nc-acc[data-key="${CSS.escape(key)}"]`)) continue;
        const wrap = document.createElement("div");
        wrap.className = "nc-acc nc-root";
        wrap.dataset.key = key;
        wrap.appendChild(factory());
        if (content && content.parentElement === anchor) content.after(wrap);
        else anchor.appendChild(wrap);
    }
}

function start() {
    if (started) return;
    started = true;
    observe("accessories", MESSAGE_SELECTOR, attach);
}

export function setAccessory(messageId: string, key: string, factory: Factory | null) {
    start();
    let map = accessories.get(messageId);
    if (factory) {
        if (!map) accessories.set(messageId, (map = new Map()));
        map.set(key, factory);
    } else if (map) {
        map.delete(key);
        if (!map.size) accessories.delete(messageId);
    }
    for (const li of document.querySelectorAll(`li[id$="-${messageId}"]`)) {
        li.querySelectorAll(`.nc-acc[data-key="${CSS.escape(key)}"]`).forEach(e => e.remove());
        attach(li);
    }
}

export function clearAccessories(key: string) {
    for (const [id, map] of accessories) {
        map.delete(key);
        if (!map.size) accessories.delete(id);
    }
    document.querySelectorAll(`.nc-acc[data-key="${CSS.escape(key)}"]`).forEach(e => e.remove());
}
