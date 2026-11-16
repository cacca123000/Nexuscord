/*
 * BetterDiscord compatibility layer.
 *  - window.BdApi with the modern (1.9+) namespaced API, the bound
 *    `new BdApi("PluginName")` form and the most used legacy helpers
 *  - loader for external .plugin.js files with live reload
 *
 * BD plugins are full-trust code by design (exactly like in BetterDiscord):
 * only install plugins you trust. They do NOT get Node.js access here, which
 * is stricter than BetterDiscord.
 */
import type { AddonMeta } from "../../shared/meta";
import { setStyle } from "./dom";
import { t } from "./i18n";
import { Logger } from "./logger";
import { Native } from "./native";
import { Patcher } from "./patcher";
import { Settings } from "./settings";
import { ThemeEngine } from "./themeEngine";
import { confirmModal, copyText, openModal, toast } from "./ui";
import { isReactDom, isReactDomClient, isReactModule } from "./discord";
import * as Webpack from "./webpack";

const log = new Logger("BdCompat");

export interface ExternalPlugin {
    file: string;
    meta: AddonMeta;
    source: string;
    instance?: any;
    running: boolean;
    error?: string;
}

const plugins = new Map<string, ExternalPlugin>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// ---------------------------------------------------------------------------
// Data (persisted per plugin in plugins/<Name>.config.json)
// ---------------------------------------------------------------------------
const dataCache = new Map<string, Record<string, unknown>>();
function pluginData(name: string): Record<string, unknown> {
    let d = dataCache.get(name);
    if (!d) {
        d = (Native.plugins.loadData(name) as Record<string, unknown>) ?? {};
        dataCache.set(name, d);
    }
    return d;
}
const Data = {
    load: (plugin: string, key: string) => pluginData(plugin)[key],
    save: (plugin: string, key: string, value: unknown) => {
        const d = pluginData(plugin);
        d[key] = value;
        Native.plugins.saveData(plugin, d);
    },
    delete: (plugin: string, key: string) => {
        const d = pluginData(plugin);
        delete d[key];
        Native.plugins.saveData(plugin, d);
    }
};

// ---------------------------------------------------------------------------
// Webpack API (BD signature)
// ---------------------------------------------------------------------------
type BdFilter = (exports: any, module?: any, id?: string) => boolean;
interface GetModuleOpts {
    first?: boolean;
    defaultExport?: boolean;
    searchExports?: boolean;
}

const Filters = {
    byKeys: (...keys: string[]) => Webpack.filters.byProps(...keys),
    byProps: (...keys: string[]) => Webpack.filters.byProps(...keys),
    byPrototypeKeys: (...keys: string[]) => Webpack.filters.byPrototypeProps(...keys),
    byPrototypeFields: (...keys: string[]) => Webpack.filters.byPrototypeProps(...keys),
    byStrings: (...s: string[]) => Webpack.filters.byCode(...s),
    byRegex: (r: RegExp) => Webpack.filters.byCode(r),
    byStoreName: (name: string) => Webpack.filters.byStoreName(name),
    byDisplayName: (name: string) => (m: any) => m?.displayName === name,
    combine: (...fs: BdFilter[]) => (m: any, mod?: any, id?: string) => fs.every(f => f(m, mod, id))
};

function getModule(filter: BdFilter, opts: GetModuleOpts = {}) {
    const wrapped = (m: any) => {
        try {
            return !!filter(m);
        } catch {
            return false;
        }
    };
    if (opts.first === false) return Webpack.findAll(wrapped);
    return Webpack.find(wrapped);
}

const BdWebpack = {
    Filters,
    getModule,
    getModules: (filter: BdFilter) => Webpack.findAll(m => !!filter(m)),
    getBulk: (...queries: ({ filter: BdFilter } & GetModuleOpts)[]) => queries.map(q => getModule(q.filter, q)),
    getByKeys: (...keys: any[]) => Webpack.findByProps(...keys.filter(k => typeof k === "string")),
    getByPrototypeKeys: (...keys: any[]) => Webpack.find(Webpack.filters.byPrototypeProps(...keys.filter(k => typeof k === "string"))),
    getByStrings: (...s: any[]) => Webpack.findByCode(...s.filter(k => typeof k === "string")),
    getByRegex: (r: RegExp) => Webpack.findByCode(r),
    getStore: (name: string) => Webpack.findStore(name),
    getByDisplayName: (name: string) => Webpack.find(m => m?.displayName === name),
    waitForModule: (filter: BdFilter) => new Promise(res => Webpack.waitFor(m => !!filter(m), res, "BdApi")),
    get modules() {
        return Webpack.wreq?.m;
    },
    get require() {
        return Webpack.wreq;
    }
};

