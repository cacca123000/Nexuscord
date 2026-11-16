/* Plugins page: built-in plugins by category, BetterDiscord plugins (with risk scan), store. */
import { BdCompat, renderForeignPanel } from "../bdCompat";
import { createView, h, Fragment } from "../dom";
import { t, TranslationKey } from "../i18n";
import { Native } from "../native";
import { CATEGORIES, getPlugins, isEnabled, onPluginsChange, PluginCategory } from "../pluginManager";
import { scanPlugin } from "../pluginScanner";
import { onPageCleanup } from "../settingsUI";
import { Button, Icons, openModal, SearchBox, Switch, Tabs } from "../ui";
import { PluginCard } from "./common";
import { StoreView } from "./store";
void h;
void Fragment;

type Tab = "builtin" | "bd" | "store";
interface State {
    tab: Tab;
    q: string;
    cat: PluginCategory | "all";
    status: "all" | "on" | "off";
}
const state: State = { tab: "builtin", q: "", cat: "all", status: "all" };

function BuiltIn(redraw: () => void) {
    const q = state.q.trim().toLowerCase();
    const list = getPlugins().filter(
        p =>
            (state.cat === "all" || p.category === state.cat) &&
            (state.status === "all" || (state.status === "on") === isEnabled(p.id)) &&
            (!q || `${t(p.name)} ${t(p.description)} ${p.id}`.toLowerCase().includes(q))
    );
    const chip = (id: State["cat"], label: string, icon = "") => (
        <button className={["nc-tab", state.cat === id && "active"]} type="button" onClick={() => ((state.cat = id), redraw())}>
            {icon} {label}
        </button>
    );
    const groups = (state.cat === "all" ? CATEGORIES : CATEGORIES.filter(c => c.id === state.cat))
        .map(c => ({ c, items: list.filter(p => p.category === c.id) }))
        .filter(g => g.items.length);
    return (
        <>
            <div className="nc-toolbar">
                <SearchBox value={state.q} placeholder={t("common.search")} focusKey="plugin-search" onInput={v => ((state.q = v), redraw())} />
                <Tabs
                    value={state.status}
                    tabs={[
                        { id: "all", label: t("plugins.filter.all") },
                        { id: "on", label: t("plugins.filter.enabled") },
                        { id: "off", label: t("plugins.filter.disabled") }
                    ]}
                    onChange={v => ((state.status = v), redraw())}
                />
            </div>
            <div className="nc-tabs">
                {chip("all", t("plugins.filter.all"))}
                {CATEGORIES.map(c => chip(c.id, t(c.label), c.icon))}
            </div>
            {groups.length ? (
                groups.map(g => (
                    <>
                        <h3 className="nc-section-title">
                            {g.c.icon} {t(g.c.label)} <span className="nc-tag">{g.items.length}</span>
                        </h3>
                        <div className="nc-grid">{g.items.map(PluginCard)}</div>
                    </>
                ))
            ) : (
                <div className="nc-empty">{t("common.noResults")}</div>
            )}
        </>
    );
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

function BdPlugins() {
    const q = state.q.trim().toLowerCase();
    const list = BdCompat.getPlugins().filter(p => !q || `${p.meta.name} ${p.meta.description} ${p.meta.author}`.toLowerCase().includes(q));
    return (
        <>
            <div className="nc-toolbar">
                <SearchBox value={state.q} placeholder={t("common.search")} focusKey="bd-search" onInput={v => ((state.q = v), view.redraw())} />
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("plugins")}>{t("plugins.openFolder")}</Button>
            </div>
            <p className="nc-sub">{t("plugins.bdHint")}</p>
            {list.length ? (
                <div className="nc-grid">
                    {list.map(p => {
                        const on = BdCompat.isEnabled(p.file);
                        const scan = scanPlugin(p.source);
                        return (
                            <div className={["nc-card interactive", on && "on"]}>
                                <div className="nc-card-head">
                                    <div className="nc-card-icon">🧩</div>
                                    <div className="nc-card-title">{p.meta.name}</div>
                                    <Switch checked={on} label={p.meta.name} onChange={v => BdCompat.setEnabled(p.file, v)} />
                                </div>
                                <div className="nc-card-desc">{p.error ? t("common.error", { error: p.error }) : p.meta.description}</div>
                                <div className="nc-card-foot">
                                    <span className="nc-tag">v{p.meta.version}</span>
                                    <span
                                        className={["nc-tag", scan.risk === "high" ? "danger" : scan.risk === "medium" ? "warn" : "ok"]}
                                        title={scan.findings.map(f => t(f.label)).join("\n")}
                                    >
                                        {t(`scan.risk.${scan.risk}` as TranslationKey)}
                                    </span>
                                    <span className="nc-sub" style="font-size:12px">{t("common.by", { author: p.meta.author })}</span>
                                    <span className="nc-spacer" />
                                    {p.instance?.getSettingsPanel ? (
                                        <Button variant="icon" title={t("plugins.configure", { name: p.meta.name })} icon={Icons.gear} onClick={() => openExternalConfig(p.file)} />
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="nc-empty">{BdCompat.getPlugins().length ? t("common.noResults") : t("plugins.empty")}</div>
            )}
        </>
    );
}

let storeNode: Node | null = null;
const view = createView(() => {
    const tabs = (
        <Tabs
            value={state.tab}
            tabs={[
                { id: "builtin", label: t("plugins.tab.builtin"), count: getPlugins().length },
                { id: "bd", label: t("plugins.tab.bd"), count: BdCompat.getPlugins().length },
                { id: "store", label: t("plugins.tab.store") }
            ]}
            onChange={v => ((state.tab = v), (state.q = ""), view.redraw())}
        />
    );
    if (state.tab === "store") {
        storeNode ??= StoreView("plugin");
        return (
            <div className="nc-stack" style="gap:14px">
                {tabs}
                {storeNode}
            </div>
        );
    }
    return (
        <div className="nc-stack" style="gap:14px">
            {tabs}
            {state.tab === "builtin" ? BuiltIn(view.redraw) : BdPlugins()}
        </div>
    );
});

export function PluginsPage(): Node {
    storeNode = null;
    view.redraw();
    const off1 = onPluginsChange(() => {
        const a = document.activeElement as HTMLElement | null;
        if (a?.dataset.focusKey) return void view.redraw();
        view.redraw();
    });
    const off2 = BdCompat.onChange(view.redraw);
    onPageCleanup(() => (off1(), off2()));
    return view.host;
}
