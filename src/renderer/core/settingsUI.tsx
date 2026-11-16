/*
 * NexusCord settings UI.
 *  - Native integration: patches Discord's UserSettings `getPredicateSections`
 *    to add a "NexusCord" category with three localized tabs.
 *  - DOM fallback: if Discord's settings internals changed, entries are injected
 *    into the settings sidebar DOM and open the panel in a glass modal.
 *  - Always available: Ctrl+Alt+N opens the panel anywhere.
 */
import { BdCompat, getReact, renderForeignPanel } from "./bdCompat";
import { Fragment, h, reactive } from "./dom";
import { getLanguage, onLanguageChange, t, TranslationKey } from "./i18n";
import { Logger } from "./logger";
import { Native } from "./native";
import { Patcher } from "./patcher";
import { getOption, getPlugins, isRunning, NexusPlugin, onPluginsChange, PluginOption, setOption, setPluginEnabled } from "./pluginManager";
import { Settings } from "./settings";
import { ThemeEngine } from "./themeEngine";
import { Button, Icon, Icons, openModal, Select, SettingRow, Switch, toast } from "./ui";
import { waitFor } from "./webpack";
void Fragment;

const log = new Logger("SettingsUI");

export type PanelTab = "plugins" | "themes" | "performance";
const TABS: { id: PanelTab; label: TranslationKey }[] = [
    { id: "plugins", label: "tabs.plugins" },
    { id: "themes", label: "tabs.themes" },
    { id: "performance", label: "tabs.performance" }
];

// ---------------------------------------------------------------------------
// Plugins tab
// ---------------------------------------------------------------------------
function optionControl(pluginId: string, key: string, opt: PluginOption): Node {
    const value = getOption<any>(pluginId, key);
    switch (opt.type) {
        case "boolean":
            return <Switch checked={!!value} label={t(opt.label)} onChange={v => setOption(pluginId, key, v)} />;
        case "select":
            return (
                <Select
                    value={value}
                    options={opt.options.map(o => ({ value: o.value, label: tryT(String(o.label)) }))}
                    onChange={v => setOption(pluginId, key, v)}
                />
            );
        case "number":
            return (
                <input
                    className="nc-input"
                    style="max-width:120px;flex:none"
                    type="number"
                    min={opt.min}
                    max={opt.max}
                    value={String(value)}
                    onChange={(e: Event) => {
                        const n = Number((e.target as HTMLInputElement).value);
                        if (Number.isFinite(n)) setOption(pluginId, key, Math.min(opt.max ?? Infinity, Math.max(opt.min ?? -Infinity, n)));
                    }}
                />
            );
    }
}

function tryT(label: string): string {
    const translated = t(label as TranslationKey);
    return translated === label ? label : translated;
}

function openPluginConfig(p: NexusPlugin) {
    const body = <div className="nc-stack" />;
    const dispose = reactive(
        body,
        () => (
            <>
                <p className="nc-sub">{t(p.description)}</p>
                {Object.entries(p.options ?? {}).map(([key, opt]) => (
                    <SettingRow
                        label={t(opt.label)}
                        hint={opt.restartNeeded ? t("plugins.restartNeeded") : undefined}
                        control={optionControl(p.id, key, opt)}
                    />
                ))}
            </>
        ),
        onLanguageChange
    );
    openModal({ title: t("plugins.configure", { name: t(p.name) }), body, onClose: dispose });
}

function openExternalConfig(file: string) {
    const p = BdCompat.getPlugins().find(x => x.file === file);
    if (!p?.instance?.getSettingsPanel) return;
    const host = <div className="nc-root" />;
    let cleanup = () => {};
    try {
        cleanup = renderForeignPanel(host, p.instance.getSettingsPanel());
    } catch (e) {
        host.textContent = t("common.error", { error: String(e) });
    }
    openModal({ title: t("plugins.configure", { name: p.meta.name }), body: host, wide: true, onClose: () => cleanup() });
}

interface PanelState {
    tab: PanelTab;
    search: string;
    filter: "all" | "enabled" | "disabled";
}

