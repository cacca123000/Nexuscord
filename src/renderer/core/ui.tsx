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
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`
};

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
        <div className={["nc-modal", opts.wide && "wide", opts.tone]} role="dialog" aria-modal="true" aria-label={opts.title}>
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

export function toast(message: string, kind: "info" | "success" | "error" | "warn" = "info", timeout = 3500): void {
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