// ---------------------------------------------------------------------------
// React helpers (resolved lazily from Discord's webpack)
// ---------------------------------------------------------------------------
export const getReact = () => Webpack.find(isReactModule);
export const getReactDOM = () => Webpack.find(isReactDom) ?? Webpack.findByProps("createPortal", "flushSync");
const getReactDOMClient = () => Webpack.find(isReactDomClient);

/** Renders whatever a BD plugin's getSettingsPanel() returns into `host`. */
export function renderForeignPanel(host: HTMLElement, panel: unknown): () => void {
    if (panel == null) return () => {};
    if (panel instanceof Node) {
        host.appendChild(panel);
        return () => panel.parentNode === host && host.removeChild(panel);
    }
    if (typeof panel === "string") {
        host.innerHTML = panel;
        return () => (host.innerHTML = "");
    }
    const React = getReact();
    const client = getReactDOMClient();
    const element = typeof panel === "function" ? React?.createElement(panel) : panel;
    if (React && client?.createRoot && (element as any)?.$$typeof) {
        const root = client.createRoot(host);
        root.render(element);
        return () => root.unmount();
    }
    const legacy = getReactDOM();
    if (legacy?.render && (element as any)?.$$typeof) {
        legacy.render(element, host);
        return () => legacy.unmountComponentAtNode?.(host);
    }
    return () => {};
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------
function findInTree(tree: any, filter: (n: any) => boolean, { walkable = null as string[] | null, ignore = [] as string[] } = {}): any {
    const seen = new Set();
    const walk = (node: any, depth: number): any => {
        if (!node || typeof node !== "object" || seen.has(node) || depth > 100) return undefined;
        seen.add(node);
        try {
            if (filter(node)) return node;
        } catch { /* ignore */ }
        const keys = walkable ?? Object.keys(node);
        for (const k of keys) {
            if (ignore.includes(k)) continue;
            let v: any;
            try {
                v = node[k];
            } catch {
                continue;
            }
            const r = walk(v, depth + 1);
            if (r !== undefined) return r;
        }
        return undefined;
    };
    try {
        if (filter(tree)) return tree;
    } catch { /* ignore */ }
    return walk(tree, 0);
}

function getInternalInstance(el: Element): any {
    if (!el) return undefined;
    const key = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    return key ? (el as any)[key] : undefined;
}

const DOM = {
    addStyle(id: string, css?: string) {
        if (css === undefined) [id, css] = ["bd-style-" + Math.random().toString(36).slice(2), id];
        setStyle("bd-style-" + id.replace(/[^\w-]/g, "_"), css);
    },
    removeStyle(id: string) {
        setStyle("bd-style-" + id.replace(/[^\w-]/g, "_"), null);
    },
    createElement(tag: string, options: Record<string, any> = {}, ...children: (Node | string)[]) {
        const el = document.createElement(tag);
        const { className, id, target, ...rest } = options;
        if (className) el.className = className;
        if (id) el.id = id;
        Object.assign(el, rest);
        el.append(...children);
        if (target) document.querySelector(target)?.append(el);
        return el;
    },
    parseHTML(html: string, fragment = false) {
        const tpl = document.createElement("template");
        tpl.innerHTML = html;
        return fragment ? tpl.content : tpl.content.childNodes.length === 1 ? tpl.content.firstChild : tpl.content;
    },
    onRemoved(node: Node, cb: () => void) {
        const obs = new MutationObserver(() => {
            if (!node.isConnected) {
                obs.disconnect();
                cb();
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        return () => obs.disconnect();
    },
    animate(update: (progress: number) => void, duration: number) {
        const start = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            update(p);
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }
};

const UI = {
    showToast(content: string, opts: { type?: string; timeout?: number } = {}) {
        const kind = opts.type === "success" ? "success" : opts.type === "error" || opts.type === "danger" ? "error" : opts.type === "warning" ? "warn" : "info";
        toast(String(content), kind, opts.timeout ?? 3500);
    },
    alert(title: string, content: unknown) {
        const body = document.createElement("div");
        renderForeignPanel(body, content);
        openModal({ title, body });
    },
    showConfirmationModal(title: string, content: unknown, opts: { onConfirm?: () => void; onCancel?: () => void; confirmText?: string; danger?: boolean } = {}) {
        const body = document.createElement("div");
        renderForeignPanel(body, content);
        confirmModal(title, body, opts.confirmText, opts.danger ? "danger" : "info").then(ok => (ok ? opts.onConfirm?.() : opts.onCancel?.()));
    },
    showNotice(content: string) {
        toast(String(content), "info", 6000);
        return () => {};
    },
    createTooltip: () => ({ show() {}, hide() {} })
};

const unsupported = (api: string) => () => log.warn(t("bd.unsupported", { api }));

function boundPatcher(caller: string) {
    return {
        before: (mod: any, method: string, cb: any) => Patcher.before(caller, mod, method, cb),
        after: (mod: any, method: string, cb: any) => Patcher.after(caller, mod, method, cb),
        instead: (mod: any, method: string, cb: any) => Patcher.instead(caller, mod, method, cb),
        getPatchesByCaller: () => Patcher.getPatchesByCaller(caller),
        unpatchAll: () => Patcher.unpatchAll(caller)
    };
}

function addonApi(kind: "plugins" | "themes") {
    const isPlugins = kind === "plugins";
    const find = (idOrFile: string) =>
        isPlugins
            ? [...plugins.values()].find(p => p.meta.name === idOrFile || p.file === idOrFile)
            : ThemeEngine.getThemes().find(th => th.meta.name === idOrFile || th.file === idOrFile);
    const setEnabled = (id: string, on: boolean) => {
        const a = find(id);
        if (!a) return;
        if (isPlugins) setExternalEnabled(a.file, on);
        else ThemeEngine.setEnabled(a.file, on);
    };
    const enabled = (id: string) => {
        const a = find(id);
        return !!a && (isPlugins ? !!Settings.get().externalPlugins[a.file] : ThemeEngine.isEnabled(a.file));
    };
    return {
        get folder() {
            const paths = Native.settings.paths();
            return isPlugins ? paths.plugins : paths.themes;
        },
        isEnabled: enabled,
        enable: (id: string) => setEnabled(id, true),
        disable: (id: string) => setEnabled(id, false),
        toggle: (id: string) => setEnabled(id, !enabled(id)),
        get: (id: string) => {
            const a = find(id);
            return a && { ...a.meta, id: a.meta.name, filename: a.file, instance: (a as ExternalPlugin).instance };
        },
        getAll: () =>
            (isPlugins ? [...plugins.values()] : ThemeEngine.getThemes()).map(a => ({ ...a.meta, id: a.meta.name, filename: a.file })),
        reload: (id: string) => {
            const a = find(id);
            if (a && isPlugins) reloadExternal(a.file);
        }
    };
}

// ---------------------------------------------------------------------------
// BdApi object
// ---------------------------------------------------------------------------
function createBdApi() {
    const api: any = function BdApi(this: any, pluginName: string) {
        if (!(this instanceof BdApi)) return api;
        const name = String(pluginName);
        return Object.freeze({
            ...api,
            Patcher: boundPatcher(name),
            Data: {
                load: (key: string) => Data.load(name, key),
                save: (key: string, v: unknown) => Data.save(name, key, v),
                delete: (key: string) => Data.delete(name, key)
            },
            DOM: { ...DOM, addStyle: (id: string, css?: string) => DOM.addStyle(css === undefined ? name : `${name}-${id}`, css ?? id), removeStyle: (id?: string) => DOM.removeStyle(id ? `${name}-${id}` : name) }
        });
    };
    const BdApi = api;

    Object.assign(api, {
        version: "1.11.0",
        nexuscord: NEXUSCORD_VERSION,
        Patcher: {
            before: Patcher.before,
            after: Patcher.after,
            instead: Patcher.instead,
            unpatchAll: Patcher.unpatchAll,
            getPatchesByCaller: Patcher.getPatchesByCaller
        },
        Webpack: BdWebpack,
        Data,
        DOM,
        UI,
        Plugins: addonApi("plugins"),
        Themes: addonApi("themes"),
        Utils: {
            findInTree,
            getNestedValue: (obj: any, path: string) => path.split(".").reduce((o, k) => o?.[k], obj),
            debounce: (fn: (...a: any[]) => void, ms: number) => {
                let tm: ReturnType<typeof setTimeout>;
                return (...a: any[]) => {
                    clearTimeout(tm);
                    tm = setTimeout(() => fn(...a), ms);
                };
            },
            escapeHTML: (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`),
            className: (...args: any[]) =>
                args
                    .flatMap(a => (typeof a === "object" && a && !Array.isArray(a) ? Object.keys(a).filter(k => a[k]) : a))
                    .filter(Boolean)
                    .join(" "),
            extend: Object.assign
        },
        ReactUtils: {
            getInternalInstance,
            getOwnerInstance(el: Element) {
                for (let f = getInternalInstance(el); f; f = f.return) if (f.stateNode && !(f.stateNode instanceof Node)) return f.stateNode;
                return null;
            }
        },
        ContextMenu: { patch: () => (unsupported("ContextMenu.patch")(), () => {}), unpatch: () => {}, buildItem: () => null, buildMenu: () => null, open: unsupported("ContextMenu.open"), close: () => {} },
        Components: {},
        Net: { fetch: (url: string, init?: RequestInit) => fetch(url, init) },
        Logger: {
            log: (n: string, ...a: unknown[]) => console.log(`[${n}]`, ...a),
            info: (n: string, ...a: unknown[]) => console.info(`[${n}]`, ...a),
            warn: (n: string, ...a: unknown[]) => console.warn(`[${n}]`, ...a),
            error: (n: string, ...a: unknown[]) => console.error(`[${n}]`, ...a),
            stacktrace: (n: string, msg: string, e: unknown) => console.error(`[${n}] ${msg}`, e)
        },

        // ---- Legacy (pre-1.8) API --------------------------------------------
        findModule: (f: BdFilter) => getModule(f),
        findAllModules: (f: BdFilter) => getModule(f, { first: false }),
        findModuleByProps: (...p: string[]) => Webpack.findByProps(...p),
        findModuleByPrototypes: (...p: string[]) => Webpack.find(Webpack.filters.byPrototypeProps(...p)),
        findModuleByDisplayName: (n: string) => BdWebpack.getByDisplayName(n),
        injectCSS: (id: string, css: string) => DOM.addStyle(id, css),
        clearCSS: (id: string) => DOM.removeStyle(id),
        loadData: Data.load,
        saveData: Data.save,
        getData: Data.load,
        setData: Data.save,
        deleteData: Data.delete,
        showToast: (c: string, o?: any) => UI.showToast(c, o),
        alert: UI.alert,
        showConfirmationModal: UI.showConfirmationModal,
        getInternalInstance,
        suppressErrors: (fn: (...a: any[]) => any, label = "") => (...a: any[]) => {
            try {
                return fn(...a);
            } catch (e) {
                log.error(`Error suppressed (${label})`, e);
            }
        },
        testJSON: (s: string) => {
            try {
                return JSON.parse(s);
            } catch {
                return false;
            }
        },
        isSettingEnabled: () => false,
        monkeyPatch(what: any, methodName: string, opts: { before?: Function; after?: Function; instead?: Function; once?: boolean } = {}) {
            const caller = "bd-legacy";
            const unpatches: (() => void)[] = [];
            const data = (thisObject: any, args: any[], extra: object = {}) => ({ thisObject, methodArguments: args, ...extra });
            if (opts.instead)
                unpatches.push(Patcher.instead(caller, what, methodName, (self, args, orig) => opts.instead!(data(self, args, { originalMethod: orig, callOriginalMethod: () => orig(...args) }))));
            if (opts.before) unpatches.push(Patcher.before(caller, what, methodName, (self, args) => void opts.before!(data(self, args))));
            if (opts.after)
                unpatches.push(
                    Patcher.after(caller, what, methodName, (self, args, ret) => {
                        const d: any = data(self, args, { returnValue: ret });
                        opts.after!(d);
                        if (opts.once) unpatches.forEach(u => u());
                        return d.returnValue;
                    })
                );
            return () => unpatches.forEach(u => u());
        },
        copyText
    });

    Object.defineProperties(api, {
        React: { get: getReact, enumerable: true },
        ReactDOM: { get: getReactDOM, enumerable: true }
    });
    return api;
}

// ---------------------------------------------------------------------------
// External plugin loader
// ---------------------------------------------------------------------------
const pathShim = {
    sep: "\\",
    join: (...p: string[]) => p.filter(Boolean).join("\\").replace(/[\\/]+/g, "\\"),
    resolve: (...p: string[]) => pathShim.join(...p),
    basename: (p: string, ext?: string) => {
        const b = p.split(/[\\/]/).pop() ?? "";
        return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
    },
    dirname: (p: string) => p.split(/[\\/]/).slice(0, -1).join("\\"),
    extname: (p: string) => /\.[^.\\/]*$/.exec(p)?.[0] ?? ""
};

function fakeRequire(name: string): unknown {
    switch (name) {
        case "path":
            return pathShim;
        case "electron":
            return {
                shell: { openExternal: (u: string) => Native.shell.openExternal(u) },
                clipboard: { writeText: (s: string) => navigator.clipboard.writeText(s) }
            };
        case "events":
            return { EventEmitter: EventTarget };
        default:
            log.warn(t("bd.unsupported", { api: `require("${name}")` }));
            return new Proxy({}, { get: () => () => undefined });
    }
}

function evaluate(p: ExternalPlugin): void {
    const module: { exports: any } = { exports: {} };
    const ident = /^[A-Za-z_$][\w$]*$/.test(p.meta.name) ? p.meta.name : null;
    const legacyExport = ident
        ? `\n;if (!module.exports || (typeof module.exports === "object" && !Object.keys(module.exports).length)) { try { module.exports = ${ident}; } catch {} }`
        : "";
    const paths = Native.settings.paths();
    const fn = new Function(
        "module",
        "exports",
        "require",
        "BdApi",
        "global",
        "__filename",
        "__dirname",
        `${p.source}${legacyExport}\n//# sourceURL=betterdiscord://plugins/${encodeURIComponent(p.file)}`
    );
    fn.call(window, module, module.exports, fakeRequire, (window as any).BdApi, window, pathShim.join(paths.plugins, p.file), paths.plugins);
    let exp = module.exports;
    if (exp?.default) exp = exp.default;
    if (typeof exp !== "function") throw new Error("Plugin did not export a class/function");
    try {
        p.instance = new exp(p.meta);
    } catch {
        p.instance = exp(p.meta);
    }
    p.instance?.load?.();
}

let startGuard: ((p: ExternalPlugin) => boolean) | null = null;
/** Lets the plugin scanner veto starting a (high-risk) BetterDiscord plugin. */
export function setStartGuard(fn: ((p: ExternalPlugin) => boolean) | null) {
    startGuard = fn;
}

function startExternal(p: ExternalPlugin) {
    if (p.running || !p.instance) return;
    try {
        if (startGuard && !startGuard(p)) {
            p.error = t("plugin.pluginScanner.blockedShort");
            return;
        }
    } catch { /* guard failure never blocks */ }
    try {
        p.instance.start?.();
        p.running = true;
        p.error = undefined;
    } catch (e) {
        p.error = String((e as Error)?.message ?? e);
        log.error(`${p.meta.name} failed to start`, e);
        toast(t("bd.pluginFailed", { name: p.meta.name, error: p.error }), "error");
    }
}

function stopExternal(p: ExternalPlugin) {
    if (!p.running) return;
    try {
        p.instance?.stop?.();
    } catch (e) {
        log.error(`${p.meta.name} failed to stop`, e);
    }
    Patcher.unpatchAll(p.meta.name);
    p.running = false;
}

function load(raw: { file: string; meta: AddonMeta; source: string }) {
    const p: ExternalPlugin = { ...raw, running: false };
    try {
        evaluate(p);
    } catch (e) {
        p.error = String((e as Error)?.message ?? e);
        log.error(`Failed to load ${raw.file}`, e);
    }
    plugins.set(p.file, p);
    if (!p.error && Settings.get().externalPlugins[p.file]) startExternal(p);
}

export function setExternalEnabled(file: string, enabled: boolean) {
    const p = plugins.get(file);
    Settings.update(s => {
        s.externalPlugins[file] = enabled;
    });
    if (p) enabled ? startExternal(p) : stopExternal(p);
    emit();
}

async function reloadExternal(file: string | null) {
    const list: { file: string; meta: AddonMeta; source: string }[] = await Native.plugins.list();
    const targets = file ? list.filter(x => x.file === file) : list;
    // Removed files
    for (const [f, p] of plugins) {
        if (!list.some(x => x.file === f)) {
            stopExternal(p);
            plugins.delete(f);
        }
    }
    for (const raw of targets) {
        const old = plugins.get(raw.file);
        if (old && old.source === raw.source) continue;
        if (old) stopExternal(old);
        load(raw);
        if (old) toast(t("bd.pluginLoaded", { name: raw.meta.name }), "success", 1800);
    }
    emit();
}

export async function initBdCompat(): Promise<void> {
    const BdApi = createBdApi();
    Object.defineProperty(window, "BdApi", { value: BdApi, configurable: true, writable: false });
    try {
        await reloadExternal(null);
    } catch (e) {
        log.error("Failed to load external plugins", e);
    }
    Native.plugins.onChange(file => reloadExternal(file).catch(e => log.error("Plugin reload failed", e)));
}

export const BdCompat = {
    getPlugins: () => [...plugins.values()].sort((a, b) => a.meta.name.localeCompare(b.meta.name)),
    setEnabled: setExternalEnabled,
    isEnabled: (file: string) => !!Settings.get().externalPlugins[file],
    onChange(cb: () => void) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }
};
