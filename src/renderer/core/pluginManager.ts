/*
 * Built-in plugin registry with live enable/disable and per-plugin options.
 */
import { t, TranslationKey } from "./i18n";
import { Logger } from "./logger";
import { Patcher } from "./patcher";
import { Settings } from "./settings";
import { toast } from "./ui";

const log = new Logger("Plugins");

export type PluginOption =
    | { type: "boolean"; label: TranslationKey; default: boolean; restartNeeded?: boolean }
    | { type: "select"; label: TranslationKey; default: string | number; options: { label: string | TranslationKey; value: string | number }[]; restartNeeded?: boolean }
    | { type: "number"; label: TranslationKey; default: number; min?: number; max?: number; restartNeeded?: boolean };

export interface NexusPlugin {
    id: string;
    name: TranslationKey;
    description: TranslationKey;
    authors?: string[];
    options?: Record<string, PluginOption>;
    /** Called when the plugin is enabled (and on startup). */
    start(): void;
    /** Must undo everything start() did. Patches made with `this.id` as caller are removed automatically. */
    stop(): void;
    /** Optional live reaction to option changes; otherwise the plugin is restarted. */
    onOptionChange?(key: string, value: unknown): void;
}

const registry = new Map<string, NexusPlugin>();
const running = new Set<string>();
const listeners = new Set<() => void>();

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

export function getPlugins(): NexusPlugin[] {
    return [...registry.values()];
}

export function isRunning(id: string): boolean {
    return running.has(id);
}

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
        log.info(`Started ${id}`);
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
    log.info(`Stopped ${id}`);
    emit();
    return true;
}

export function setPluginEnabled(id: string, enabled: boolean): void {
    Settings.update(s => {
        s.plugins[id] = { ...(s.plugins[id] ?? {}), enabled };
    });
    if (enabled) startPlugin(id);
    else stopPlugin(id);
}

export function startEnabledPlugins(): void {
    for (const p of registry.values()) {
        if (Settings.isPluginEnabled(p.id)) startPlugin(p.id);
    }
}

export function onPluginsChange(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export const PluginManager = {
    getPlugins,
    isRunning,
    startPlugin,
    stopPlugin,
    setPluginEnabled,
    getOption,
    setOption,
    onPluginsChange
};
