/*
 * Persistent per-feature data (bookmarks, message log, stats, snippets...) stored as
 * %appdata%\NexusCord\data\<key>.json by the main process. Loaded synchronously on
 * first use, saved debounced. Separate from settings.json so big data never slows
 * down settings writes.
 */
import { Native } from "./native";

export interface DataStore<T> {
    get(): T;
    update(mutator: (data: T) => void): void;
    set(data: T): void;
    subscribe(cb: (data: T) => void): () => void;
    flush(): void;
}

const stores = new Map<string, DataStore<any>>();

export function dataStore<T>(key: string, defaults: T, delay = 1000): DataStore<T> {
    const existing = stores.get(key);
    if (existing) return existing;

    let data: T | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listeners = new Set<(d: T) => void>();

    const load = (): T => {
        if (data !== undefined) return data;
        let raw: unknown;
        try {
            raw = Native.data.load(key);
        } catch {
            raw = undefined;
        }
        data = (raw && typeof raw === "object" ? { ...structuredClone(defaults), ...(raw as object) } : structuredClone(defaults)) as T;
        if (Array.isArray(defaults) && !Array.isArray(data)) data = structuredClone(defaults);
        return data;
    };
    const save = () => {
        timer = null;
        Native.data.save(key, data).catch(() => {});
    };
    const store: DataStore<T> = {
        get: load,
        update(mutator) {
            mutator(load());
            listeners.forEach(l => l(data!));
            if (timer) clearTimeout(timer);
            timer = setTimeout(save, delay);
        },
        set(next) {
            data = next;
            store.update(() => {});
        },
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        flush() {
            if (timer) {
                clearTimeout(timer);
                save();
            }
        }
    };
    stores.set(key, store);
    return store;
}

addEventListener("beforeunload", () => stores.forEach(s => s.flush()));
