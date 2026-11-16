/*
 * Webpack hook & module finder.
 *
 * We hook `window.webpackChunkdiscord_app` before Discord's runtime boots and
 * push a fake chunk whose runtime callback hands us `__webpack_require__`.
 * From there we:
 *   - wrap the module factory registry (wreq.m) so new modules can be
 *     code-patched (Vencord-style find/replace) and observed as they load
 *   - expose resilient finders (findByProps, findByCode, findStore, ...)
 * Every search and patch is isolated in try/catch: a Discord update can make
 * a finder return `undefined`, but it can never crash the client.
 */
import { toFunctionExpression } from "../../shared/patchUtils";
import { Logger } from "./logger";

export { toFunctionExpression };

const log = new Logger("Webpack");

export type ModuleExports = any;
export type FilterFn = (mod: ModuleExports) => boolean;

export interface WebpackRequire {
    (id: PropertyKey): ModuleExports;
    m: Record<PropertyKey, Function>;
    c: Record<PropertyKey, { id: PropertyKey; loaded: boolean; exports: ModuleExports }>;
}

export interface CodePatch {
    owner: string;
    /** Substring(s) a module factory must contain to receive this patch */
    find: string | string[];
    replacement: { match: string | RegExp; replace: string | ((substring: string, ...groups: string[]) => string) }[];
}

/**
 * Discord ships MORE THAN ONE webpack runtime sharing `webpackChunkdiscord_app`
 * (e.g. the 12 MB main `web.js` app plus a small `libdiscore` runtime), so every
 * instance is tracked and searched. `wreq` is the biggest one (the main app).
 */
const instancesList: WebpackRequire[] = [];
/** Every webpack runtime Discord started (there are several). */
export const instances: readonly WebpackRequire[] = instancesList;
export let wreq: WebpackRequire | undefined;
export let cache: WebpackRequire["c"] | undefined;

function pickPrimary() {
    let best: WebpackRequire | undefined;
    let bestSize = -1;
    for (const r of instances) {
        const n = Object.keys(r.m).length;
        if (n > bestSize) {
            best = r;
            bestSize = n;
        }
    }
    wreq = best;
    cache = best?.c;
}

/** Iterates the module caches of every runtime. */
function* allCacheEntries(): Generator<{ loaded: boolean; exports: any }> {
    for (const r of instances) {
        const c = r.c;
        if (!c) continue;
        for (const id in c) yield c[id];
    }
}

const readyCallbacks: ((w: WebpackRequire) => void)[] = [];
const waiters: { filter: FilterFn; cb: (mod: any) => void; owner: string }[] = [];
const codePatches: CodePatch[] = [];
const WRAPPED = Symbol.for("NexusCord.wrappedFactory");
const CHUNK_KEY = "webpackChunkdiscord_app";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export const filters = {
    byProps:
        (...props: string[]): FilterFn =>
        m =>
            props.every(p => m?.[p] !== undefined),
    byPrototypeProps:
        (...props: string[]): FilterFn =>
        m =>
            typeof m === "function" && m.prototype && props.every(p => m.prototype[p] !== undefined),
    byCode:
        (...code: (string | RegExp)[]): FilterFn =>
        m => {
            if (typeof m !== "function") return false;
            let s: string;
            try {
                s = Function.prototype.toString.call(m);
            } catch {
                return false;
            }
            return code.every(c => (typeof c === "string" ? s.includes(c) : c.test(s)));
        },
    byStoreName:
        (name: string): FilterFn =>
        m =>
            m?._dispatchToken !== undefined && (m.getName?.() === name || m.constructor?.displayName === name),
    byComponentCode: (...code: (string | RegExp)[]): FilterFn => {
        const byCode = filters.byCode(...code);
        return m => {
            if (byCode(m)) return true;
            if (!m?.$$typeof) return false;
            if (m.type) return byCode(m.type) || byCode(m.type.render); // React.memo
            return byCode(m.render); // React.forwardRef
        };
    }
};

// ---------------------------------------------------------------------------
// Module iteration helpers
// ---------------------------------------------------------------------------
function isBlacklisted(exp: any): boolean {
    if (exp == null || exp === window || exp === document || exp === document.documentElement) return true;
    try {
        const tag = exp[Symbol.toStringTag];
        // Discord's intl message proxies answer to ANY key - they match every byProps filter
        if (tag === "DOMTokenList" || tag === "IntlMessagesProxy") return true;
    } catch {
        return true;
    }
    return false;
}

