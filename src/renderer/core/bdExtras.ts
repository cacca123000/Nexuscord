/*
 * The larger pieces of BetterDiscord's API, kept apart from the loader:
 *  - Webpack: BD-exact getModule semantics (exports/module/id filters, searchExports,
 *    defaultExport, raw), bySource, getWithKey, getMangled, getBulkKeyed, Stores...
 *  - ContextMenu: real patching of Discord's React context menus (navId based, like BD)
 *  - Components / UI.buildSettingsPanel / showChangelogModal / Hooks / Utils extras
 * Everything resolves lazily so plugins can be loaded before Discord finished booting.
 */
import { isReactModule } from "./discord";
import { intercept } from "./flux";
import { Logger } from "./logger";
import { openModal, toast } from "./ui";
import * as Webpack from "./webpack";

const log = new Logger("BdApi");
const WRAPPED = Symbol.for("NexusCord.wrappedFactory");

const React = () => Webpack.find(isReactModule) as any;

// ---------------------------------------------------------------------------
// Webpack
// ---------------------------------------------------------------------------
export type BdFilter = (exports: any, module?: any, id?: string) => boolean;
export interface BdGetOpts {
    first?: boolean;
    defaultExport?: boolean;
    searchExports?: boolean;
    raw?: boolean;
    fatal?: boolean;
}

const isProxyLike = (v: any) => {
    try {
        return v != null && (typeof v === "object" || typeof v === "function") && v[Symbol.toStringTag] === "IntlMessagesProxy";
    } catch {
        return true;
    }
};
const skip = (v: any) => v == null || v === window || v === document || v === document.documentElement || isProxyLike(v);

function factorySource(id: string): string {
    for (const r of Webpack.instances) {
        const f = r.m?.[id];
        if (f) return Function.prototype.toString.call((f as any)[WRAPPED] ?? f);
    }
    return "";
}

function* modulesWithIds(): Generator<{ id: string; module: any }> {
    const seen = new Set<any>();
    for (const r of Webpack.instances) {
        for (const id in r.c) {
            const module = r.c[id];
            if (!module || seen.has(module)) continue;
            seen.add(module);
            yield { id, module };
        }
    }
}

function test(filter: BdFilter, exp: any, module: any, id: string): boolean {
    try {
        return !!filter(exp, module, id);
    } catch {
        return false;
    }
}

/**
 * The module's "default" export as BetterDiscord sees it. Discord's minifier names the
 * main export Z / ZP / A / Ay (or it's the only export) instead of `default`.
 */
function defaultOf(exports: any): any {
    if (exports == null || typeof exports !== "object") return undefined;
    for (const k of ["default", "Z", "ZP", "A", "Ay"]) {
        try {
            if (exports[k] !== undefined) return exports[k];
        } catch { /* getter threw */ }
    }
    const keys = Object.keys(exports);
    if (keys.length === 1) {
        try {
            return exports[keys[0]];
        } catch {
            return undefined;
        }
    }
    return undefined;
}

/** BetterDiscord's getModule, including its option semantics. */
export function bdGetModule(filter: BdFilter, opts: BdGetOpts = {}): any {
    const { first = true, defaultExport = true, searchExports = false, raw = false } = opts;
    const out: any[] = [];
    for (const { id, module } of modulesWithIds()) {
        const exports = module.exports;
        if (skip(exports)) continue;
        let hit: any;
        if (test(filter, exports, module, id)) hit = raw ? module : exports;
        else {
            const def = defaultOf(exports);
            if (def !== undefined && def !== exports && !skip(def) && test(filter, def, module, id)) hit = raw ? module : defaultExport ? def : exports;
        }
        if (hit === undefined && searchExports && typeof exports === "object") {
            for (const key in exports) {
                let v: any;
                try {
                    v = exports[key];
                } catch {
                    continue;
                }
                if (skip(v)) continue;
                if (test(filter, v, module, id)) {
                    hit = raw ? module : v;
                    break;
                }
            }
        }
        if (hit === undefined) continue;
        if (first) return hit;
        out.push(hit);
    }
    return first ? undefined : out;
}

