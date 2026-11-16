/*
 * Safe monkey-patcher with before / after / instead hooks.
 * - Every callback runs inside its own try/catch: a broken plugin can never
 *   break the patched Discord function.
 * - Multiple patches on the same method compose and can be removed in any order.
 */
import { Logger } from "./logger";

const log = new Logger("Patcher");

export type BeforeCallback = (thisObject: any, args: any[]) => any[] | void;
export type AfterCallback = (thisObject: any, args: any[], returnValue: any) => any;
export type InsteadCallback = (thisObject: any, args: any[], original: (...args: any[]) => any) => any;

interface PatchEntry {
    caller: string;
    type: "before" | "after" | "instead";
    callback: Function;
}

interface PatchRecord {
    object: any;
    method: PropertyKey;
    original: Function;
    wrapper: Function;
    patches: PatchEntry[];
}

const RECORD = Symbol.for("NexusCord.patchRecord");
const allPatches = new Set<PatchEntry & { unpatch: () => void }>();

function getRecord(object: any, method: PropertyKey): PatchRecord {
    const current = object[method];
    if (typeof current !== "function") throw new TypeError(`Cannot patch non-function ${String(method)}`);
    if (current[RECORD]) return current[RECORD];

    const record: PatchRecord = { object, method, original: current, wrapper: null!, patches: [] };

    const wrapper = function (this: any, ...args: any[]) {
        const self = this;
        const isNew = new.target !== undefined;
        const callOriginal = (a: any[]) =>
            isNew ? Reflect.construct(record.original, a, new.target) : record.original.apply(self, a);

        for (const p of record.patches) {
            if (p.type !== "before") continue;
            try {
                const res = p.callback(self, args);
                if (Array.isArray(res)) args = res;
            } catch (e) {
                log.error(`before-patch by ${p.caller} on ${String(method)} threw`, e);
            }
        }

        // Compose instead-patches: each receives the next one as "original"
        let invoke: (a: any[]) => any = callOriginal;
        for (const p of record.patches) {
            if (p.type !== "instead") continue;
            const next = invoke;
            invoke = (a: any[]) => {
                try {
                    return p.callback(self, a, (...na: any[]) => next(na.length ? na : a));
                } catch (e) {
                    log.error(`instead-patch by ${p.caller} on ${String(method)} threw; falling back`, e);
                    return next(a);
                }
            };
        }

        let ret = invoke(args);

        for (const p of record.patches) {
            if (p.type !== "after") continue;
            try {
                const res = p.callback(self, args, ret);
                if (res !== undefined) ret = res;
            } catch (e) {
                log.error(`after-patch by ${p.caller} on ${String(method)} threw`, e);
            }
        }
        return ret;
    };

    // Look like the original to Discord code and devtools
    Object.defineProperties(wrapper, {
        name: { value: current.name, configurable: true },
        length: { value: current.length, configurable: true },
        toString: { value: () => Function.prototype.toString.call(record.original), configurable: true, writable: true }
    });
    Object.assign(wrapper, current);
    if (current.prototype) wrapper.prototype = current.prototype;
    (wrapper as any)[RECORD] = record;
    record.wrapper = wrapper;

    const desc = Object.getOwnPropertyDescriptor(object, method);
    if (desc && !desc.writable && !desc.set && !desc.configurable) throw new TypeError(`${String(method)} is not writable`);
    if (desc && !desc.writable && desc.configurable && !desc.set) {
        Object.defineProperty(object, method, { ...desc, writable: true });
    }
    object[method] = wrapper;
    return record;
}

function addPatch(caller: string, type: PatchEntry["type"], object: any, method: PropertyKey, callback: Function): () => void {
    let record: PatchRecord;
    try {
        record = getRecord(object, method);
    } catch (e) {
        log.error(`${caller}: failed to patch ${String(method)}`, e);
        return () => {};
    }
    const entry = { caller, type, callback } as PatchEntry & { unpatch: () => void };
    record.patches.push(entry);

    let done = false;
    entry.unpatch = () => {
        if (done) return;
        done = true;
        allPatches.delete(entry);
        const i = record.patches.indexOf(entry);
        if (i !== -1) record.patches.splice(i, 1);
        // Restore the original only if nobody re-wrapped us in the meantime
        if (!record.patches.length && record.object[record.method] === record.wrapper) {
            record.object[record.method] = record.original;
        }
    };
    allPatches.add(entry);
    return entry.unpatch;
}

export const Patcher = {
    before: (caller: string, object: any, method: PropertyKey, cb: BeforeCallback) => addPatch(caller, "before", object, method, cb),
    after: (caller: string, object: any, method: PropertyKey, cb: AfterCallback) => addPatch(caller, "after", object, method, cb),
    instead: (caller: string, object: any, method: PropertyKey, cb: InsteadCallback) => addPatch(caller, "instead", object, method, cb),
    unpatchAll(caller: string) {
        for (const p of [...allPatches]) if (p.caller === caller) p.unpatch();
    },
    getPatchesByCaller(caller: string) {
        return [...allPatches].filter(p => p.caller === caller);
    },
    getOriginal<T extends Function>(fn: T): T {
        return ((fn as any)?.[RECORD]?.original ?? fn) as T;
    }
};