/** Yields every interesting value a module exposes (exports, default, named exports). */
function* candidates(exports: any): Generator<any> {
    if (isBlacklisted(exports)) return;
    yield exports;
    if (typeof exports !== "object" && typeof exports !== "function") return;
    if (exports.default !== undefined && !isBlacklisted(exports.default)) yield exports.default;
    // Minified ES module exports (e.g. exports.ZP, exports.Z) - cap to avoid huge objects
    let n = 0;
    for (const key in exports) {
        if (++n > 64) break;
        if (key === "default") continue;
        let v: any;
        try {
            v = exports[key];
        } catch {
            continue;
        }
        if (!isBlacklisted(v)) yield v;
    }
}

function testFilter(filter: FilterFn, value: any): boolean {
    try {
        return !!filter(value);
    } catch {
        return false;
    }
}

export function find(filter: FilterFn): ModuleExports | undefined {
    for (const mod of allCacheEntries()) {
        if (mod?.exports == null) continue;
        try {
            for (const c of candidates(mod.exports)) if (testFilter(filter, c)) return c;
        } catch { /* exotic exports */ }
    }
    return undefined;
}

export function findAll(filter: FilterFn): ModuleExports[] {
    const out: any[] = [];
    for (const mod of allCacheEntries()) {
        if (mod?.exports == null) continue;
        try {
            for (const c of candidates(mod.exports)) if (testFilter(filter, c)) out.push(c);
        } catch { /* ignore */ }
    }
    return out;
}

/** Finds a module whose top-level exports object contains a value matching `filter`; returns [exportsObject, key]. */
export function findExportKey(filter: FilterFn): [any, string] | undefined {
    for (const mod of allCacheEntries()) {
        const exp = mod?.exports;
        if (isBlacklisted(exp) || typeof exp !== "object") continue;
        for (const key in exp) {
            let v: any;
            try {
                v = exp[key];
            } catch {
                continue;
            }
            if (testFilter(filter, v)) return [exp, key];
        }
    }
    return undefined;
}

/**
 * Discord now exports many modules as separate minified functions (`pX`, `uh`, `Ak`...)
 * instead of `{ transitionTo, transitionToGuild }`. These helpers find such a module by
 * fingerprints in the functions' source and expose them under readable names. The
 * returned object reads/writes through to the real exports, so it can be patched.
 */
export type CodeMarkers = Record<string, string | RegExp>;
export function mapExports(exp: any, markers: CodeMarkers, required: string[] = Object.keys(markers).slice(0, 1)): any {
    if (isBlacklisted(exp) || typeof exp !== "object") return undefined;
    const names = Object.keys(markers);
    const map: Record<string, string> = {};
    for (const key in exp) {
        let v: any;
        try {
            v = exp[key];
        } catch {
            continue;
        }
        if (typeof v !== "function") continue;
        let src: string;
        try {
            src = Function.prototype.toString.call(v);
        } catch {
            continue;
        }
        for (const n of names) {
            const m = markers[n];
            if (!map[n] && (typeof m === "string" ? src.includes(m) : m.test(src))) map[n] = key;
        }
    }
    if (!required.every(n => map[n])) return undefined;
    const out: any = {};
    for (const [name, key] of Object.entries(map)) {
        Object.defineProperty(out, name, {
            enumerable: true,
            configurable: true,
            get: () => exp[key],
            set: v => {
                exp[key] = v;
            }
        });
    }
    return out;
}

export function findMapped(markers: CodeMarkers, required?: string[]): any {
    for (const mod of allCacheEntries()) {
        const r = mod?.exports != null ? mapExports(mod.exports, markers, required) : undefined;
        if (r) return r;
    }
    return undefined;
}

export function waitForMapped(markers: CodeMarkers, cb: (mod: any) => void, owner = "core", required?: string[]): () => void {
    const first = (required ?? Object.keys(markers).slice(0, 1))[0];
    const marker = markers[first];
    return waitFor(
        m => !!m && typeof m === "object" && Object.keys(m).length <= 40 && !!mapExports(m, { [first]: marker }),
        exp => {
            const mapped = mapExports(exp, markers, required);
            if (mapped) cb(mapped);
        },
        owner
    );
}

/**
 * Some Discord objects are frozen, so their methods can't be patched in place. This swaps
 * the module's export for a writable copy (exports are assignable, see makeExportsPatchable)
 * and returns the copy - code that reads the export at call time then uses the copy.
 */
export function unfreezeExport<T extends object>(obj: T): T {
    if (!obj || typeof obj !== "object") return obj;
    const locked =
        !Object.isExtensible(obj) ||
        Reflect.ownKeys(obj).some(k => {
            const d = Object.getOwnPropertyDescriptor(obj, k);
            return !!d && !d.configurable && ("value" in d ? !d.writable : !d.set);
        });
    if (!locked) return obj;
    const holder = findExportKey(m => m === obj);
    if (!holder) return obj;
    const copy = Object.create(Object.getPrototypeOf(obj));
    for (const key of Reflect.ownKeys(obj)) {
        const d = Object.getOwnPropertyDescriptor(obj, key)!;
        Object.defineProperty(copy, key, { ...d, configurable: true, ...("value" in d ? { writable: true } : {}) });
    }
    try {
        holder[0][holder[1]] = copy;
        return holder[0][holder[1]] === copy ? copy : obj;
    } catch {
        return obj;
    }
}

