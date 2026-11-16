/*
 * Theme engine: BetterDiscord .theme.css support + QuickCSS.
 * The main process watches %appdata%\NexusCord\themes with fs.watch and
 * pushes the new list over IPC; we diff and hot-swap only what changed.
 */
import type { AddonMeta } from "../../shared/meta";
import { setStyle } from "./dom";
import { t } from "./i18n";
import { Logger } from "./logger";
import { Native } from "./native";
import { Settings } from "./settings";
import { toast } from "./ui";

const log = new Logger("Themes");

export interface ThemeInfo {
    file: string;
    meta: AddonMeta;
    source: string;
    error?: string;
}

let themes: ThemeInfo[] = [];
let quickCss = "";
const listeners = new Set<() => void>();

const styleId = (file: string) => "nc-theme-" + file.replace(/[^\w-]/g, "_");

function emit() {
    for (const l of listeners) l();
}

function apply(): void {
    const enabled = Settings.get().themes;
    for (const th of themes) setStyle(styleId(th.file), enabled[th.file] ? th.source : null);
    // QuickCSS always goes last so it can override themes
    setStyle("nc-quickcss", Settings.get().quickCssEnabled && quickCss.trim() ? quickCss : null);
}

function setThemes(next: ThemeInfo[], announce: boolean) {
    const prev = new Map(themes.map(th => [th.file, th.source]));
    // Remove styles of themes that disappeared from disk
    for (const old of themes) if (!next.some(n => n.file === old.file)) setStyle(styleId(old.file), null);
    themes = next.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
    if (announce) {
        for (const th of themes) {
            const before = prev.get(th.file);
            if (before !== undefined && before !== th.source && Settings.get().themes[th.file]) {
                toast(t("themes.reloaded", { name: th.meta.name }), "success", 1800);
            }
        }
    }
    apply();
    emit();
}

export async function initThemeEngine(): Promise<void> {
    try {
        setThemes(await Native.themes.list(), false);
        quickCss = await Native.themes.getQuickCss();
        apply();
    } catch (e) {
        log.error("Failed to load themes", e);
    }
    Native.themes.onChange(list => setThemes(list as ThemeInfo[], true));
    Native.themes.onQuickCssChange(css => {
        if (css === quickCss) return;
        quickCss = css;
        apply();
        emit();
    });
    // Keep our styles last even if Discord appends <style> tags later
    Settings.subscribe(() => apply());
}

export const ThemeEngine = {
    getThemes: () => themes,
    getQuickCss: () => quickCss,
    isEnabled: (file: string) => !!Settings.get().themes[file],
    setEnabled(file: string, enabled: boolean) {
        Settings.update(s => {
            s.themes[file] = enabled;
        });
        apply();
        emit();
    },
    setQuickCss(css: string) {
        quickCss = css;
        apply();
        Native.themes.setQuickCss(css).catch(e => log.error("QuickCSS save failed", e));
    },
    setQuickCssEnabled(enabled: boolean) {
        Settings.update(s => {
            s.quickCssEnabled = enabled;
        });
        apply();
    },
    reapply: apply,
    onChange(cb: () => void): () => void {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }
};
