/*
 * NexusCord renderer entry point - runs in Discord's main world, injected by
 * the preload BEFORE Discord's own scripts so the webpack hook wins the race.
 */
import { BdCompat, initBdCompat } from "./core/bdCompat";
import { setStyle, onDomReady } from "./core/dom";
import { Flux, initFlux, subscribe } from "./core/flux";
import { I18n, initI18n } from "./core/i18n";
import { installCrashReporter, Logger } from "./core/logger";
import { Native } from "./core/native";
import { Patcher } from "./core/patcher";
import { isSafeMode, PluginManager, registerPlugin, startEnabledPlugins } from "./core/pluginManager";
import { Settings } from "./core/settings";
import * as Discord from "./core/discord";
import { getLastTarget, registerMenuItem } from "./core/contextMenu";
import { registerPages } from "./core/pages";
import { mountPage, initSettingsUI, openSettings } from "./core/settingsUI";
import { openOnboarding } from "./core/onboarding";
import { initThemeEngine, ThemeEngine } from "./core/themeEngine";
import { toast } from "./core/ui";
import { initWebpack, Webpack } from "./core/webpack";
import { builtInPlugins } from "./plugins";
import coreCss from "./styles/nexuscord.css";

const log = new Logger("Core");

function safe(name: string, fn: () => unknown) {
    try {
        const r = fn();
        if (r instanceof Promise) r.catch(e => log.error(`${name} failed`, e));
    } catch (e) {
        log.error(`${name} failed`, e);
    }
}

function boot() {
    if ((window as any).NexusCord) return; // injected twice (e.g. reload) - never double-hook
    if (window.top !== window) return; // only Discord's main frame, never iframes
    const started = performance.now();
    safe("crash reporter", installCrashReporter);

    // Synchronous, must win the race against Discord's webpack runtime
    safe("webpack", initWebpack);
    safe("flux", initFlux);
    safe("i18n", initI18n);
    for (const p of builtInPlugins) safe(`register ${p.id}`, () => registerPlugin(p));
    // Plugins start immediately (DOM work inside them waits for DOMContentLoaded)
    // so network/Sentry/webpack hooks are in place before Discord boots.
    safe("plugins", startEnabledPlugins);

    (window as any).NexusCord = {
        version: NEXUSCORD_VERSION,
        Webpack,
        Patcher,
        Flux,
        I18n,
        Settings,
        Plugins: PluginManager,
        Themes: ThemeEngine,
        Discord,
        ContextMenu: { registerMenuItem, getLastTarget },
        BdCompat,
        openSettings,
        openOnboarding,
        mountPage,
        toast
    };

    onDomReady(() => {
        setStyle("nexuscord-core", coreCss);
        if (!isSafeMode()) safe("themes", initThemeEngine);
        safe("pages", registerPages);
        safe("settings UI", initSettingsUI);

        // BetterDiscord plugins expect Discord to be fully loaded
        let bdStarted = false;
        const startBd = () => {
            if (bdStarted || isSafeMode()) return;
            bdStarted = true;
            safe("BdApi", initBdCompat);
        };
        const unsub = subscribe("CONNECTION_OPEN", () => {
            unsub();
            setTimeout(startBd, 0);
            // Discord ran fine for 20s after connecting: clear the crash counter
            setTimeout(() => Native.system?.bootOk?.(), 20000);
            // First run: guided setup
            if (!Settings.get().onboardingDone && !isSafeMode()) setTimeout(openOnboarding, 6000);
        });
        setTimeout(startBd, 15000);

        // Main process asks us to shrink before it trims Discord's working set
        Native.system?.onEvent?.((event: string) => {
            if (event !== "trim-memory") return;
            try {
                Native.perf.clearWebFrameCache();
                (window as any).gc?.();
            } catch { /* gc not exposed */ }
        });

        Native.linkShield.onBlocked(url => toast(I18n.t("shield.blockedByMain", { url }), "error", 6000));
        log.info(`Ready in ${(performance.now() - started).toFixed(1)}ms`);
    });
}

boot();