export const findByProps = (...props: string[]) => find(filters.byProps(...props));
export const findByCode = (...code: (string | RegExp)[]) => find(filters.byCode(...code));
export const findStore = (name: string) => find(filters.byStoreName(name));
export const findComponentByCode = (...code: (string | RegExp)[]) => find(filters.byComponentCode(...code));

/** Returns a Proxy that resolves the module on first use (and retries until found). */
export function lazy<T = any>(getter: () => T | undefined): T {
    let value: T | undefined;
    const resolve = () => (value ??= (() => {
        try {
            return getter();
        } catch {
            return undefined;
        }
    })());
    const bound = new Map<PropertyKey, { fn: Function; b: Function }>();
    return new Proxy(function () {} as any, {
        get: (_t, key) => {
            const v = resolve() as any;
            if (key === "__nc_resolved") return v;
            const r = v?.[key];
            if (typeof r !== "function") return r;
            // Classes (e.g. React.Component) must keep their prototype for `extends`
            if (r.prototype && Object.getOwnPropertyNames(r.prototype).length > 1) return r;
            // Stable identity across reads (bind() would create a new function every time)
            const c = bound.get(key);
            if (c && c.fn === r) return c.b;
            const b = r.bind(v);
            bound.set(key, { fn: r, b });
            return b;
        },
        has: (_t, key) => key in ((resolve() as any) ?? {}),
        apply: (_t, thisArg, args) => (resolve() as any)?.apply(thisArg, args),
        set: (_t, key, val) => {
            const v = resolve() as any;
            if (v) v[key] = val;
            return true;
        }
    }) as T;
}

export const findByPropsLazy = <T = any>(...props: string[]) => lazy<T>(() => findByProps(...props));
export const findStoreLazy = <T = any>(name: string) => lazy<T>(() => findStore(name));

/** Calls `cb` once a module matching `filter` exists (immediately if already loaded). */
export function waitFor(filter: FilterFn, cb: (mod: any) => void, owner = "core"): () => void {
    const existing = find(filter);
    if (existing !== undefined) {
        try {
            cb(existing);
        } catch (e) {
            log.error(`waitFor callback (${owner}) threw`, e);
        }
        return () => {};
    }
    const entry = { filter, cb, owner };
    waiters.push(entry);
    return () => {
        const i = waiters.indexOf(entry);
        if (i !== -1) waiters.splice(i, 1);
    };
}

export const waitForProps = (props: string[], cb: (m: any) => void, owner?: string) => waitFor(filters.byProps(...props), cb, owner);
export const waitForStore = (name: string, cb: (m: any) => void, owner?: string) => waitFor(filters.byStoreName(name), cb, owner);

export function onceReady(cb: (w: WebpackRequire) => void): void {
    if (wreq) cb(wreq);
    else readyCallbacks.push(cb);
}

// ---------------------------------------------------------------------------
// Code patches (string find/replace on module factories)
// ---------------------------------------------------------------------------
export function addCodePatch(patch: CodePatch): void {
    codePatches.push(patch);
    // Patch factories that are registered but not yet executed
    for (const r of instances) {
        for (const id in r.m) {
            if (!r.c?.[id]) r.m[id] = wrapFactory(id, unwrap(r.m[id]), true);
        }
    }
}

function unwrap(f: any): Function {
    return f?.[WRAPPED] ?? f;
}

function applyCodePatches(id: PropertyKey, factory: Function): Function {
    if (!codePatches.length) return factory;
    let code: string;
    try {
        code = Function.prototype.toString.call(factory);
    } catch {
        return factory;
    }
    let changed = false;
    for (const patch of codePatches) {
        const finds = Array.isArray(patch.find) ? patch.find : [patch.find];
        if (!finds.every(f => code.includes(f))) continue;
        let next = code;
        for (const r of patch.replacement) {
            const before = next;
            try {
                next = next.replace(r.match as any, r.replace as any);
            } catch (e) {
                log.error(`Code patch by ${patch.owner} failed on module ${String(id)}`, e);
                next = before;
            }
            if (next === before) log.warn(`Code patch by ${patch.owner} had no effect on module ${String(id)}`);
        }
        if (next !== code) {
            code = next;
            changed = true;
        }
    }
    if (!changed) return factory;
    try {
        // eslint-disable-next-line no-eval
        return (0, eval)(`0,${toFunctionExpression(code)}\n//# sourceURL=nexuscord-patched://WebpackModule${String(id)}`);
    } catch (e) {
        log.error(`Patched module ${String(id)} failed to compile - using the original`, e);
        return factory;
    }
}