const byKeys = (...keys: string[]): BdFilter => m => !!m && (typeof m === "object" || typeof m === "function") && keys.every(k => k in m && m[k] !== undefined);
const byPrototypeKeys = (...keys: string[]): BdFilter => m => typeof m === "function" && !!m.prototype && keys.every(k => k in m.prototype);
const byStrings = (...strings: string[]): BdFilter => m => {
    if (typeof m?.toString !== "function") return false;
    let s = "";
    try {
        s = m.toString([]);
    } catch {
        try {
            s = m.toString();
        } catch {
            return false;
        }
    }
    return strings.every(x => s.includes(x));
};
const bySource = (...needles: (string | RegExp)[]): BdFilter => (_e, _m, id) => {
    if (id == null) return false;
    const s = factorySource(String(id));
    return !!s && needles.every(n => (typeof n === "string" ? s.includes(n) : n.test(s)));
};
const byRegex = (re: RegExp): BdFilter => m => {
    try {
        return re.test(Function.prototype.toString.call(m));
    } catch {
        return false;
    }
};
const byStoreName = (name: string): BdFilter => m => m?._dispatchToken !== undefined && (m.getName?.() === name || m.constructor?.displayName === name);
const byDisplayName = (name: string): BdFilter => m => m?.displayName === name;
const byComponentType = (filter: BdFilter): BdFilter => m => {
    try {
        return filter(m) || (m?.$$typeof && (filter(m.type) || filter(m.render) || filter(m.type?.render)));
    } catch {
        return false;
    }
};

export const BdFilters = {
    byKeys,
    byProps: byKeys,
    byPrototypeKeys,
    byPrototypeFields: byPrototypeKeys,
    byStrings,
    bySource,
    byRegex,
    byStoreName,
    byDisplayName,
    byComponentType,
    combine:
        (...filters: BdFilter[]): BdFilter =>
        (e, m, id) =>
            filters.every(f => f(e, m, id)),
    not:
        (filter: BdFilter): BdFilter =>
        (e, m, id) =>
            !filter(e, m, id)
};

/** Splits trailing BD option objects off variadic finder arguments. */
function splitArgs(args: any[]): [any[], BdGetOpts] {
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last) && !(last instanceof RegExp)) return [args.slice(0, -1), last];
    return [args, {}];
}

function getWithKey(filter: BdFilter, opts: BdGetOpts = {}): any[] {
    const { target = null } = opts as any;
    for (const { id, module } of modulesWithIds()) {
        const exports = target ?? module.exports;
        if (skip(exports) || typeof exports !== "object") continue;
        for (const key in exports) {
            let v: any;
            try {
                v = exports[key];
            } catch {
                continue;
            }
            if (!skip(v) && test(filter, v, module, id)) return [exports, key];
        }
        if (target) break;
    }
    return [];
}

function getMangled(filter: BdFilter | string | RegExp, mappers: Record<string, BdFilter>, opts: BdGetOpts = {}): any {
    const f: BdFilter = typeof filter === "string" || filter instanceof RegExp ? bySource(filter) : filter;
    const module = bdGetModule(f, { ...opts, raw: true });
    const out: any = {};
    if (!module?.exports) return out;
    const exports = module.exports;
    for (const key in exports) {
        let v: any;
        try {
            v = exports[key];
        } catch {
            continue;
        }
        for (const [name, mapper] of Object.entries(mappers)) {
            if (name in out) continue;
            if (!test(mapper, v, module, "")) continue;
            Object.defineProperty(out, name, {
                enumerable: true,
                configurable: true,
                get: () => exports[key],
                set: val => (exports[key] = val)
            });
        }
    }
    Object.defineProperty(out, Symbol.for("betterdiscord.getMangled"), { value: exports });
    return out;
}

const storesProxy = new Proxy({} as Record<string, any>, {
    get: (_t, name) => (typeof name === "string" ? bdGetModule(byStoreName(name)) : undefined),
    ownKeys: () => {
        const names = new Set<string>();
        for (const s of Webpack.findAll(m => m?._dispatchToken !== undefined && typeof m.getName === "function")) {
            try {
                names.add(s.getName());
            } catch { /* ignore */ }
        }
        return [...names];
    },
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
});

function waitForModule(filter: BdFilter, opts: BdGetOpts & { signal?: AbortSignal } = {}): Promise<any> {
    const existing = bdGetModule(filter, opts);
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise(resolve => {
        const off = Webpack.waitFor(m => test(filter, m, undefined, ""), mod => resolve(mod), "BdApi");
        opts.signal?.addEventListener("abort", () => off());
    });
}

function bulkOne(q: { filter: BdFilter; all?: boolean; map?: Record<string, BdFilter> } & BdGetOpts): any {
    if (q.map) return getMangled(q.filter, q.map, q);
    return bdGetModule(q.filter, { ...q, first: q.all ? false : q.first });
}