function PluginsTab(state: PanelState, rerender: () => void) {
    const q = state.search.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const passFilter = (on: boolean) => state.filter === "all" || (state.filter === "enabled") === on;

    const builtIn = getPlugins()
        .filter(p => matches(t(p.name) + " " + t(p.description) + " " + p.id) && passFilter(Settings.isPluginEnabled(p.id)))
        .map(p => {
            const on = Settings.isPluginEnabled(p.id);
            return (
                <div className={["nc-card", on && "on"]} data-plugin={p.id}>
                    <div className="nc-card-head">
                        <div className="nc-card-title">{t(p.name)}</div>
                        <Switch checked={on} label={t(p.name)} onChange={v => setPluginEnabled(p.id, v)} />
                    </div>
                    <div className="nc-card-desc">{t(p.description)}</div>
                    <div className="nc-card-foot">
                        <span className="nc-tag accent">{t("common.builtIn")}</span>
                        {on && !isRunning(p.id) ? <span className="nc-tag warn">!</span> : null}
                        <span className="nc-spacer" />
                        {p.options ? <Button variant="icon" title={t("plugins.configure", { name: t(p.name) })} icon={Icons.gear} onClick={() => openPluginConfig(p)} /> : null}
                    </div>
                </div>
            );
        });

    const external = BdCompat.getPlugins()
        .filter(p => matches(`${p.meta.name} ${p.meta.description} ${p.meta.author}`) && passFilter(BdCompat.isEnabled(p.file)))
        .map(p => {
            const on = BdCompat.isEnabled(p.file);
            return (
                <div className={["nc-card", on && "on"]}>
                    <div className="nc-card-head">
                        <div className="nc-card-title">{p.meta.name}</div>
                        <Switch checked={on} label={p.meta.name} onChange={v => BdCompat.setEnabled(p.file, v)} />
                    </div>
                    <div className="nc-card-desc">{p.error ? t("common.error", { error: p.error }) : p.meta.description}</div>
                    <div className="nc-card-foot">
                        <span className="nc-tag">{t("common.external")}</span>
                        <span className="nc-sub" style="font-size:12px">
                            {t("common.version", { version: p.meta.version })} · {t("common.by", { author: p.meta.author })}
                        </span>
                        <span className="nc-spacer" />
                        {p.instance?.getSettingsPanel ? (
                            <Button variant="icon" title={t("plugins.configure", { name: p.meta.name })} icon={Icons.gear} onClick={() => openExternalConfig(p.file)} />
                        ) : null}
                    </div>
                </div>
            );
        });

    const filterBtn = (f: PanelState["filter"], label: TranslationKey) => (
        <button className={["nc-tab", state.filter === f && "active"]} type="button" onClick={() => ((state.filter = f), rerender())}>
            {t(label)}
        </button>
    );

    return (
        <>
            <p className="nc-sub">{t("plugins.subtitle")}</p>
            <div className="nc-toolbar">
                <input
                    className="nc-input"
                    data-focus-key="plugin-search"
                    placeholder={t("common.search")}
                    value={state.search}
                    onInput={(e: Event) => ((state.search = (e.target as HTMLInputElement).value), rerender())}
                />
                <div className="nc-tabs">
                    {filterBtn("all", "plugins.filter.all")}
                    {filterBtn("enabled", "plugins.filter.enabled")}
                    {filterBtn("disabled", "plugins.filter.disabled")}
                </div>
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("plugins")}>
                    {t("plugins.openFolder")}
                </Button>
            </div>
            <h3 className="nc-section-title">{t("common.builtIn")}</h3>
            {builtIn.length ? <div className="nc-grid">{builtIn}</div> : <div className="nc-empty">{t("common.noResults")}</div>}
            <h3 className="nc-section-title">{t("common.external")}</h3>
            {external.length ? (
                <div className="nc-grid">{external}</div>
            ) : (
                <div className="nc-empty">{BdCompat.getPlugins().length ? t("common.noResults") : t("plugins.empty")}</div>
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Themes tab
// ---------------------------------------------------------------------------
function QuickCssEditor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ta = (
        <textarea
            className="nc-textarea"
            spellcheck="false"
            data-focus-key="quickcss"
            placeholder="/* .theme-dark { --background-primary: #0b0d14; } */"
            onInput={(e: Event) => {
                const value = (e.target as HTMLTextAreaElement).value;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => ThemeEngine.setQuickCss(value), 200);
            }}
            onKeyDown={(e: KeyboardEvent) => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                const el = e.target as HTMLTextAreaElement;
                el.setRangeText("    ", el.selectionStart, el.selectionEnd, "end");
                el.dispatchEvent(new Event("input"));
            }}
        />
    ) as HTMLTextAreaElement;
    ta.value = ThemeEngine.getQuickCss();
    return ta;
}

