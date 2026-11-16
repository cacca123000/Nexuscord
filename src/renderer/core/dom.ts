/*
 * Tiny JSX runtime that produces REAL DOM nodes (no virtual DOM).
 * NexusCord's own UI is framework-free so it keeps working even when Discord
 * reshuffles its React internals; Discord's React is only used as a thin host.
 */
type Child = Node | string | number | boolean | null | undefined | Child[];
type Props = Record<string, any> | null;

declare global {
    namespace JSX {
        type Element = HTMLElement;
        interface ElementChildrenAttribute {
            children: {};
        }
        interface IntrinsicElements {
            [tag: string]: Record<string, any>;
        }
    }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "g", "line", "polyline", "polygon", "defs", "linearGradient", "stop"]);

function appendChildren(parent: Node, children: Child[]) {
    for (const c of children) {
        if (c == null || c === false || c === true) continue;
        if (Array.isArray(c)) appendChildren(parent, c);
        else parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}

export function h(tag: string | ((props: any) => Node), props: Props, ...children: Child[]): HTMLElement {
    if (typeof tag === "function") return tag({ ...(props ?? {}), children }) as HTMLElement;

    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (value == null || value === false) continue;
            if (key === "ref" && typeof value === "function") value(el);
            else if (key === "style") {
                if (typeof value === "string") el.setAttribute("style", value);
                else Object.assign((el as HTMLElement).style, value);
            } else if (key === "className" || key === "class") el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : value);
            else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
            else if (key === "value" || key === "checked" || key === "selected" || key === "disabled") (el as any)[key] = value;
            else if (key === "html") el.innerHTML = value; // only used with trusted, static SVG strings
            else el.setAttribute(key, value === true ? "" : String(value));
        }
    }
    appendChildren(el, children);
    return el as HTMLElement;
}

export function Fragment(props: { children?: Child[] }): HTMLElement {
    const frag = document.createDocumentFragment();
    appendChildren(frag, props.children ?? []);
    return frag as unknown as HTMLElement;
}

/** Replaces the content of `host` with `render()` and re-renders when `subscribe` fires. */
export function reactive(host: HTMLElement, render: () => Node, ...subscribers: ((cb: () => void) => () => void)[]): () => void {
    const draw = () => {
        // Keep focus/caret on inputs that survive re-render (search boxes)
        const active = document.activeElement as HTMLInputElement | null;
        const focusKey = active && host.contains(active) ? active.dataset.focusKey : undefined;
        const caret = focusKey ? active!.selectionStart : null;
        host.replaceChildren(render());
        if (focusKey) {
            const next = host.querySelector<HTMLInputElement>(`[data-focus-key="${focusKey}"]`);
            if (next) {
                next.focus();
                if (caret != null) next.setSelectionRange(caret, caret);
            }
        }
    };
    draw();
    const unsubs = subscribers.map(s => s(draw));
    return () => unsubs.forEach(u => u());
}

const styleEls = new Map<string, HTMLStyleElement>();

/** Inserts or updates a <style> tag identified by `id`. */
export function setStyle(id: string, css: string | null): void {
    let el = styleEls.get(id) ?? (document.getElementById(id) as HTMLStyleElement | null);
    if (css == null) {
        el?.remove();
        styleEls.delete(id);
        return;
    }
    if (!el) {
        el = document.createElement("style");
        el.id = id;
        styleEls.set(id, el);
    }
    if (el.textContent !== css) el.textContent = css;
    // Always keep our styles last so they win the cascade
    const parent = document.head ?? document.documentElement;
    if (el.parentNode !== parent || el !== parent.lastElementChild) parent.appendChild(el);
}

export function onDomReady(cb: () => void): void {
    if (document.readyState !== "loading" && document.body) cb();
    else document.addEventListener("DOMContentLoaded", () => cb(), { once: true });
}

export function escapeCssString(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\A ").replace(/[\u0000-\u001f]/g, " ");
}
