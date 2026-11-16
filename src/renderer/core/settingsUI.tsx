/*
 * NexusCord inside Discord's own User Settings.
 *
 * 1. Native: Discord's 2025+ settings are a layout tree (ROOT > SECTION > SIDEBAR_ITEM >
 *    PANEL > CATEGORY > CUSTOM). A code patch on the resolver (`n.buildLayout().map(...)`,
 *    verified against the real client) lets us splice a "NexusCord" SECTION with one
 *    sidebar entry per page; each page is a CUSTOM node rendering our panel.
 * 2. Fallback: if that patch can't apply (Discord refactor), entries are injected into the
 *    settings sidebar DOM and the page renders over Discord's content column - still
 *    inside the settings screen, never a separate window.
 * 3. Ctrl+Alt+N / tray menu open Discord settings directly on the NexusCord page.
 */
import { h, onDomReady, setStyle } from "./dom";
import { isReactModule, React, SettingsLayoutTypes } from "./discord";
import { subscribe } from "./flux";
import { onLanguageChange, t, TranslationKey } from "./i18n";
import { Logger } from "./logger";
import { Native } from "./native";
import { Settings } from "./settings";
import { Icon, Icons, toast } from "./ui";
import { addCodePatch, filters, find, waitFor } from "./webpack";

const log = new Logger("SettingsUI");

export type PageId = "home" | "plugins" | "themes" | "appearance" | "privacy" | "performance" | "tools";

export interface PageDef {
    id: PageId;
    label: TranslationKey;
    icon: string;
    render: () => Node;
    searchTerms?: () => string[];
}

const pages = new Map<PageId, PageDef>();
export function registerPage(p: PageDef) {
    pages.set(p.id, p);
}
export const getPages = () => [...pages.values()];

const keyFor = (id: PageId) => `nexuscord_${id}_sidebar_item`;
const FALLBACK_TYPES = { ROOT: 0, SECTION: 1, SIDEBAR_ITEM: 2, PANEL: 3, CATEGORY: 5, CUSTOM: 19 };

// ---------------------------------------------------------------------------
// Page mounting (shared by native + fallback)
// ---------------------------------------------------------------------------
/** Mounts a page into `host`; re-renders on language change. Returns cleanup. */
export function mountPage(host: HTMLElement, id: PageId): () => void {
    const def = pages.get(id);
    if (!def) return () => {};
    let disposers: (() => void)[] = [];
    const root = h("div", { className: "nc-root nc-page", "data-nc-page": id });
    host.appendChild(root);
    const draw = () => {
        disposers.forEach(d => d());
        disposers = [];
        currentDisposers = disposers;
        try {
            root.replaceChildren(def.render());
        } catch (e) {
            log.error(`Page ${id} failed to render`, e);
            root.replaceChildren(h("div", { className: "nc-banner danger" }, t("common.error", { error: String((e as Error)?.message ?? e) })));
        }
    };
    draw();
    const offLang = onLanguageChange(draw);
    return () => {
        offLang();
        disposers.forEach(d => d());
        root.remove();
    };
}

/** Pages register cleanup (intervals, subscriptions) for the current render. */
let currentDisposers: (() => void)[] = [];
export function onPageCleanup(fn: () => void) {
    currentDisposers.push(fn);
}

// ---------------------------------------------------------------------------
// 1. Native layout integration
// ---------------------------------------------------------------------------
const reactCache = new Map<string, any>();

/** Error boundary so a broken NexusCord page can never take Discord's settings down with it. */
function boundary(): any {
    if (reactCache.has("$boundary")) return reactCache.get("$boundary");
    const R = (React as any).__nc_resolved ?? React;
    class NexusCordBoundary extends R.Component<any, { error: unknown }> {
        state = { error: null as unknown };
        static getDerivedStateFromError(error: unknown) {
            return { error };
        }
        componentDidCatch(error: unknown, info: any) {
            log.error("Settings page crashed", error, info?.componentStack ?? "");
        }
        render() {
            if (this.state.error) return React.createElement("div", { className: "nc-banner danger" }, t("common.error", { error: String((this.state.error as Error)?.message ?? this.state.error) }));
            return this.props.children;
        }
    }
    reactCache.set("$boundary", NexusCordBoundary);
    return NexusCordBoundary;
}

