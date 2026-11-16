import { FSWatcher, watch } from "fs";

/** Debounced recursive-safe directory watcher (fs.watch fires several events per save). */
export function watchDir(dir: string, cb: (file: string | null) => void, delay = 120): FSWatcher | null {
    let timer: NodeJS.Timeout | null = null;
    let lastFile: string | null = null;
    try {
        return watch(dir, (_event, file) => {
            lastFile = file ? file.toString() : null;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => cb(lastFile), delay);
        });
    } catch (e) {
        console.warn("[NexusCord] Cannot watch", dir, e);
        return null;
    }
}
