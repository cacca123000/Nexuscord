/* Reusable NexusCord UI primitives (real DOM via our JSX runtime). */
import { h } from "./dom";
import { t } from "./i18n";
void h;

export const Icons = {
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V5l14 14V5"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>`,
    puzzle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4v3a2 2 0 1 0 4 0V3h2a1 1 0 0 1 1 1v5h-3a2 2 0 1 0 0 4h3v7a1 1 0 0 1-1 1h-6v-3a2 2 0 1 0-4 0v3H4a1 1 0 0 1-1-1v-6h3a2 2 0 1 0 0-4H3V4a1 1 0 0 1 1-1h6z"/></svg>`,
    brush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8 8.2 13z"/><path d="M7 14c-2 0-3.5 1.5-3.5 3.5 0 1.2-.5 2-1.5 2.5 1 1 2.5 1.5 4 1.5 2.8 0 4.5-1.8 4.5-4.2z"/></svg>`,
    palette: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/><circle cx="7.5" cy="10.5" r="1.3"/><circle cx="12" cy="7" r="1.3"/><circle cx="16.5" cy="10.5" r="1.3"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
    wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3 18 3l3 3-3.3 3.3"/></svg>`,
    store: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 5 3h14l2 6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>`
};

export function SearchBox(props: { value: string; placeholder: string; focusKey: string; onInput: (v: string) => void }) {
    return (
        <label className="nc-search">
            <Icon svg={Icons.search} size={15} />
            <input
                className="nc-input"
                data-focus-key={props.focusKey}
                placeholder={props.placeholder}
                value={props.value}
                onInput={(e: Event) => props.onInput((e.target as HTMLInputElement).value)}
            />
        </label>
    );
}

export function Tabs<T extends string>(props: { value: T; tabs: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
    return (
        <div className="nc-tabs" role="tablist">
            {props.tabs.map(tab => (
                <button className={["nc-tab", props.value === tab.id && "active"]} role="tab" aria-selected={String(props.value === tab.id)} type="button" onClick={() => props.onChange(tab.id)}>
                    {tab.label}
                    {tab.count != null ? <span className="nc-count">{tab.count}</span> : null}
                </button>
            ))}
        </div>
    );
}

export function TextInput(props: { value: string; placeholder?: string; onChange: (v: string) => void; type?: string; grow?: boolean; focusKey?: string; live?: boolean }) {
    return (
        <input
            className={["nc-input", props.grow && "grow"]}
            type={props.type ?? "text"}
            value={props.value}
            placeholder={props.placeholder}
            data-focus-key={props.focusKey}
            {...{ [props.live ? "onInput" : "onChange"]: (e: Event) => props.onChange((e.target as HTMLInputElement).value) }}
        />
    );
}

export function ColorInput(props: { value: string; onChange: (v: string) => void }) {
    return <input className="nc-color" type="color" value={props.value || "#7c5cff"} onInput={(e: Event) => props.onChange((e.target as HTMLInputElement).value)} />;
}

export function Slider(props: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
    const label = <span className="nc-sub" style="min-width:48px;text-align:right">{`${props.value}${props.unit ?? ""}`}</span>;
    return (
        <span className="nc-row-wrap">
            <input
                className="nc-range"
                type="range"
                min={props.min}
                max={props.max}
                step={props.step ?? 1}
                value={String(props.value)}
                onInput={(e: Event) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    label.textContent = `${v}${props.unit ?? ""}`;
                }}
                onChange={(e: Event) => props.onChange(Number((e.target as HTMLInputElement).value))}
            />
            {label}
        </span>
    );
}

/** Minimal dependency-free SVG line chart (multiple series). */
export function LineChart(props: { series: { label: string; color: string; values: number[] }[]; unit?: string; height?: number }) {
    const W = 600, H = props.height ?? 160, P = 28;
    const all = props.series.flatMap(s => s.values);
    const max = Math.max(1, ...all) * 1.1;
    const n = Math.max(2, ...props.series.map(s => s.values.length));
    const x = (i: number) => P + (i / (n - 1)) * (W - P - 6);
    const y = (v: number) => H - 18 - (v / max) * (H - 30);
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "nc-chart");
    svg.setAttribute("preserveAspectRatio", "none");
    for (let g = 0; g <= 3; g++) {
        const v = (max / 3) * g;
        const line = document.createElementNS(NS, "line");
        Object.entries({ x1: P, x2: W, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": "0.08" }).forEach(([k, val]) => line.setAttribute(k, String(val)));
        svg.appendChild(line);
        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", "2");
        label.setAttribute("y", String(y(v) + 3));
        label.textContent = `${Math.round(v)}${props.unit ?? ""}`;
        svg.appendChild(label);
    }
    for (const s of props.series) {
        if (s.values.length < 2) continue;
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const area = document.createElementNS(NS, "polygon");
        area.setAttribute("points", `${x(0)},${H - 18} ${pts} ${x(s.values.length - 1)},${H - 18}`);
        area.setAttribute("fill", s.color);
        area.setAttribute("fill-opacity", "0.12");
        svg.appendChild(area);
        const pl = document.createElementNS(NS, "polyline");
        pl.setAttribute("points", pts);
        pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", s.color);
        pl.setAttribute("stroke-width", "2");
        pl.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(pl);
    }
    const legend = (
        <div className="nc-row-wrap" style="gap:14px;font-size:12px">
            {props.series.map(s => (
                <span style="display:inline-flex;gap:6px;align-items:center">
                    <i style={`width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block`} />
                    {s.label}
                </span>
            ))}
        </div>
    );
    return (
        <div className="nc-stack">
            {svg}
            {legend}
        </div>
    );
}

export function Icon({ svg, size = 16 }: { svg: string; size?: number }) {
    return <span style={{ display: "inline-flex", width: `${size}px`, height: `${size}px` }} html={svg} aria-hidden="true" />;
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
        <label className="nc-switch" title={props.label}>
            <input
                type="checkbox"
                checked={props.checked}
                aria-label={props.label}
                onChange={(e: Event) => props.onChange((e.target as HTMLInputElement).checked)}
            />
            <span />
        </label>
    );
}

export function Button(props: { variant?: "primary" | "danger" | "ghost" | "icon"; onClick?: (e: MouseEvent) => void; title?: string; icon?: string; children?: any }) {
    return (
        <button className={["nc-btn", props.variant]} title={props.title} onClick={props.onClick} type="button">
            {props.icon ? <Icon svg={props.icon} /> : null}
            {props.children}
        </button>
    );
}

export function Select<T extends string | number>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
        <select
            className="nc-select"
            onChange={(e: Event) => {
                const raw = (e.target as HTMLSelectElement).value;
                const opt = props.options.find(o => String(o.value) === raw);
                if (opt) props.onChange(opt.value);
            }}
        >
            {props.options.map(o => (
                <option value={String(o.value)} selected={o.value === props.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

export function SettingRow(props: { label: string; hint?: string; control: Node }) {
    return (
        <div className="nc-row">
            <div className="nc-row-label">
                {props.label}
                {props.hint ? <small>{props.hint}</small> : null}
            </div>
            {props.control}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
export interface ModalButton {
    label: string;
    variant?: "primary" | "danger" | "ghost";
    /** Return false to keep the modal open */
    onClick?: () => void | boolean | Promise<void | boolean>;
}

export interface ModalOptions {
    title: string;
    body: Node | string;
    buttons?: ModalButton[];
    tone?: "danger" | "warn" | "info";
    icon?: string;
    wide?: boolean;
    medium?: boolean;
    className?: string;
    onClose?: () => void;
    dismissable?: boolean;
}

const openModals = new Set<() => void>();

export function openModal(opts: ModalOptions): { close: () => void; element: HTMLElement } {
    const prevFocus = document.activeElement as HTMLElement | null;
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        openModals.delete(close);
        layer.remove();
        document.removeEventListener("keydown", onKey, true);
        try {
            opts.onClose?.();
        } catch { /* ignore */ }
        prevFocus?.focus?.();
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && opts.dismissable !== false) {
            e.stopPropagation();
            e.preventDefault();
            close();
        }
    };

    const buttons = (opts.buttons ?? [{ label: t("common.close"), variant: "primary" }]).map(b => (
        <Button
            variant={b.variant}
            onClick={async () => {
                const keep = await b.onClick?.();
                if (keep !== false) close();
            }}
        >
            {b.label}
        </Button>
    ));

    const modal = (
        <div className={["nc-modal", opts.wide && "wide", opts.medium && "medium", opts.tone, opts.className]} role="dialog" aria-modal="true" aria-label={opts.title}>
            <div className="nc-modal-head">
                {opts.icon ? <div className="nc-badge-icon"><Icon svg={opts.icon} size={18} /></div> : null}
                <h2>{opts.title}</h2>
                <Button variant="icon" title={t("common.close")} icon={Icons.close} onClick={close} />
            </div>
            <div className="nc-modal-body">{typeof opts.body === "string" ? <p>{opts.body}</p> : opts.body}</div>
            {buttons.length ? <div className="nc-modal-foot">{buttons}</div> : null}
        </div>
    );
    const layer = (
        <div className="nc-layer nc-root" onMouseDown={(e: MouseEvent) => e.target === layer && opts.dismissable !== false && close()}>
            {modal}
        </div>
    );
    document.body.appendChild(layer);
    document.addEventListener("keydown", onKey, true);
    openModals.add(close);
    // Focus the primary action for keyboard users
    requestAnimationFrame(() => (modal.querySelector(".nc-modal-foot .nc-btn") as HTMLElement | null)?.focus());
    return { close, element: modal };
}

export function closeAllModals() {
    for (const c of [...openModals]) c();
}

export function confirmModal(title: string, body: string | Node, confirmLabel = t("common.confirm"), tone: ModalOptions["tone"] = "info"): Promise<boolean> {
    return new Promise(resolve => {
        let result = false;
        openModal({
            title,
            body,
            tone,
            onClose: () => resolve(result),
            buttons: [
                { label: t("common.cancel"), variant: "ghost" },
                { label: confirmLabel, variant: tone === "danger" ? "danger" : "primary", onClick: () => void (result = true) }
            ]
        });
    });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
let toastHost: HTMLElement | null = null;

export interface NotificationEntry {
    id: number;
    at: number;
    kind: "info" | "success" | "error" | "warn";
    text: string;
}
const history: NotificationEntry[] = [];
const historyListeners = new Set<() => void>();
let nextId = 1;
export const NotificationLog = {
    all: () => history,
    clear() {
        history.length = 0;
        historyListeners.forEach(l => l());
    },
    push(kind: NotificationEntry["kind"], text: string) {
        history.unshift({ id: nextId++, at: Date.now(), kind, text });
        if (history.length > 150) history.pop();
        historyListeners.forEach(l => l());
    },
    subscribe(cb: () => void) {
        historyListeners.add(cb);
        return () => historyListeners.delete(cb);
    }
};

export function toast(message: string, kind: "info" | "success" | "error" | "warn" = "info", timeout = 3500): void {
    NotificationLog.push(kind, message);
    if (!document.body) return;
    if (!toastHost || !toastHost.isConnected) {
        toastHost = <div className="nc-toasts nc-root" />;
        document.body.appendChild(toastHost);
    }
    const el = <div className={["nc-toast", kind]} role="status">{message}</div>;
    toastHost.appendChild(el);
    setTimeout(() => {
        el.style.transition = "opacity .25s";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 260);
    }, timeout);
}

export async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = <textarea style="position:fixed;opacity:0" /> as HTMLTextAreaElement;
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }
    toast(t("common.copied"), "success", 1800);
}
