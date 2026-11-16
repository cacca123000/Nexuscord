/** Persistent settings schema (stored in %appdata%\NexusCord\settings.json). */
export type LanguageSetting = "auto" | "en" | "it";

export interface PluginSettings {
    enabled: boolean;
    [option: string]: unknown;
}

export interface PerformanceSettings {
    /** V8 old-space cap in MB for every Chromium process (0 = Chromium default). */
    maxOldSpaceSize: number;
    processPerSite: boolean;
    gpuRasterization: boolean;
    disableBackgroundTimerThrottling: boolean;
}

export interface LinkShieldStats {
    phishingBlocked: number;
    spoofsBlocked: number;
    typosquatsFlagged: number;
    trackersStripped: number;
    linksUnshortened: number;
    executablesIntercepted: number;
}

export interface NexusSettings {
    language: LanguageSetting;
    plugins: Record<string, PluginSettings>;
    /** External BetterDiscord plugins (file name -> enabled). */
    externalPlugins: Record<string, boolean>;
    /** Installed themes (file name -> enabled). */
    themes: Record<string, boolean>;
    quickCssEnabled: boolean;
    performance: PerformanceSettings;
    linkShieldStats: LinkShieldStats;
    welcomeShown: boolean;
}

export const DEFAULT_SETTINGS: NexusSettings = {
    language: "auto",
    plugins: {},
    externalPlugins: {},
    themes: {},
    quickCssEnabled: true,
    performance: {
        maxOldSpaceSize: 512,
        processPerSite: true,
        gpuRasterization: true,
        disableBackgroundTimerThrottling: true
    },
    linkShieldStats: {
        phishingBlocked: 0,
        spoofsBlocked: 0,
        typosquatsFlagged: 0,
        trackersStripped: 0,
        linksUnshortened: 0,
        executablesIntercepted: 0
    },
    welcomeShown: false
};

/** Built-in plugins that are on by default (the rest are opt-in). */
export const DEFAULT_ENABLED_PLUGINS = ["noTrack", "linkShield", "lowRamOptimizer", "windowTweaks"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merges `value` over `defaults`, ignoring keys with mismatched types. */
export function mergeDefaults<T>(defaults: T, value: unknown): T {
    if (!isPlainObject(defaults) || !isPlainObject(value)) {
        return (value !== undefined && typeof value === typeof defaults ? value : defaults) as T;
    }
    const out: Record<string, unknown> = { ...defaults };
    for (const [k, v] of Object.entries(value)) {
        const d = (defaults as Record<string, unknown>)[k];
        if (d === undefined) out[k] = v;
        else if (isPlainObject(d)) out[k] = mergeDefaults(d, v);
        else if (typeof v === typeof d) out[k] = v;
    }
    return out as T;
}

export function normalizeSettings(raw: unknown): NexusSettings {
    return mergeDefaults(DEFAULT_SETTINGS, raw);
}

export function isPluginEnabled(s: NexusSettings, id: string): boolean {
    const p = s.plugins[id];
    return p ? !!p.enabled : DEFAULT_ENABLED_PLUGINS.includes(id);
}
