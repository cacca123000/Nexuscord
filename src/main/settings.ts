import { readFileSync, renameSync, writeFileSync } from "fs";
import { NexusSettings, normalizeSettings } from "../shared/settings";
import { SETTINGS_FILE } from "./paths";

let current: NexusSettings | null = null;
const listeners = new Set<(s: NexusSettings) => void>();

export function getSettings(): NexusSettings {
    if (current) return current;
    try {
        current = normalizeSettings(JSON.parse(readFileSync(SETTINGS_FILE, "utf8")));
    } catch {
        current = normalizeSettings({});
    }
    return current;
}

export function setSettings(next: unknown): NexusSettings {
    current = normalizeSettings(next);
    try {
        // Atomic write so a crash mid-save never corrupts settings.json
        const tmp = SETTINGS_FILE + ".tmp";
        writeFileSync(tmp, JSON.stringify(current, null, 4));
        renameSync(tmp, SETTINGS_FILE);
    } catch (e) {
        console.error("[NexusCord] Failed to save settings:", e);
    }
    for (const l of listeners) {
        try {
            l(current);
        } catch (e) {
            console.error("[NexusCord] settings listener failed:", e);
        }
    }
    return current;
}

export function onSettingsChange(cb: (s: NexusSettings) => void): void {
    listeners.add(cb);
}
