import { mkdirSync } from "fs";
import { join } from "path";

/** %appdata%\NexusCord (or the platform equivalent) - all user data lives here. */
export function getDataDir(): string {
    if (process.env.NEXUSCORD_DATA_DIR) return process.env.NEXUSCORD_DATA_DIR;
    const base =
        process.env.APPDATA ||
        (process.platform === "darwin"
            ? join(process.env.HOME || "", "Library", "Application Support")
            : process.env.XDG_CONFIG_HOME || join(process.env.HOME || "", ".config"));
    return join(base, "NexusCord");
}

export const DATA_DIR = getDataDir();
export const THEMES_DIR = join(DATA_DIR, "themes");
export const PLUGINS_DIR = join(DATA_DIR, "plugins");
export const CACHE_DIR = join(DATA_DIR, "cache");
export const SETTINGS_FILE = join(DATA_DIR, "settings.json");
export const QUICKCSS_FILE = join(DATA_DIR, "quickcss.css");

export function ensureDataDirs(): void {
    for (const dir of [DATA_DIR, THEMES_DIR, PLUGINS_DIR, CACHE_DIR]) {
        try {
            mkdirSync(dir, { recursive: true });
        } catch { /* best effort */ }
    }
}