function pageComponent(id: PageId) {
    if (reactCache.has(id)) return reactCache.get(id);
    function NexusCordPageHost() {
        const ref = React.useRef(null);
        React.useEffect(() => (ref.current ? mountPage(ref.current, id) : undefined), []);
        return React.createElement("div", { ref, className: "nc-settings-host" });
    }
    const C = function NexusCordPage() {
        return React.createElement(boundary(), null, React.createElement(NexusCordPageHost));
    };
    reactCache.set(id, C);
    return C;
}

function iconComponent(svg: string) {
    const key = "icon:" + svg.length + svg.slice(-40);
    if (reactCache.has(key)) return reactCache.get(key);
    const C = function NexusCordIcon(props: any) {
        try {
            const el = React.createElement("span", { className: `nc-native-icon ${props?.className ?? ""}`, dangerouslySetInnerHTML: { __html: svg }, "aria-hidden": true });
            return React.isValidElement(el) ? el : null;
        } catch {
            return null;
        }
    };
    reactCache.set(key, C);
    return C;
}

/** Hooks Discord calls on our nodes must never throw and must always return a string. */
const safeTitle = (fn: () => string, fallback: string) => () => {
    try {
        const v = fn();
        return typeof v === "string" && v ? v : fallback;
    } catch {
        return fallback;
    }
};