export function createBdWebpack() {
    return {
        Filters: BdFilters,
        getModule: (filter: BdFilter, opts?: BdGetOpts) => bdGetModule(filter, opts),
        getModules: (filter: BdFilter, opts?: BdGetOpts) => bdGetModule(filter, { ...opts, first: false }),
        getBulk: (...queries: ({ filter: BdFilter; all?: boolean; map?: Record<string, BdFilter> } & BdGetOpts)[]) => queries.map(bulkOne),
        getBulkKeyed: (queries: Record<string, { filter: BdFilter; all?: boolean; map?: Record<string, BdFilter> } & BdGetOpts>) => Object.fromEntries(Object.entries(queries).map(([k, q]) => [k, bulkOne(q)])),
        getByKeys: (...a: any[]) => {
            const [keys, o] = splitArgs(a);
            return bdGetModule(byKeys(...keys), o);
        },
        getAllByKeys: (...a: any[]) => {
            const [keys, o] = splitArgs(a);
            return bdGetModule(byKeys(...keys), { ...o, first: false });
        },
        getByPrototypeKeys: (...a: any[]) => {
            const [keys, o] = splitArgs(a);
            return bdGetModule(byPrototypeKeys(...keys), o);
        },
        getAllByPrototypeKeys: (...a: any[]) => {
            const [keys, o] = splitArgs(a);
            return bdGetModule(byPrototypeKeys(...keys), { ...o, first: false });
        },
        getByStrings: (...a: any[]) => {
            const [s, o] = splitArgs(a);
            return bdGetModule(byStrings(...s), o);
        },
        getAllByStrings: (...a: any[]) => {
            const [s, o] = splitArgs(a);
            return bdGetModule(byStrings(...s), { ...o, first: false });
        },
        getBySource: (...a: any[]) => {
            const [s, o] = splitArgs(a);
            return bdGetModule(bySource(...s), o);
        },
        getAllBySource: (...a: any[]) => {
            const [s, o] = splitArgs(a);
            return bdGetModule(bySource(...s), { ...o, first: false });
        },
        getByRegex: (re: RegExp, o?: BdGetOpts) => bdGetModule(byRegex(re), o),
        getAllByRegex: (re: RegExp, o?: BdGetOpts) => bdGetModule(byRegex(re), { ...o, first: false }),
        getByDisplayName: (name: string, o?: BdGetOpts) => bdGetModule(byDisplayName(name), o),
        getStore: (name: string) => bdGetModule(byStoreName(name)),
        Stores: storesProxy,
        getById: (id: string | number, o: BdGetOpts = {}) => {
            for (const r of Webpack.instances) {
                const m = r.c?.[id as any];
                if (m) return o.raw ? m : m.exports;
            }
            try {
                const m = Webpack.wreq?.(id as any);
                return m;
            } catch {
                return undefined;
            }
        },
        getWithKey,
        getMangled,
        waitForModule,
        get modules() {
            return Webpack.wreq?.m;
        },
        get require() {
            return Webpack.wreq;
        }
    };
}

// ---------------------------------------------------------------------------
// Context menus (React level, navId based - the same model BetterDiscord uses)
// ---------------------------------------------------------------------------
type MenuCallback = (tree: any, props: any) => any;
const menuPatches = new Map<string, Set<MenuCallback>>();
const globalMenuPatches = new Set<MenuCallback>();
let menuParts: { Menu?: any; Item?: any; Group?: any; Separator?: any; Checkbox?: any; Radio?: any; Control?: any; Switch?: any } | null = null;

