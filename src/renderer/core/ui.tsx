/* Reusable NexusCord UI primitives (real DOM via our JSX runtime). */
import { h } from "./dom";
import { svgIcon } from "./icons";
import { t } from "./i18n";
void h;

export const Icons = {
    logo: svgIcon("logo"),
    gear: svgIcon("gear"),
    folder: svgIcon("folder"),
    close: svgIcon("close"),
    shield: svgIcon("shield"),
    alert: svgIcon("alert"),
    lock: svgIcon("lock"),
    refresh: svgIcon("refresh"),
    trash: svgIcon("trash"),
    home: svgIcon("logo"),
    puzzle: svgIcon("puzzle"),
    brush: svgIcon("brush"),
    palette: svgIcon("palette"),
    bolt: svgIcon("bolt"),
    wrench: svgIcon("wrench"),
    store: svgIcon("download"),
    download: svgIcon("download"),
    search: svgIcon("search"),
    bell: svgIcon("bell"),
    check: svgIcon("check"),
    heart: svgIcon("heart"),
    copy: svgIcon("copy"),
    eye: svgIcon("eye"),
    external: svgIcon("external"),
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
    return <input className="nc-color" type="color" value={props.value || "#e57a4c"} onInput={(e: Event) => props.onChange((e.target as HTMLInputElement).value)} />;
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
