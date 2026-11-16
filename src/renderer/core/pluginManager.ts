/*
 * Built-in plugin registry with live enable/disable, typed options, categories and
 * safe mode (only `required` plugins start when Discord was started in safe mode).
 */
import { t, TranslationKey } from "./i18n";
import { Logger } from "./logger";
import { Native } from "./native";
import { Patcher } from "./patcher";
import { Settings } from "./settings";
import { toast } from "./ui";

const log = new Logger("Plugins");

export type PluginCategory = "appearance" | "privacy" | "chat" | "media" | "performance" | "utility" | "fun";
export const CATEGORIES: { id: PluginCategory; label: TranslationKey; icon: string }[] = [
    { id: "appearance", label: "cat.appearance", icon: "🎨" },
    { id: "privacy", label: "cat.privacy", icon: "🛡️" },
    { id: "chat", label: "cat.chat", icon: "💬" },
    { id: "media", label: "cat.media", icon: "🎧" },
    { id: "performance", label: "cat.performance", icon: "⚡" },
    { id: "utility", label: "cat.utility", icon: "🔧" },
    { id: "fun", label: "cat.fun", icon: "🎉" }
];

interface OptionBase {
    label: TranslationKey;
    hint?: TranslationKey;
    restartNeeded?: boolean;
}
export type PluginOption =
    | (OptionBase & { type: "boolean"; default: boolean })
    | (OptionBase & { type: "select"; default: string | number; options: { label: string; value: string | number }[] })
    | (OptionBase & { type: "number"; default: number; min?: number; max?: number; step?: number })
    | (OptionBase & { type: "slider"; default: number; min: number; max: number; step?: number; unit?: string })
    | (OptionBase & { type: "string"; default: string; placeholder?: string })
    | (OptionBase & { type: "text"; default: string; placeholder?: string })
    | (OptionBase & { type: "color"; default: string })
    | (OptionBase & { type: "keybind"; default: string });

export interface NexusPlugin {
    id: string;
    name: TranslationKey;
    description: TranslationKey;
    category: PluginCategory;
    authors?: string[];
    /** Always on (core functionality); hidden toggle */
    required?: boolean;
    /** Marks plugins that act on your account in ways Discord may dislike */
    tosRisk?: boolean;
    options?: Record<string, PluginOption>;
    /** Extra settings UI rendered under the generated options in the config modal */
    settingsPanel?: () => Node;
    start(): void;
    stop(): void;
    onOptionChange?(key: string, value: unknown): void;
}

const registry = new Map<string, NexusPlugin>();
const running = new Set<string>();
const listeners = new Set<() => void>();
let safeMode = false;
try {
    safeMode = Native.system?.safeMode?.() ?? false;
} catch { /* old preload */ }

function emit() {
    for (const l of listeners) l();
}

export function definePlugin<T extends NexusPlugin>(p: T): T {
    return p;
}

export function registerPlugin(p: NexusPlugin): void {
    if (registry.has(p.id)) throw new Error(`Duplicate plugin id ${p.id}`);
    registry.set(p.id, p);
}

export const getPlugins = () => [...registry.values()];
export const getPlugin = (id: string) => registry.get(id);
export const isRunning = (id: string) => running.has(id);
export const isSafeMode = () => safeMode;
export const isEnabled = (id: string) => registry.get(id)?.required || Settings.isPluginEnabled(id);

export function getOption<T = unknown>(pluginId: string, key: string): T {
    const p = registry.get(pluginId);
    const stored = Settings.get().plugins[pluginId]?.[key];
    return (stored !== undefined ? stored : p?.options?.[key]?.default) as T;
}

export function setOption(pluginId: string, key: string, value: unknown): void {
    Settings.update(s => {
        s.plugins[pluginId] ??= { enabled: Settings.isPluginEnabled(pluginId) };
        s.plugins[pluginId][key] = value;
    });
    const p = registry.get(pluginId);
    if (p && running.has(pluginId)) {
        if (p.onOptionChange) {
            try {
                p.onOptionChange(key, value);
            } catch (e) {
                log.error(`${pluginId}.onOptionChange threw`, e);
            }
        } else if (!p.options?.[key]?.restartNeeded) {
            stopPlugin(pluginId);
            startPlugin(pluginId);
        }
    }
    emit();
}

export function startPlugin(id: string): boolean {
    const p = registry.get(id);
    if (!p || running.has(id)) return false;
    try {
        p.start();
        running.add(id);
        return true;
    } catch (e) {
        log.error(`Failed to start ${id}`, e);
        Patcher.unpatchAll(id);
        toast(t("plugins.startFailed", { name: t(p.name), error: String((e as Error)?.message ?? e) }), "error");
        return false;
    } finally {
        emit();
    }
}

export function stopPlugin(id: string): boolean {
    const p = registry.get(id);
    if (!p || !running.has(id)) return false;
    try {
        p.stop();
    } catch (e) {
        log.error(`Failed to stop ${id} cleanly`, e);
    }
    Patcher.unpatchAll(id);
    running.delete(id);
    emit();
    return true;
}

export function setPluginEnabled(id: string, enabled: boolean): void {
    if (registry.get(id)?.required) return;
    Settings.update(s => {
        s.plugins[id] = { ...(s.plugins[id] ?? {}), enabled };
    });
    if (enabled) startPlugin(id);
    else stopPlugin(id);
}

export function startEnabledPlugins(): void {
    const started: string[] = [];
    for (const p of registry.values()) {
        if (safeMode && !p.required) continue;
        if (isEnabled(p.id) && startPlugin(p.id)) started.push(p.id);
    }
    log.info(`Started ${started.length} plugins${safeMode ? " (SAFE MODE)" : ""}`);
}

export function onPluginsChange(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export const PluginManager = {
    getPlugins,
    getPlugin,
    isRunning,
    isEnabled,
    startPlugin,
    stopPlugin,
    setPluginEnabled,
    getOption,
    setOption,
    onPluginsChange,
    isSafeMode
};