/** Discord's menu item "marker" components, discovered from the Menu's own source. */
function getMenuParts() {
    if (menuParts?.Item) return menuParts;
    const found = Webpack.findExportKey(Webpack.filters.byCode("Menu API only allows"));
    const parts: NonNullable<typeof menuParts> = {};
    if (found) {
        const [exp, key] = found;
        parts.Menu = exp[key];
        const src = Function.prototype.toString.call(parts.Menu);
        const keyFor = (kind: string) => new RegExp(`\\.type===\\w+\\.(\\w+)\\)(?:\\{[^}]{0,80}|return \\w+\\.push\\(\\{type:"${kind}")`).exec(src)?.[1];
        const sep = /\.type===\w+\.(\w+)\)return \w+\.push\(\{type:"separator"/.exec(src)?.[1];
        const group = /\.type===\w+\.(\w+)\)\{let \w+=\w+\(\w+\.props\.children\)/.exec(src)?.[1];
        const item = /\.type===\w+\.(\w+)\)return \w+\.push\(null!=\w+\.props\.render\?\{type:"customitem"/.exec(src)?.[1];
        const checkbox = keyFor("checkbox");
        const radio = keyFor("radio");
        const sw = keyFor("switch");
        const control = /\.type===\w+\.(\w+)\)return \w+\.push\(null!=\w+\.props\.control\?/.exec(src)?.[1];
        const host = item ? Webpack.find(m => m && typeof m === "object" && typeof m[item] === "function" && (!sep || typeof m[sep] === "function") && (!group || typeof m[group] === "function") && m !== exp) : null;
        if (host) {
            parts.Item = item && host[item];
            parts.Group = group && host[group];
            parts.Separator = sep && host[sep];
            parts.Checkbox = checkbox && host[checkbox];
            parts.Radio = radio && host[radio];
            parts.Switch = sw && host[sw];
            parts.Control = control && host[control];
        }
    }
    menuParts = parts;
    return parts;
}

const wrappedTypes = new WeakMap<any, any>();
function findNavId(tree: any): string | undefined {
    const seen = new Set();
    const walk = (n: any, depth: number): string | undefined => {
        if (!n || typeof n !== "object" || seen.has(n) || depth > 12) return undefined;
        seen.add(n);
        if (typeof n.props?.navId === "string") return n.props.navId;
        const c = n.props?.children;
        for (const child of Array.isArray(c) ? c : [c]) {
            const r = walk(child, depth + 1);
            if (r) return r;
        }
        return undefined;
    };
    return walk(tree, 0);
}

function runMenuPatches(res: any, props: any) {
    const navId = findNavId(res);
    if (!navId) return res;
    const cbs = [...(menuPatches.get(navId) ?? []), ...globalMenuPatches];
    if (!cbs.length) return res;
    // Make sure plugins can push into the Menu's children
    const menu = (function find(n: any, d: number): any {
        if (!n || typeof n !== "object" || d > 12) return null;
        if (n.props?.navId === navId) return n;
        const c = n.props?.children;
        for (const child of Array.isArray(c) ? c : [c]) {
            const r = find(child, d + 1);
            if (r) return r;
        }
        return null;
    })(res, 0);
    if (menu && !Array.isArray(menu.props.children)) {
        try {
            menu.props.children = [menu.props.children];
        } catch { /* frozen props: plugins will cope */ }
    }
    for (const cb of cbs) {
        try {
            const r = globalMenuPatches.has(cb) ? cb(res, { ...props, navId }) : cb(res, props);
            if (r !== undefined && r !== res && r?.$$typeof) res = r;
        } catch (e) {
            log.error(`Context menu patch for ${navId} threw`, e);
        }
    }
    return res;
}

function wrapMenuType(type: any): any {
    if (typeof type !== "function" || type.prototype?.render) return type;
    let w = wrappedTypes.get(type);
    if (!w) {
        w = function NexusCordPatchedMenu(this: any, props: any) {
            return runMenuPatches(type.call(this, props), props);
        };
        Object.assign(w, type);
        wrappedTypes.set(type, w);
    }
    return w;
}

function wrapRender(render: any) {
    if (typeof render !== "function") return render;
    return (props: any) => {
        const el = render(props);
        const R = React();
        if (!el || !R) return el;
        try {
            if (typeof el.type === "function") return R.createElement(wrapMenuType(el.type), { ...el.props, key: el.key });
            if (el.type?.$$typeof && typeof el.type.type === "function") return R.createElement({ ...el.type, type: wrapMenuType(el.type.type) }, { ...el.props, key: el.key });
            return runMenuPatches(el, el.props ?? props);
        } catch (e) {
            log.error("Context menu wrap failed", e);
            return el;
        }
    };
}

let menuHooked = false;
function hookMenus() {
    if (menuHooked) return;
    menuHooked = true;
    intercept("BdApi:ContextMenu", action => {
        if (action.type !== "CONTEXT_MENU_OPEN" || !action.contextMenu) return;
        if (!menuPatches.size && !globalMenuPatches.size) return;
        const cm = action.contextMenu;
        if (cm.render) cm.render = wrapRender(cm.render);
        if (cm.renderLazy) {
            const lazy = cm.renderLazy;
            cm.renderLazy = async (...a: any[]) => wrapRender(await lazy(...a));
        }
    });
}

let autoId = 0;
function buildItem(props: any): any {
    const R = React();
    const p = getMenuParts();
    if (!R || !p.Item) return null;
    const { type = "text", ...rest } = props ?? {};
    const id = rest.id ?? (String(rest.label ?? "item").toLowerCase().replace(/\W+/g, "-") || "item") + "-" + ++autoId;
    if (type === "separator") return R.createElement(p.Separator);
    if (type === "group" || type === "submenu" || Array.isArray(rest.items) || Array.isArray(rest.children)) {
        const kids = (rest.items ?? rest.children ?? []).map((c: any) => (c?.$$typeof ? c : buildItem(c)));
        if (type === "group") return R.createElement(p.Group, null, ...kids);
        return R.createElement(p.Item, { ...rest, id, action: rest.action ?? rest.onClick }, ...kids);
    }
    if ((type === "toggle" || type === "checkbox") && p.Checkbox) return R.createElement(p.Checkbox, { ...rest, id, checked: rest.checked ?? rest.active, action: rest.action ?? rest.onClick });
    if (type === "radio" && p.Radio) return R.createElement(p.Radio, { ...rest, id, checked: rest.checked ?? rest.active, action: rest.action ?? rest.onClick });
    if ((type === "control" || type === "custom") && p.Control) return R.createElement(p.Control, { ...rest, id });
    return R.createElement(p.Item, { ...rest, id, action: rest.action ?? rest.onClick });
}

function buildMenuChildren(setup: any[]): any[] {
    return (setup ?? []).map(s => (s?.$$typeof ? s : buildItem(s)));
}

let menuActions: { open?: any; close?: any } | null = null;
function getMenuActions() {
    if (menuActions?.open) return menuActions;
    const open = Webpack.findExportKey(Webpack.filters.byCode("renderLazy:"));
    const close = Webpack.findExportKey(Webpack.filters.byCode('"CONTEXT_MENU_CLOSE"'));
    menuActions = { open: open ? open[0][open[1]] : undefined, close: close ? close[0][close[1]] : undefined };
    return menuActions;
}

export const BdContextMenu = {
    patch(navId: string | string[], cb: MenuCallback) {
        hookMenus();
        const ids = Array.isArray(navId) ? navId : [navId];
        for (const id of ids) {
            if (!menuPatches.has(id)) menuPatches.set(id, new Set());
            menuPatches.get(id)!.add(cb);
        }
        return () => BdContextMenu.unpatch(navId, cb);
    },
    unpatch(navId: string | string[], cb: MenuCallback) {
        for (const id of Array.isArray(navId) ? navId : [navId]) menuPatches.get(id)?.delete(cb);
    },
    /** Called for every menu (BD >= 1.10 "global" patches); used by a few plugins */
    patchAll(cb: MenuCallback) {
        hookMenus();
        globalMenuPatches.add(cb);
        return () => globalMenuPatches.delete(cb);
    },
    buildItem,
    buildMenuChildren,
    buildMenu(setup: any[]) {
        return (props: any) => {
            const R = React();
            const p = getMenuParts();
            if (!R || !p.Menu) return null;
            return R.createElement(p.Menu, { navId: "betterdiscord-menu", onClose: () => getMenuActions().close?.(), ...props }, ...buildMenuChildren(setup));
        };
    },
    open(event: Event, menuComponent: any, config?: any) {
        const { open } = getMenuActions();
        if (!open) return toast("Context menu API unavailable", "error");
        return open(event, (props: any) => React()?.createElement(menuComponent, props), config ?? {});
    },
    close() {
        getMenuActions().close?.();
    },
    get Menu() {
        return getMenuParts().Menu;
    },
    get Item() {
        return getMenuParts().Item;
    },
    get Group() {
        return getMenuParts().Group;
    },
    get Separator() {
        return getMenuParts().Separator;
    },
    get CheckboxItem() {
        return getMenuParts().Checkbox;
    },
    get RadioItem() {
        return getMenuParts().Radio;
    },
    get ControlItem() {
        return getMenuParts().Control;
    }
};

// ---------------------------------------------------------------------------
// Components (rendered with Discord's React, styled with NexusCord's CSS)
// ---------------------------------------------------------------------------
let components: Record<string, any> | null = null;

export function getBdComponents(): Record<string, any> {
    if (components) return components;
    const R = React();
    if (!R) return {};
    const e = R.createElement;
    const cx = (...a: any[]) => a.filter(Boolean).join(" ");

    class ErrorBoundary extends R.Component {
        state = { error: null as unknown };
        static getDerivedStateFromError(error: unknown) {
            return { error };
        }
        componentDidCatch(error: unknown) {
            log.error("Plugin component crashed", error);
            (this.props as any).onError?.(error);
        }
        render() {
            const p = this.props as any;
            if (this.state.error) return p.fallback ?? (p.hideError ? null : e("div", { className: "nc-banner danger" }, String((this.state.error as Error)?.message ?? this.state.error)));
            return p.children;
        }
    }

    const Text = ({ tag = "div", className, children, size, color, strong, style }: any) =>
        e(tag, { className: cx("nc-bd-text", size && `nc-bd-text-${size}`, strong && "nc-bd-strong", className), style: { ...(color ? { color } : {}), ...style } }, children);
    const Button = ({ children, onClick, disabled, className, color = "brand", look, size, type = "button", style, ...rest }: any) =>
        e(
            "button",
            {
                type,
                disabled,
                onClick,
                style,
                className: cx("nc-btn", color === "red" || color === "danger" ? "danger" : color === "brand" || color === "primary" ? "primary" : "", look === "link" && "ghost", size === "small" && "small", className),
                ...(rest["aria-label"] ? { "aria-label": rest["aria-label"] } : {})
            },
            children
        );
    const Spinner = ({ className }: any) => e("div", { className: cx("nc-spinner", className), role: "progressbar" });
    const Flex = ({ children, direction = "horizontal", justify, align, wrap, gap, className, style }: any) =>
        e("div", { className, style: { display: "flex", flexDirection: direction === "vertical" ? "column" : "row", justifyContent: justify, alignItems: align, flexWrap: wrap ? "wrap" : undefined, gap, ...style } }, children);
    Flex.Direction = { VERTICAL: "vertical", HORIZONTAL: "horizontal", HORIZONTAL_REVERSE: "horizontal" };
    Flex.Justify = { START: "flex-start", END: "flex-end", CENTER: "center", BETWEEN: "space-between", AROUND: "space-around" };
    Flex.Align = { START: "flex-start", END: "flex-end", CENTER: "center", STRETCH: "stretch", BASELINE: "baseline" };
    Flex.Wrap = { WRAP: true, NO_WRAP: false };
    const Tooltip = ({ text, children }: any) => (typeof children === "function" ? children({ onMouseEnter() {}, onMouseLeave() {}, onClick() {}, onContextMenu() {}, "aria-label": typeof text === "string" ? text : undefined }) : e("span", { title: typeof text === "string" ? text : undefined }, children));

    function controlled<T>(value: T, onChange?: (v: T) => void): [T, (v: T) => void] {
        const [v, setV] = R.useState(value);
        R.useEffect(() => setV(value), [value]);
        return [v, (n: T) => (setV(n), onChange?.(n))];
    }
    const SwitchInput = ({ value, onChange, disabled, id }: any) => {
        const [v, set] = controlled(!!value, onChange);
        return e("label", { className: "nc-switch" }, e("input", { id, type: "checkbox", checked: v, disabled, onChange: (ev: any) => set(ev.target.checked) }), e("span"));
    };
    const TextInput = ({ value, onChange, placeholder, maxLength, disabled, type = "text", id }: any) => {
        const [v, set] = controlled(value ?? "", onChange);
        return e("input", { id, className: "nc-input", type, value: v, placeholder, maxLength, disabled, onChange: (ev: any) => set(ev.target.value), style: { width: "100%" } });
    };
    const NumberInput = ({ value, onChange, min, max, step = 1, disabled, id }: any) => {
        const [v, set] = controlled(Number(value ?? 0), onChange);
        return e("input", { id, className: "nc-input", type: "number", value: v, min, max, step, disabled, style: { width: 110 }, onChange: (ev: any) => Number.isFinite(+ev.target.value) && set(+ev.target.value) });
    };
    const DropdownInput = ({ value, options = [], onChange, disabled, id }: any) => {
        const [v, set] = controlled(value, onChange);
        const idx = options.findIndex((o: any) => o.value === v);
        return e("select", { id, className: "nc-select", disabled, value: String(idx), onChange: (ev: any) => set(options[+ev.target.value]?.value) }, options.map((o: any, i: number) => e("option", { key: i, value: String(i) }, o.label)));
    };
    const RadioInput = ({ value, options = [], onChange, name = "bd-radio-" + Math.random().toString(36).slice(2), disabled }: any) => {
        const [v, set] = controlled(value, onChange);
        return e(
            "div",
            { className: "nc-stack", role: "radiogroup" },
            options.map((o: any, i: number) =>
                e("label", { key: i, className: "nc-radio" }, e("input", { type: "radio", name, checked: o.value === v, disabled, onChange: () => set(o.value) }), e("span", null, o.name ?? o.label), o.desc ? e("small", null, o.desc) : null)
            )
        );
    };
    const SliderInput = ({ value, min = 0, max = 100, step = 1, onChange, units = "", disabled }: any) => {
        const [v, set] = controlled(Number(value ?? min), onChange);
        return e("span", { className: "nc-row-wrap" }, e("input", { type: "range", className: "nc-range", min, max, step, value: v, disabled, onChange: (ev: any) => set(+ev.target.value) }), e("span", { className: "nc-sub" }, `${v}${units}`));
    };
    const ColorInput = ({ value, onChange, disabled }: any) => {
        const toHex = (c: any) => (typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c ?? "#000000"));
        const [v, set] = controlled(toHex(value), onChange);
        return e("input", { type: "color", className: "nc-color", value: v, disabled, onChange: (ev: any) => set(ev.target.value) });
    };
    const KeybindInput = ({ value = [], onChange, disabled }: any) => {
        const [v, set] = controlled<string[]>(Array.isArray(value) ? value : [], onChange);
        return e("input", {
            className: "nc-input",
            readOnly: true,
            disabled,
            value: v.join(" + "),
            placeholder: "Press keys…",
            onKeyDown: (ev: any) => {
                ev.preventDefault();
                const keys = [ev.ctrlKey && "Control", ev.shiftKey && "Shift", ev.altKey && "Alt", ev.metaKey && "Meta", !["Control", "Shift", "Alt", "Meta"].includes(ev.key) && ev.key].filter(Boolean) as string[];
                set(keys);
            }
        });
    };
    const SettingItem = ({ id, name, note, inline = true, children }: any) =>
        e(
            "div",
            { className: cx("nc-row", !inline && "nc-row-block"), "data-setting": id },
            e("div", { className: "nc-row-label" }, name, note ? e("small", null, note) : null),
            e("div", { className: "nc-row-control" }, children)
        );
    const SettingGroup = ({ id, name, children, collapsible, shown = true }: any) => {
        const [open, setOpen] = R.useState(shown);
        return e(
            "div",
            { className: "nc-stack nc-bd-group", "data-group": id },
            name ? e("button", { type: "button", className: "nc-section-title nc-bd-group-title", onClick: () => collapsible && setOpen(!open) }, name) : null,
            open ? children : null
        );
    };

    components = {
        ErrorBoundary,
        Text,
        Button,
        Spinner,
        Flex,
        Tooltip,
        SwitchInput,
        TextInput,
        NumberInput,
        DropdownInput,
        RadioInput,
        SliderInput,
        ColorInput,
        KeybindInput,
        SettingItem,
        SettingGroup
    };
    return components;
}

/** UI.buildSettingsPanel({ settings, onChange }) -> React element (BD >= 1.10 API). */
export function buildSettingsPanel({ settings = [], onChange, onDrawerToggle, getDrawerState }: any): any {
    const R = React();
    const C = getBdComponents();
    if (!R || !C.SettingItem) return null;
    const e = R.createElement;
    const item = (s: any, group?: string): any => {
        if (s.type === "category") {
            return e(
                C.SettingGroup,
                {
                    key: s.id,
                    id: s.id,
                    name: s.name,
                    collapsible: s.collapsible,
                    shown: getDrawerState?.(s.id, s.shown ?? true) ?? s.shown ?? true,
                    onDrawerToggle: (v: boolean) => onDrawerToggle?.(s.id, v)
                },
                (s.settings ?? []).map((x: any) => item(x, s.id))
            );
        }
        const change = (v: unknown) => {
            s.onChange?.(v);
            onChange?.(group ?? null, s.id, v);
        };
        const control =
            s.type === "switch"
                ? e(C.SwitchInput, { value: s.value, disabled: s.disabled, onChange: change })
                : s.type === "number"
                  ? e(C.NumberInput, { value: s.value, min: s.min, max: s.max, step: s.step, disabled: s.disabled, onChange: change })
                  : s.type === "dropdown"
                    ? e(C.DropdownInput, { value: s.value, options: s.options, disabled: s.disabled, onChange: change })
                    : s.type === "radio"
                      ? e(C.RadioInput, { value: s.value, options: s.options, disabled: s.disabled, onChange: change })
                      : s.type === "slider"
                        ? e(C.SliderInput, { value: s.value, min: s.min, max: s.max, step: s.step, units: s.units, disabled: s.disabled, onChange: change })
                        : s.type === "color"
                          ? e(C.ColorInput, { value: s.value, disabled: s.disabled, onChange: change })
                          : s.type === "keybind"
                            ? e(C.KeybindInput, { value: s.value, disabled: s.disabled, onChange: change })
                            : s.type === "custom"
                              ? s.children
                              : e(C.TextInput, { value: s.value, placeholder: s.placeholder, maxLength: s.maxLength, disabled: s.disabled, onChange: change });
        return e(C.SettingItem, { key: s.id, id: s.id, name: s.name, note: s.note, inline: s.inline ?? !["radio", "text", "custom"].includes(s.type) }, control);
    };
    return e("div", { className: "nc-stack nc-bd-settings" }, settings.map((s: any) => item(s)));
}

/** UI.showChangelogModal({ title, subtitle, blurb, changes, footer }) */
export function showChangelogModal(opts: any = {}): void {
    const body = document.createElement("div");
    body.className = "nc-stack nc-changelog";
    const add = (tag: string, text: unknown, cls = "") => {
        if (text == null || text === "") return;
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        el.textContent = typeof text === "string" ? text : String((text as any)?.props?.children ?? "");
        body.appendChild(el);
    };
    add("p", opts.subtitle, "nc-sub");
    add("p", opts.blurb);
    for (const c of opts.changes ?? []) {
        add("div", c.title, `nc-section-title nc-change-${c.type ?? "changed"}`);
        const ul = document.createElement("ul");
        ul.className = "nc-change-list";
        for (const it of c.items ?? []) {
            const li = document.createElement("li");
            li.textContent = String(it).replace(/\*\*/g, "");
            ul.appendChild(li);
        }
        body.appendChild(ul);
    }
    if (typeof opts.footer === "string") add("p", opts.footer, "nc-sub");
    openModal({ title: String(opts.title ?? "Changelog"), body, medium: true });
}

// ---------------------------------------------------------------------------
// Hooks & Utils
// ---------------------------------------------------------------------------
export const BdHooks = {
    useStateFromStores(stores: any[], getter: () => any, deps: any[] = [], areEqual: (a: any, b: any) => boolean = Object.is) {
        const R = React();
        const [, force] = R.useReducer((x: number) => x + 1, 0);
        const value = getter();
        const ref = R.useRef(value);
        ref.current = value;
        R.useEffect(() => {
            const listener = () => {
                const next = getter();
                if (!areEqual(ref.current, next)) force();
            };
            const list = Array.isArray(stores) ? stores : [stores];
            list.forEach(s => s?.addChangeListener?.(listener));
            return () => list.forEach(s => s?.removeChangeListener?.(listener));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, deps);
        return value;
    },
    useForceUpdate() {
        const R = React();
        const [, f] = R.useReducer((x: number) => x + 1, 0);
        return f;
    },
    useData(pluginName: string, key: string) {
        return (window as any).BdApi?.Data?.load(pluginName, key);
    }
};

export class BdStore {
    private listeners = new Set<() => void>();
    initialize() {}
    addChangeListener(l: () => void) {
        this.listeners.add(l);
    }
    removeChangeListener(l: () => void) {
        this.listeners.delete(l);
    }
    emitChange() {
        this.listeners.forEach(l => {
            try {
                l();
            } catch (e) {
                log.error("Store listener threw", e);
            }
        });
    }
}

export const BdUtilsExtra = {
    mapObject: (obj: Record<string, any>, fn: (v: any, k: string) => any) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, fn(v, k)])),
    semverCompare(a: string, b: string) {
        const pa = String(a).split(/[.-]/).map(Number);
        const pb = String(b).split(/[.-]/).map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d) return d > 0 ? -1 : 1;
        }
        return 0;
    },
    Store: BdStore,
    forceLoad(id: string | number) {
        const r = Webpack.wreq as any;
        return r?.e ? r.e(id).catch(() => undefined) : Promise.resolve();
    },
    getReactInstance: (el: Element) => {
        const key = el && Object.keys(el).find(k => k.startsWith("__reactFiber$"));
        return key ? (el as any)[key] : undefined;
    }
};
