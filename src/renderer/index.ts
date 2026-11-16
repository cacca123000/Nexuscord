/*
 * NexusCord renderer entry point - runs in Discord's main world, injected by
 * the preload BEFORE Discord's own scripts so the webpack hook wins the race.
 */
import { initBdCompat } from "./core/bdCompat";
import { setStyle, onDomReady } from "./core/dom";
import { Flux, initFlux, subscribe } from "./core/flux";
import { I18n, initI18n } from "./core/i18n";
import { Logger } from "./core/logger";
import { Native } from "./core/native";
import { Patcher } from "./core/patcher";
import { PluginManager, registerPlugin, startEnabledPlugins } from "./core/pluginManager";
import { Settings } from "./core/settings";
import { initSettingsUI, openPanelModal } from "./core/settingsUI";
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
    const started = performance.now();

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
        openSettings: openPanelModal,
        toast
    };

    onDomReady(() => {
        setStyle("nexuscord-core", coreCss);
        safe("themes", initThemeEngine);
        safe("settings UI", initSettingsUI);

        // BetterDiscord plugins expect Discord to be fully loaded
        let bdStarted = false;
        const startBd = () => {
            if (bdStarted) return;
            bdStarted = true;
            safe("BdApi", initBdCompat);
        };
        const unsub = subscribe("CONNECTION_OPEN", () => {
            unsub();
            setTimeout(startBd, 0);
        });
        setTimeout(startBd, 15000);

        Native.linkShield.onBlocked(url => toast(I18n.t("shield.blockedByMain", { url }), "error", 6000));
        log.info(`Ready in ${(performance.now() - started).toFixed(1)}ms`);
    });
}

boot();
