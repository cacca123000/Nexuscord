/* Small keybind helper for plugin options of type "keybind" ("Ctrl+Shift+S"). */
import { onDomReady } from "./dom";

export function matchesKeybind(e: KeyboardEvent, combo: string): boolean {
    const parts = String(combo ?? "").split("+").map(p => p.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return false;
    const key = parts[parts.length - 1];
    const mods = new Set(parts.slice(0, -1));
    if (mods.has("ctrl") !== (e.ctrlKey || e.metaKey) || mods.has("shift") !== e.shiftKey || mods.has("alt") !== e.altKey) return false;
    const k = e.key.toLowerCase();
    return k === key || e.code.toLowerCase() === `key${key}` || e.code.toLowerCase() === key || (key === "space" && k === " ");
}

/** Listens for a keybind (read lazily, so option changes apply at once). Returns cleanup. */
export function onKeybind(combo: () => string, cb: (e: KeyboardEvent) => void): () => void {
    const handler = (e: KeyboardEvent) => {
        if (e.repeat || !matchesKeybind(e, combo())) return;
        e.preventDefault();
        e.stopPropagation();
        cb(e);
    };
    onDomReady(() => document.addEventListener("keydown", handler, true));
    return () => document.removeEventListener("keydown", handler, true);
}