function notifyWaiters(exports: any): void {
    if (!waiters.length || exports == null) return;
    for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        let hit: any;
        try {
            for (const c of candidates(exports)) {
                if (testFilter(w.filter, c)) {
                    hit = c;
                    break;
                }
            }
        } catch { /* ignore */ }
        if (hit === undefined) continue;
        waiters.splice(i, 1);
        try {
            w.cb(hit);
        } catch (e) {
            log.error(`waitFor callback (${w.owner}) threw`, e);
        }
    }
}

function wrapFactory(id: PropertyKey, original: Function, force = false): Function {
    if (!original || (!force && (original as any)[WRAPPED])) return original;
    original = unwrap(original);
    const patched = applyCodePatches(id, original);
    const wrapped = function (this: any, module: any, exports: any, require: any) {
        patched.call(this, module, exports, require);
        try {
            notifyWaiters(module.exports);
        } catch (e) {
            log.error("module observer failed", e);
        }
    };
    (wrapped as any)[WRAPPED] = original;
    wrapped.toString = () => Function.prototype.toString.call(original);
    return wrapped;
}

/**
 * Discord defines module exports as getter-only, non-configurable properties, so nothing
 * could ever patch them (BetterDiscord/Vencord plugins rely on that). Like both of those
 * mods, we redefine webpack's `d` helper so exports are configurable and assignable.
 */
function makeExportsPatchable(r: WebpackRequire): void {
    const own = Object.prototype.hasOwnProperty;
    try {
        (r as any).d = function (exports: any, getters?: Record<string, () => any>, values?: Record<string, any>) {
            if (getters) {
                for (const key in getters) {
                    if (!own.call(getters, key) || own.call(exports, key)) continue;
                    Object.defineProperty(exports, key, {
                        enumerable: true,
                        configurable: true,
                        get: getters[key],
                        set(v) {
                            Object.defineProperty(exports, key, { value: v, writable: true, configurable: true, enumerable: true });
                        }
                    });
                }
            }
            if (values) {
                for (const key in values) {
                    if (!own.call(values, key) || own.call(exports, key)) continue;
                    Object.defineProperty(exports, key, { value: values[key], writable: true, configurable: true, enumerable: true });
                }
            }
        };
    } catch (e) {
        log.warn("Could not make webpack exports patchable", e);
    }
}

function onWebpackRequire(r: WebpackRequire): void {
    if (!r?.m || instances.includes(r)) return;
    instancesList.push(r);
    makeExportsPatchable(r);
    const first = instances.length === 1;
    log.info(`Captured webpack runtime #${instances.length}`);

    for (const id in r.m) r.m[id] = wrapFactory(id, r.m[id]);
    // Factories registered from now on (lazy chunks) go through our proxy
    r.m = new Proxy(r.m, {
        set(target, id, factory) {
            target[id] = wrapFactory(id, factory);
            return true;
        }
    });

    pickPrimary();
    if (!first) return;
    for (const cb of readyCallbacks.splice(0)) {
        try {
            cb(r);
        } catch (e) {
            log.error("onceReady callback threw", e);
        }
    }
}

function hookChunkArray(chunk: any[]): void {
    if (!Array.isArray(chunk) || (chunk as any).__nc_hooked) return;
    Object.defineProperty(chunk, "__nc_hooked", { value: true });
    // The runtime invokes the 3rd element of a chunk with __webpack_require__.
    chunk.push([[Symbol("NexusCord")], {}, (r: WebpackRequire) => onWebpackRequire(r)]);
}

export function initWebpack(): void {
    const w = window as any;
    if (w[CHUNK_KEY]) {
        hookChunkArray(w[CHUNK_KEY]);
        return;
    }
    let value: any;
    Object.defineProperty(w, CHUNK_KEY, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: v => {
            value = v;
            try {
                hookChunkArray(v);
            } catch (e) {
                log.error("Failed to hook webpack chunk array", e);
            }
        }
    });
}

export const Webpack = {
    filters,
    find,
    findAll,
    findByProps,
    findByCode,
    findStore,
    findComponentByCode,
    findExportKey,
    findMapped,
    mapExports,
    findByPropsLazy,
    findStoreLazy,
    lazy,
    waitFor,
    waitForProps,
    waitForStore,
    onceReady,
    addCodePatch,
    get require() {
        pickPrimary();
        return wreq;
    },
    get cache() {
        pickPrimary();
        return cache;
    },
    get instances() {
        return instances.slice();
    }
};