function buildSection(): any {
    const T = (SettingsLayoutTypes as any).__nc_resolved ?? FALLBACK_TYPES;
    return {
        key: "nexuscord_section",
        type: T.SECTION,
        useTitle: () => "NexusCord",
        buildLayout: () =>
            getPages().map(p => ({
                key: keyFor(p.id),
                type: T.SIDEBAR_ITEM,
                useTitle: safeTitle(() => t(p.label), p.id),
                icon: iconComponent(p.icon),
                buildLayout: () => [
                    {
                        key: `nexuscord_${p.id}_panel`,
                        type: T.PANEL,
                        useTitle: safeTitle(() => (p.id === "home" ? "NexusCord" : t(p.label)), "NexusCord"),
                        buildLayout: () => [
                            {
                                key: `nexuscord_${p.id}_category`,
                                type: T.CATEGORY,
                                buildLayout: () => [
                                    {
                                        key: `nexuscord_${p.id}_custom`,
                                        type: T.CUSTOM,
                                        Component: pageComponent(p.id),
                                        useSearchTerms: () => {
                                            try {
                                                return ["NexusCord", t(p.label), ...(p.searchTerms?.() ?? [])].filter(x => typeof x === "string");
                                            } catch {
                                                return ["NexusCord"];
                                            }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }))
    };
}

const bridge = {
    patched: false,
    /** true once Discord's resolver called us at all (code patch applied) */
    resolverSeen: false,
    /** Called by Discord's patched layout resolver for EVERY node. */
    buildLayout(node: any): any[] {
        const layout = node.buildLayout();
        bridge.resolverSeen = true;
        try {
            if (node?.key !== "$Root" || !Array.isArray(layout) || layout.some(s => s?.key === "nexuscord_section")) return layout;
            // Our nodes render React elements: never inject them unless the React we found is
            // really React (a wrong module here crashes Discord's whole settings screen).
            if (!isReactModule(React)) {
                log.error("React not found - NexusCord settings section disabled to keep Discord stable");
                return layout;
            }
            bridge.patched = true;
            const loc = Settings.get().settingsLocation;
            let idx = loc === "top" ? 1 : loc === "bottom" ? layout.length : layout.findIndex(s => s?.key === "utility_section");
            if (idx < 0) idx = layout.length;
            layout.splice(idx, 0, buildSection());
        } catch (e) {
            log.error("Failed to inject NexusCord settings section", e);
        }
        return layout;
    }
};

function installNativePatch() {
    (window as any).$NexusCordSettings = bridge;
    addCodePatch({
        owner: "NexusCord:Settings",
        find: ".buildLayout().map(",
        replacement: [{ match: /([\w$]+)\.buildLayout\(\)\.map\(/, replace: "window.$NexusCordSettings.buildLayout($1).map(" }]
    });
}

// ---------------------------------------------------------------------------
// 2. DOM fallback (only if the native patch did not run)
// ---------------------------------------------------------------------------
let overlay: { host: HTMLElement; dispose: () => void } | null = null;

function closeOverlay() {
    overlay?.dispose();
    overlay?.host.remove();
    overlay = null;
    document.querySelectorAll(".nc-dom-sidebar-item.selected").forEach(e => e.classList.remove("selected"));
}

function findSettingsSidebar(): { sidebar: HTMLElement; content: HTMLElement } | null {
    const layers = document.querySelectorAll<HTMLElement>('[class*="layer"], [role="dialog"]');
    for (const layer of [...layers].reverse()) {
        const tabs = layer.querySelectorAll('[role="tab"], [class*="sidebarItem"], [class*="item"][class*="themed"]');
        if (tabs.length < 6) continue;
        // The sidebar is the common parent with most items
        const counts = new Map<HTMLElement, number>();
        tabs.forEach(t => {
            const p = t.parentElement as HTMLElement;
            if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
        });
        const sidebar = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!sidebar) continue;
        const content =
            layer.querySelector<HTMLElement>('[role="tabpanel"]') ??
            layer.querySelector<HTMLElement>('[class*="contentRegion"]') ??
            layer.querySelector<HTMLElement>("main");
        if (content) return { sidebar, content };
    }
    return null;
}

function injectDomFallback() {
    // Only when the resolver code patch never ran: appending into Discord's React-managed
    // sidebar is a last resort, never combined with the native section.
    if (bridge.patched || bridge.resolverSeen) return;
    const found = findSettingsSidebar();
    if (!found || found.sidebar.querySelector(".nc-dom-section")) return;
    const { sidebar, content } = found;
    const section = h(
        "div",
        { className: "nc-dom-section" },
        h("div", { className: "nc-dom-sidebar-header" }, "NexusCord"),
        getPages().map(p =>
            h(
                "div",
                {
                    className: "nc-dom-sidebar-item",
                    role: "tab",
                    tabindex: "0",
                    "data-nc-page": p.id,
                    onClick: (e: MouseEvent) => {
                        closeOverlay();
                        (e.currentTarget as HTMLElement).classList.add("selected");
                        const host = h("div", { className: "nc-overlay-host" });
                        const parent = content.parentElement ?? content;
                        if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
                        parent.appendChild(host);
                        overlay = { host, dispose: mountPage(host, p.id) };
                    }
                },
                h("span", { className: "nc-native-icon", html: p.icon }),
                t(p.label)
            )
        )
    );
    sidebar.appendChild(section);
    // Clicking any native entry closes our page
    sidebar.addEventListener("click", e => {
        if (!(e.target as Element).closest(".nc-dom-section")) closeOverlay();
    });
    log.info("Settings DOM fallback injected");
}

// ---------------------------------------------------------------------------
// 3. Opening settings on a NexusCord page
// ---------------------------------------------------------------------------
let openUserSettings: ((key?: string) => unknown) | null = null;

export function openSettings(page: PageId = "home"): void {
    openUserSettings ??= find(filters.byCode('type:"USER_SETTINGS_MODAL_OPEN"')) ?? null;
    if (openUserSettings) {
        try {
            openUserSettings(keyFor(page));
            // Fallback mode: click our injected entry once the settings layer exists
            setTimeout(() => {
                if (!bridge.patched && !bridge.resolverSeen) {
                    injectDomFallback();
                    document.querySelector<HTMLElement>(`.nc-dom-sidebar-item[data-nc-page="${page}"]`)?.click();
                }
            }, 600);
            return;
        } catch (e) {
            log.error("openUserSettings failed", e);
        }
    }
    toast(t("app.openFromSettings"), "info");
}

export function initSettingsUI(): void {
    setStyle("nc-settings-ui", ".nc-settings-host .nc-page{padding-top:4px}");
    installNativePatch();
    waitFor(filters.byCode('type:"USER_SETTINGS_MODAL_OPEN"'), fn => (openUserSettings = fn), "settings");

    // Fallback: whenever settings open and the native patch did not apply, inject DOM entries
    subscribe("USER_SETTINGS_MODAL_OPEN", () => {
        for (const delay of [300, 900, 1800]) setTimeout(injectDomFallback, delay);
    });
    subscribe("LAYER_POP", closeOverlay);
    onLanguageChange(() => document.querySelectorAll(".nc-dom-section").forEach(el => el.remove()));

    onDomReady(() =>
        document.addEventListener(
            "keydown",
            e => {
                if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === "KeyN") {
                    e.preventDefault();
                    e.stopPropagation();
                    openSettings("home");
                }
            },
            true
        )
    );
    Native.system?.onEvent?.((event: string) => {
        if (event === "open-settings") openSettings("home");
    });

    if (!Settings.get().welcomeShown) {
        setTimeout(() => {
            toast(t("app.welcome"), "success", 8000);
            Settings.update(s => void (s.welcomeShown = true));
        }, 8000);
    }
    void Icon;
    void Icons;
}

export const SettingsBridge = bridge;
