/*
 * Dynamic, Discord-synced localization.
 *  - English (en-US) is the base language and the fallback for every key.
 *  - "auto" mode follows Discord's active locale (LocaleStore + LOCALE_UPDATE
 *    Flux event + <html lang> observer as a last resort) in real time.
 *  - The user can force English or Italian from NexusCord settings.
 */
import { en, TranslationKey } from "../i18n/en";
import { it } from "../i18n/it";
import { subscribe } from "./flux";
import { Logger } from "./logger";
import { Settings } from "./settings";
import { findByProps, findStore, waitFor, filters } from "./webpack";

export type { TranslationKey };
export type Lang = "en" | "it";

const log = new Logger("i18n");
const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, it };
const listeners = new Set<(lang: Lang) => void>();

let discordLocale = "en-US";
let active: Lang = "en";

function normalize(locale: string | undefined | null): Lang {
    return locale && /^it(?:[-_]|$)/i.test(locale) ? "it" : "en";
}

/** Reads Discord's current locale from its internal stores (never throws). */
function readDiscordLocale(): string | undefined {
    try {
        const store = findStore("LocaleStore");
        if (typeof store?.locale === "string") return store.locale;
    } catch { /* not loaded yet */ }
    try {
        const i18nMod = findByProps("getLocale", "getLanguages");
        const l = i18nMod?.getLocale?.();
        if (typeof l === "string") return l;
    } catch { /* not loaded yet */ }
    try {
        const proto = findStore("UserSettingsProtoStore");
        const l = proto?.settings?.localization?.locale?.value;
        if (typeof l === "string") return l;
    } catch { /* not loaded yet */ }
    return document.documentElement.lang || undefined;
}

function recompute(): void {
    const pref = Settings.get().language;
    const next: Lang = pref === "auto" ? normalize(discordLocale) : pref;
    if (next === active) return;
    active = next;
    log.info(`Language -> ${active} (setting: ${pref}, Discord: ${discordLocale})`);
    for (const l of listeners) {
        try {
            l(active);
        } catch (e) {
            log.error("language listener threw", e);
        }
    }
}

function syncFromDiscord(locale?: string): void {
    const l = locale ?? readDiscordLocale();
    if (l && l !== discordLocale) {
        discordLocale = l;
        recompute();
    }
}

export function initI18n(): void {
    discordLocale = document.documentElement.lang || navigator.language || "en-US";
    recompute();

    // 1. LocaleStore as soon as webpack loads it
    waitFor(filters.byStoreName("LocaleStore"), store => {
        syncFromDiscord(store.locale);
        try {
            store.addChangeListener?.(() => syncFromDiscord(store.locale));
        } catch { /* older store API */ }
    }, "i18n");

    // 2. Flux events
    subscribe("LOCALE_UPDATE", a => syncFromDiscord(a.locale));
    subscribe("USER_SETTINGS_PROTO_UPDATE", () => setTimeout(() => syncFromDiscord(), 0));
    subscribe("CONNECTION_OPEN", () => setTimeout(() => syncFromDiscord(), 0));

    // 3. <html lang="..."> is updated by Discord whenever the locale changes
    new MutationObserver(() => syncFromDiscord(document.documentElement.lang || undefined)).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"]
    });

    Settings.subscribe(() => recompute());
}

/** Translate a key, interpolating `{placeholders}`. Falls back to English, then to the key itself. */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let s: string = dictionaries[active][key] ?? en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return s;
}

export function getLanguage(): Lang {
    return active;
}

export function getDiscordLocale(): string {
    return discordLocale;
}

/** Subscribe to language changes; returns an unsubscribe function. Usable with `reactive()`. */
export function onLanguageChange(cb: (lang: Lang) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export const I18n = { t, getLanguage, getDiscordLocale, onLanguageChange };
