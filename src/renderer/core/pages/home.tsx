/* "NexusCord" overview page: status at a glance, quick toggles, notification center. */
import { BdCompat } from "../bdCompat";
import { h, Fragment, reactive } from "../dom";
import { getLanguage, t } from "../i18n";
import { Native } from "../native";
import { getPlugins, isEnabled, isSafeMode, onPluginsChange, setPluginEnabled } from "../pluginManager";
import { onPageCleanup, openSettings } from "../settingsUI";
import { Settings } from "../settings";
import { ThemeEngine } from "../themeEngine";
import { Button, Icon, Icons, NotificationLog, Switch, toast } from "../ui";
import { relTime } from "./common";
void h;
void Fragment;

const QUICK = ["linkShield", "lowRamOptimizer", "silentTyping", "streamerPlus", "noTrack", "declutter"];

function Stat(value: string | number, label: string) {
    return (
        <div className="nc-stat">
            <b>{typeof value === "number" ? value.toLocaleString(getLanguage()) : value}</b>
            <span>{label}</span>
        </div>
    );
}

function NotificationCenter() {
    const host = <div className="nc-stack" />;
    const dispose = reactive(
        host,
        () => {
            const items = NotificationLog.all().slice(0, 25);
            if (!items.length) return <div className="nc-empty">{t("home.noNotifications")}</div>;
            return (
                <>
                    {items.map(n => (
                        <div className="nc-row" style="padding:9px 12px">
                            <span className={["nc-tag", n.kind === "error" ? "danger" : n.kind === "warn" ? "warn" : n.kind === "success" ? "ok" : "accent"]}>{t(`notif.${n.kind}`)}</span>
                            <div className="nc-row-label" style="font-weight:400">{n.text}</div>
                            <span className="nc-sub" style="font-size:11.5px">{relTime(n.at)}</span>
                        </div>
                    ))}
                </>
            );
        },
        NotificationLog.subscribe
    );
    onPageCleanup(dispose);
    return host;
}

export function HomePage(): Node {
    const s = Settings.get();
    const stats = s.linkShieldStats;
    const threats = stats.phishingBlocked + stats.spoofsBlocked + stats.typosquatsFlagged + stats.executablesIntercepted;
    const plugins = getPlugins();
    const active = plugins.filter(p => isEnabled(p.id)).length;
    const ramStat = Stat("…", t("home.ram"));
    const update = <div />;

    const refreshRam = async () => {
        try {
            const m = await Native.perf.memory();
            ramStat.querySelector("b")!.textContent = m.totalMB ? `${m.totalMB} MB` : `${Math.round(Native.perf.rendererMemory().heapUsed / 1048576)} MB`;
        } catch { /* ignore */ }
    };
    refreshRam();
    const iv = setInterval(refreshRam, 4000);
    onPageCleanup(() => clearInterval(iv));

    if (s.updates.autoCheck) {
        Native.system?.checkUpdate?.().then((u: any) => {
            if (u?.available) {
                update.replaceWith(
                    <div className="nc-banner info">
                        <Icon svg={Icons.download} size={18} />
                        <div style="flex:1">{t("home.updateAvailable", { version: u.latest })}</div>
                        <Button variant="primary" onClick={() => openSettings("tools")}>{t("home.viewUpdate")}</Button>
                    </div>
                );
            }
        }).catch(() => {});
    }

    const quick = <div className="nc-grid" />;
    const disposeQuick = reactive(
        quick,
        () => (
            <>
                {QUICK.map(id => plugins.find(p => p.id === id))
                    .filter(Boolean)
                    .map(p => (
                        <div className={["nc-card interactive", isEnabled(p!.id) && "on"]} style="flex-direction:row;align-items:center;min-height:0">
                            <div style="flex:1;min-width:0">
                                <div className="nc-card-title">{t(p!.name)}</div>
                                <div className="nc-card-desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{t(p!.description)}</div>
                            </div>
                            <Switch checked={isEnabled(p!.id)} label={t(p!.name)} onChange={v => setPluginEnabled(p!.id, v)} />
                        </div>
                    ))}
            </>
        ),
        onPluginsChange
    );
    onPageCleanup(disposeQuick);

    return (
        <>
            <div className="nc-hero">
                <div className="nc-logo" html={Icons.logo} />
                <div>
                    <h1>NexusCord</h1>
                    <p>{t("app.tagline")} · v{NEXUSCORD_VERSION}</p>
                </div>
                <div className="nc-hero-actions">
                    <Button icon={Icons.search} onClick={() => (window as any).NexusCord?.openPalette?.()}>
                        {t("home.commandPalette")} <span className="nc-kbd">Ctrl+Shift+P</span>
                    </Button>
                    {!s.onboardingDone ? (
                        <Button variant="primary" onClick={() => (window as any).NexusCord?.openOnboarding?.()}>{t("home.setup")}</Button>
                    ) : null}
                </div>
            </div>

            {isSafeMode() ? (
                <div className="nc-banner danger">
                    <Icon svg={Icons.alert} size={18} />
                    <div style="flex:1">{t("home.safeMode")}</div>
                    <Button onClick={() => Native.window?.action("restart")}>{t("home.restartNormally")}</Button>
                </div>
            ) : null}
            {update}

            <div className="nc-stats">
                {Stat(`${active}/${plugins.length}`, t("home.activePlugins"))}
                {ramStat}
                {Stat(threats, t("home.threatsBlocked"))}
                {Stat(stats.trackersStripped, t("perf.stat.trackers"))}
                {Stat(ThemeEngine.getThemes().filter(th => ThemeEngine.isEnabled(th.file)).length, t("home.activeThemes"))}
                {Stat(BdCompat.getPlugins().filter(p => BdCompat.isEnabled(p.file)).length, t("home.bdPlugins"))}
            </div>

            <h3 className="nc-section-title">{t("home.quickToggles")}</h3>
            {quick}

            <h3 className="nc-section-title">{t("home.shortcuts")}</h3>
            <div className="nc-row-wrap">
                <Button icon={Icons.puzzle} onClick={() => openSettings("plugins")}>{t("page.plugins")}</Button>
                <Button icon={Icons.brush} onClick={() => openSettings("themes")}>{t("page.themes")}</Button>
                <Button icon={Icons.palette} onClick={() => openSettings("appearance")}>{t("page.appearance")}</Button>
                <Button icon={Icons.shield} onClick={() => openSettings("privacy")}>{t("page.privacy")}</Button>
                <Button icon={Icons.bolt} onClick={() => openSettings("performance")}>{t("page.performance")}</Button>
                <Button icon={Icons.wrench} onClick={() => openSettings("tools")}>{t("page.tools")}</Button>
            </div>

            <h3 className="nc-section-title">
                {t("home.notifications")}
                <Button variant="ghost" onClick={() => (NotificationLog.clear(), toast(t("home.cleared"), "success", 1500))}>{t("home.clear")}</Button>
            </h3>
            {NotificationCenter()}
        </>
    );
}