function ThemesTab(state: PanelState, rerender: () => void) {
    const q = state.search.trim().toLowerCase();
    const themes = ThemeEngine.getThemes().filter(th => !q || `${th.meta.name} ${th.meta.description} ${th.meta.author}`.toLowerCase().includes(q));
    return (
        <>
            <p className="nc-sub">{t("themes.subtitle")}</p>
            <div className="nc-toolbar">
                <input
                    className="nc-input"
                    data-focus-key="theme-search"
                    placeholder={t("common.search")}
                    value={state.search}
                    onInput={(e: Event) => {
                        state.search = (e.target as HTMLInputElement).value;
                        rerender();
                    }}
                />
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("themes")}>
                    {t("themes.openFolder")}
                </Button>
            </div>
            {themes.length ? (
                <div className="nc-grid">
                    {themes.map(th => {
                        const on = ThemeEngine.isEnabled(th.file);
                        return (
                            <div className={["nc-card", on && "on"]}>
                                <div className="nc-card-head">
                                    <div className="nc-card-title">{th.meta.name}</div>
                                    <Switch checked={on} label={th.meta.name} onChange={v => ThemeEngine.setEnabled(th.file, v)} />
                                </div>
                                <div className="nc-card-desc">{th.meta.description}</div>
                                <div className="nc-card-foot">
                                    <span className="nc-sub" style="font-size:12px">
                                        {t("common.version", { version: th.meta.version })} · {t("common.by", { author: th.meta.author })}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="nc-empty">{ThemeEngine.getThemes().length ? t("common.noResults") : t("themes.empty")}</div>
            )}
            <h3 className="nc-section-title">{t("themes.quickCss")}</h3>
            <SettingRow
                label={t("themes.quickCssEnable")}
                hint={t("themes.quickCssHint")}
                control={<Switch checked={Settings.get().quickCssEnabled} onChange={v => ThemeEngine.setQuickCssEnabled(v)} />}
            />
            <QuickCssEditor />
        </>
    );
}

// ---------------------------------------------------------------------------
// Performance & Security tab
// ---------------------------------------------------------------------------
const fmtMB = (bytes: number) => `${(bytes / 1048576).toFixed(0)} MB`;

function PerformanceTab(registerTimer: (stop: () => void) => void) {
    const s = Settings.get();
    const stats = s.linkShieldStats;

    const totalEl = <b>…</b>;
    const procEl = <span>…</span>;
    const heapEl = <b>…</b>;
    const heapSub = <span>…</span>;
    const meterEl = <i style="width:0%" />;
    const updateRam = async () => {
        try {
            const r = Native.perf.rendererMemory();
            heapEl.textContent = fmtMB(r.heapUsed);
            heapSub.textContent = `${t("perf.ramRenderer")} · ${fmtMB(r.heapTotal)}`;
            const m = await Native.perf.memory();
            if (m.totalMB) {
                totalEl.textContent = `${m.totalMB} MB`;
                procEl.textContent = `${t("perf.ramTotal")} · ${t("perf.ramProcesses", { count: m.processes.length })}`;
                meterEl.style.width = `${Math.min(100, (m.totalMB / 2048) * 100).toFixed(1)}%`;
            } else {
                totalEl.textContent = "—";
                procEl.textContent = t("perf.ramTotal");
                meterEl.style.width = `${Math.min(100, (r.heapUsed / (512 * 1048576)) * 100).toFixed(1)}%`;
            }
        } catch (e) {
            log.warn("RAM monitor failed", e);
        }
    };
    updateRam();
    const iv = setInterval(updateRam, 2000);
    registerTimer(() => clearInterval(iv));

    const blacklistEl = <small>…</small>;
    const updateBlacklist = (st: { count: number; updatedAt: number }) => {
        blacklistEl.textContent = t("perf.blacklistInfo", {
            count: st.count.toLocaleString(getLanguage() === "it" ? "it-IT" : "en-US"),
            when: st.updatedAt ? new Date(st.updatedAt).toLocaleString(getLanguage() === "it" ? "it-IT" : "en-US") : t("common.never")
        });
    };
    Native.linkShield.status().then(updateBlacklist).catch(() => {});

    const perf = s.performance;
    const restartRow = (
        <div className="nc-row">
            <div className="nc-row-label">{t("app.restartRequired")}</div>
            <Button variant="primary" icon={Icons.refresh} onClick={() => Native.perf.relaunch()}>
                {t("app.restartNow")}
            </Button>
        </div>
    );
    const perfToggle = (key: "processPerSite" | "gpuRasterization" | "disableBackgroundTimerThrottling", label: TranslationKey) => (
        <SettingRow label={t(label)} control={<Switch checked={perf[key]} onChange={v => Settings.update(st => void (st.performance[key] = v))} />} />
    );

    const stat = (value: number, label: TranslationKey) => (
        <div className="nc-stat">
            <b>{value.toLocaleString()}</b>
            <span>{t(label)}</span>
        </div>
    );

    return (
        <>
            <h3 className="nc-section-title">{t("perf.ram")}</h3>
            <div className="nc-stats">
                <div className="nc-stat">
                    {totalEl}
                    {procEl}
                </div>
                <div className="nc-stat">
                    {heapEl}
                    {heapSub}
                </div>
            </div>
            <div className="nc-meter">{meterEl}</div>
            <div className="nc-toolbar">
                <Button
                    icon={Icons.trash}
                    onClick={async () => {
                        await Native.perf.purgeCache();
                        toast(t("perf.purged"), "success");
                        updateRam();
                    }}
                >
                    {t("perf.purge")}
                </Button>
            </div>

            <h3 className="nc-section-title">{t("perf.language")}</h3>
            <SettingRow
                label={t("perf.language")}
                hint={t("perf.languageHint")}
                control={
                    <Select
                        value={s.language}
                        options={[
                            { value: "auto", label: t("perf.lang.auto") },
                            { value: "en", label: t("perf.lang.en") },
                            { value: "it", label: t("perf.lang.it") }
                        ]}
                        onChange={v => Settings.update(st => void (st.language = v as typeof st.language))}
                    />
                }
            />

            <h3 className="nc-section-title">{t("perf.engine")}</h3>
            <div className="nc-stack">
                <SettingRow
                    label={t("perf.maxOldSpace")}
                    hint={t("perf.maxOldSpaceHint")}
                    control={
                        <Select
                            value={perf.maxOldSpaceSize}
                            options={[
                                { value: 0, label: t("perf.unlimited") },
                                { value: 384, label: "384 MB" },
                                { value: 512, label: "512 MB" },
                                { value: 768, label: "768 MB" },
                                { value: 1024, label: "1024 MB" },
                                { value: 2048, label: "2048 MB" }
                            ]}
                            onChange={v => Settings.update(st => void (st.performance.maxOldSpaceSize = Number(v)))}
                        />
                    }
                />
                {perfToggle("processPerSite", "perf.processPerSite")}
                {perfToggle("gpuRasterization", "perf.gpuRaster")}
                {perfToggle("disableBackgroundTimerThrottling", "perf.bgThrottle")}
                {restartRow}
            </div>

            <h3 className="nc-section-title">{t("perf.linkShield")}</h3>
            <div className="nc-row">
                <div className="nc-row-label">
                    {t("perf.blacklist")}
                    {blacklistEl}
                </div>
                <Button
                    icon={Icons.refresh}
                    onClick={async () => {
                        blacklistEl.textContent = "…";
                        updateBlacklist(await Native.linkShield.refresh());
                    }}
                >
                    {t("perf.refreshList")}
                </Button>
            </div>
            <div className="nc-stats">
                {stat(stats.phishingBlocked, "perf.stat.phishing")}
                {stat(stats.spoofsBlocked, "perf.stat.spoofs")}
                {stat(stats.typosquatsFlagged, "perf.stat.typosquats")}
                {stat(stats.trackersStripped, "perf.stat.trackers")}
                {stat(stats.linksUnshortened, "perf.stat.unshortened")}
                {stat(stats.executablesIntercepted, "perf.stat.executables")}
            </div>

            <h3 className="nc-section-title">{t("perf.about")}</h3>
            <div className="nc-row">
                <div className="nc-row-label">
                    <small style="margin:0">{t("perf.aboutText", { version: NEXUSCORD_VERSION, path: Native.settings.paths().data })}</small>
                </div>
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("data")}>
                    {t("perf.openDataFolder")}
                </Button>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** Mounts the full NexusCord panel into `host`. Returns a cleanup function. */
export function mountPanel(host: HTMLElement, initialTab: PanelTab = "plugins", showTabs = true): () => void {
    const state: PanelState = { tab: initialTab, search: "", filter: "all" };
    let stopTimers: (() => void)[] = [];
    const root = <div className="nc-root nc-panel" />;
    host.appendChild(root);

    let draw: () => void = () => {};
    const render = () => {
        stopTimers.forEach(s => s());
        stopTimers = [];
        const content =
            state.tab === "plugins"
                ? PluginsTab(state, () => draw())
                : state.tab === "themes"
                  ? ThemesTab(state, () => draw())
                  : PerformanceTab(stop => stopTimers.push(stop));
        return (
            <>
                <div className="nc-hero">
                    <div className="nc-logo" html={Icons.logo} />
                    <div>
                        <h1>{t("app.name")}</h1>
                        <p>{t("app.tagline")} · v{NEXUSCORD_VERSION}</p>
                    </div>
                </div>
                {showTabs ? (
                    <div className="nc-tabs" role="tablist">
                        {TABS.map(tab => (
                            <button
                                className={["nc-tab", state.tab === tab.id && "active"]}
                                role="tab"
                                aria-selected={String(state.tab === tab.id)}
                                type="button"
                                onClick={() => {
                                    state.tab = tab.id;
                                    state.search = "";
                                    draw();
                                }}
                            >
                                {t(tab.label)}
                            </button>
                        ))}
                    </div>
                ) : null}
                {content}
            </>
        );
    };

    // Avoid re-rendering the QuickCSS editor while the user types in it
    const guardedSub = (sub: (cb: () => void) => () => void) => (cb: () => void) =>
        sub(() => {
            const active = document.activeElement as HTMLElement | null;
            if (active?.dataset.focusKey === "quickcss" && root.contains(active)) return;
            cb();
        });

    const dispose = reactive(
        root,
        render,
        cb => {
            draw = cb;
            return () => {};
        },
        onLanguageChange,
        onPluginsChange,
        BdCompat.onChange,
        guardedSub(ThemeEngine.onChange),
        guardedSub(cb => Settings.subscribe(cb))
    );

    return () => {
        dispose();
        stopTimers.forEach(s => s());
        root.remove();
    };
}

let panelModal: { close: () => void } | null = null;

export function openPanelModal(tab: PanelTab = "plugins"): void {
    panelModal?.close();
    const host = <div />;
    const cleanup = mountPanel(host, tab);
    panelModal = openModal({ title: t("app.name"), body: host, wide: true, buttons: [], onClose: () => (cleanup(), (panelModal = null)) });
    panelModal && host.closest(".nc-modal")?.querySelector(".nc-modal-head")?.remove();
}

// ---------------------------------------------------------------------------
// Discord settings integration
// ---------------------------------------------------------------------------
let nativeInjected = false;
const reactComponents = new Map<PanelTab, any>();

function getSectionComponent(tab: PanelTab): any {
    const React = getReact();
    if (!React) return null;
    let C = reactComponents.get(tab);
    if (!C) {
        C = function NexusCordSettings() {
            const ref = React.useRef(null);
            React.useEffect(() => {
                if (!ref.current) return;
                return mountPanel(ref.current, tab, false);
            }, []);
            return React.createElement("div", { ref, className: "nc-settings-host" });
        };
        reactComponents.set(tab, C);
    }
    return C;
}

function patchNativeSettings(): void {
    waitFor(
        m => typeof m === "function" && typeof m.prototype?.getPredicateSections === "function",
        SettingsView => {
            Patcher.after("NexusCord:Settings", SettingsView.prototype, "getPredicateSections", (_self, _args, sections: any[]) => {
                if (!Array.isArray(sections) || sections.some(s => s?.section === "nexuscord_plugins")) return;
                const at = sections.findIndex(s => /^(changelog|logout)$/i.test(String(s?.section)));
                let insertAt = at === -1 ? sections.length : at;
                if (insertAt > 0 && sections[insertAt - 1]?.section === "DIVIDER") insertAt--;
                const ours: any[] = [{ section: "DIVIDER" }, { section: "HEADER", label: t("app.name") }];
                for (const tab of TABS) {
                    const element = getSectionComponent(tab.id);
                    if (element) ours.push({ section: `nexuscord_${tab.id}`, label: t(tab.label), element, className: `nc-section-${tab.id}` });
                }
                if (ours.length > 2) {
                    sections.splice(insertAt, 0, ...ours);
                    nativeInjected = true;
                }
            });
            log.info("Native settings sections patched");
        },
        "settings"
    );
}

/** Fallback for Discord builds where the sections API moved. */
function domFallback(): void {
    const SIDEBAR_SELECTORS = [
        '[class*="standardSidebarView"] [class*="sidebar"] > div',
        '[class*="standardSidebarView"] [class*="side_"]',
        '[class*="settingsSidebar"] nav',
        '[data-nc-settings-sidebar]'
    ];
    let scheduled = false;
    const check = () => {
        scheduled = false;
        if (nativeInjected) return;
        const sidebar = SIDEBAR_SELECTORS.map(s => document.querySelector(s)).find(Boolean) as HTMLElement | undefined;
        if (!sidebar || sidebar.querySelector(".nc-dom-section")) return;
        const itemClass = (sidebar.querySelector('[role="tab"], [class*="item"]') as HTMLElement | null)?.className ?? "";
        const section = (
            <div className="nc-dom-section">
                <div className="nc-dom-sidebar-header">{t("app.name")}</div>
                {TABS.map(tab => (
                    <div className={`${itemClass} nc-dom-sidebar-item`} role="tab" tabindex="0" onClick={() => openPanelModal(tab.id)}>
                        {t(tab.label)}
                    </div>
                ))}
            </div>
        );
        sidebar.appendChild(section);
    };
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(check, 250);
    }).observe(document.body, { childList: true, subtree: true });
    // Re-label fallback entries on language change
    onLanguageChange(() => document.querySelectorAll(".nc-dom-section").forEach(el => el.remove()));
}

export function initSettingsUI(): void {
    patchNativeSettings();
    domFallback();
    document.addEventListener(
        "keydown",
        e => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === "KeyN") {
                e.preventDefault();
                e.stopPropagation();
                if (panelModal) panelModal.close();
                else openPanelModal();
            }
        },
        true
    );
    if (!Settings.get().welcomeShown) {
        setTimeout(() => {
            toast(t("app.welcome"), "success", 8000);
            Settings.update(s => void (s.welcomeShown = true));
        }, 6000);
    }
    void Icon;
}
