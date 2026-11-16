import { isPluginEnabled, NexusSettings, normalizeSettings } from "../../shared/settings";
import { Native } from "./native";

type Listener = (s: NexusSettings) => void;

let current: NexusSettings = normalizeSettings(Native.settings.get());
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        Native.settings.set(current).catch(e => console.error("[NexusCord] settings save failed", e));
    }, 250);
}

export const Settings = {
    get: () => current,
    /** Mutate settings in place; listeners fire and the file is saved (debounced). */
    update(mutator: (s: NexusSettings) => void) {
        mutator(current);
        for (const l of listeners) {
            try {
                l(current);
            } catch (e) {
                console.error("[NexusCord] settings listener error", e);
            }
        }
        scheduleSave();
    },
    subscribe(l: Listener): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
    },
    isPluginEnabled: (id: string) => isPluginEnabled(current, id),
    replace(next: unknown) {
        current = normalizeSettings(next);
        Settings.update(() => {});
    }
};
