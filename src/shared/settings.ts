/** Persistent settings schema (stored in %appdata%\NexusCord\settings.json). */
export type LanguageSetting = "auto" | "en" | "it" | "es" | "fr" | "de" | "pt";

export interface PluginSettings {
    enabled: boolean;
    [option: string]: unknown;
}

export interface PerformanceSettings {
    /** V8 old-space cap in MB for every Chromium process (0 = Chromium default). */
    maxOldSpaceSize: number;
    processPerSite: boolean;
    gpuRasterization: boolean;
    /** Off by default: keeping timers running while minimized costs CPU/RAM. */
    disableBackgroundTimerThrottling: boolean;
    /** Reload the window when it is hidden and above this many MB (0 = off). */
    autoRestartMB: number;
    startMinimized: boolean;
    /** Extra Chromium/V8 memory flags: off, balanced (default) or aggressive */
    memorySaver: "off" | "balanced" | "aggressive";
    /** Windows: give RAM back to the system while Discord is minimized / in the tray */
    trimWhenHidden: boolean;
}

export interface WindowSettings {
    /** 0.3 - 1 */
    opacity: number;
    material: "none" | "acrylic" | "mica" | "tabbed";
    /** Absolute path of a custom .png/.ico copied into the data folder ("" = Discord's) */
    customIcon: string;
    customTrayIcon: string;
    splashColor: string;
    splashImage: string;
}

export interface SecuritySettings {
    appLock: boolean;
    pinHash: string;
    pinSalt: string;
    windowsHello: boolean;
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
    window: WindowSettings;
    security: SecuritySettings;
    updates: { autoCheck: boolean; lastCheck: number };
    sync: { gistId: string; lastSync: number };
    linkShieldStats: LinkShieldStats;
    welcomeShown: boolean;
    onboardingDone: boolean;
    /** Where the NexusCord section appears in Discord settings */
    settingsLocation: "top" | "aboveUtility" | "bottom";
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
        disableBackgroundTimerThrottling: false,
        autoRestartMB: 0,
        startMinimized: false,
        memorySaver: "balanced",
        trimWhenHidden: true
    },
    window: { opacity: 1, material: "none", customIcon: "", customTrayIcon: "", splashColor: "", splashImage: "" },
    security: { appLock: false, pinHash: "", pinSalt: "", windowsHello: false },
    updates: { autoCheck: true, lastCheck: 0 },
    sync: { gistId: "", lastSync: 0 },
    linkShieldStats: {
        phishingBlocked: 0,
        spoofsBlocked: 0,
        typosquatsFlagged: 0,
        trackersStripped: 0,
        linksUnshortened: 0,
        executablesIntercepted: 0
    },
    welcomeShown: false,
    onboardingDone: false,
    settingsLocation: "aboveUtility"
};

/** Built-in plugins that are on by default (the rest are opt-in). */
export const DEFAULT_ENABLED_PLUGINS = [
    "noTrack", "linkShield", "lowRamOptimizer", "windowTweaks", "betterCodeBlocks", "imageViewer", "clearUrlsOutgoing",
    "uploadPrivacy", "pluginScanner", "scamGuard", "accountAge", "copyTools", "safeModeGuard", "commandPalette", "declutter"
];

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
