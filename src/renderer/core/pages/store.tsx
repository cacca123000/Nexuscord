/* BetterDiscord add-on store (themes & plugins) - api.betterdiscord.app/v3/store/addons */
import { BdCompat } from "../bdCompat";
import { svgIcon } from "../icons";
import { createView, h, Fragment } from "../dom";
import { getLanguage, t } from "../i18n";
import { Logger } from "../logger";
import { Native } from "../native";
import { scanPlugin } from "../pluginScanner";
import { onPageCleanup } from "../settingsUI";
import { ThemeEngine } from "../themeEngine";
import { Button, confirmModal, Icons, SearchBox, Select, Switch, toast } from "../ui";
import { getPlugin } from "../pluginManager";
import compat from "../../data/bdCompat.json";
import { BD_DUPLICATES, BD_LIBRARIES, DEAD_LIBRARIES } from "../../data/bdDuplicates";
void h;
void Fragment;

const log = new Logger("Store");
const API = "https://api.betterdiscord.app/v3/store/addons";

export interface StoreAddon {
    id: number;
    type: "theme" | "plugin";
    name: string;
    file_name: string;
    description: string;
    version: string;
    author: { display_name: string; github_name: string };
    likes: number;
    downloads: number;
    tags: string[];
    thumbnail_url: string | null;
    latest_source_url: string;
    latest_release_date: string;
}

let cache: { at: number; items: StoreAddon[] } | null = null;
let loading: Promise<StoreAddon[]> | null = null;

export function loadStore(force = false): Promise<StoreAddon[]> {
    if (!force && cache && Date.now() - cache.at < 3600_000) return Promise.resolve(cache.items);
    loading ??= Native.net
        .request(API)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const items = JSON.parse(r.body) as StoreAddon[];
            cache = { at: Date.now(), items };
            return items;
        })
        .finally(() => (loading = null));
    return loading;
}

function isInstalled(a: StoreAddon) {
    return a.type === "theme" ? ThemeEngine.getThemes().some(th => th.file === a.file_name) : BdCompat.getPlugins().some(p => p.file === a.file_name);
}

type Compat = "ok" | "partial" | "broken" | "untested";
const compatPlugins = (compat as { plugins: Record<string, string> }).plugins ?? {};

/** NexusCord built-in that already does what this store plugin does (no duplicates). */
export function duplicateOf(a: StoreAddon): string | null {
    const id = a.type === "plugin" ? BD_DUPLICATES[a.name] : undefined;
    return id && getPlugin(id) ? id : null;
}

export function compatOf(a: StoreAddon): Compat {
    if (a.type !== "plugin") return "ok";
    const c = compatPlugins[a.name];
    return c === "ok" || c === "partial" || c === "broken" ? c : "untested";
}

export async function installAddon(a: StoreAddon): Promise<boolean> {
    try {
        let source = "";
        if (a.type === "plugin") {
            const src = await Native.net.request(a.latest_source_url);
            if (!src.ok) throw new Error(`HTTP ${src.status}`);
            source = src.body;
            if (DEAD_LIBRARIES.test(source) && !/BdApi\.Webpack/.test(source)) log.warn(`${a.name} depends on a library that no longer exists`);
            const scan = scanPlugin(source);
            if (scan.risk !== "low") {
                const ok = await confirmModal(
                    t("store.riskTitle", { name: a.name }),
                    h(
                        "div",
                        { className: "nc-stack" },
                        h("p", { style: "margin:0" }, t(scan.risk === "high" ? "store.riskHigh" : "store.riskMedium")),
                        scan.findings.map(f => h("div", { className: "nc-row" }, h("span", { className: `nc-tag ${f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : ""}` }, f.severity), h("div", { className: "nc-row-label" }, t(f.label))))
                    ),
                    t("store.installAnyway"),
                    scan.risk === "high" ? "danger" : "info"
                );
                if (!ok) return false;
            }
            // Libraries the plugin needs (e.g. BDFDB) come along automatically
            for (const lib of BD_LIBRARIES) {
                if (!lib.detect.test(source) || BdCompat.getPlugins().some(p => p.file === lib.file)) continue;
                const entry = (cache?.items ?? []).find(x => x.file_name === lib.file);
                if (!entry) continue;
                await Native.addons.install("plugin", entry.file_name, entry.latest_source_url);
                BdCompat.setEnabled(entry.file_name, true);
                toast(t("store.installed", { name: entry.name }), "success", 2000);
            }
        }
        await Native.addons.install(a.type, a.file_name, a.latest_source_url);
        if (a.type === "plugin") BdCompat.setEnabled(a.file_name, true);
        else ThemeEngine.setEnabled(a.file_name, true);
        toast(t("store.installed", { name: a.name }), "success");
        return true;
    } catch (e) {
        log.error("install failed", e);
        toast(t("common.error", { error: String((e as Error).message) }), "error");
        return false;
    }
}

interface StoreState {
    q: string;
    sort: "downloads" | "likes" | "new" | "name";
    tag: string;
    showDuplicates: boolean;
    showBroken: boolean;
    limit: number;
}

const PAGE = 48;
const COMPAT_TAG: Record<Compat, { cls: string; icon: string; label: () => string; hint: () => string }> = {
    ok: { cls: "ok", icon: "check", label: () => t("store.verified"), hint: () => t("store.verifiedHint", { date: (compat as any).testedAt || "-" }) },
    partial: { cls: "warn", icon: "info", label: () => t("store.partial"), hint: () => t("store.partialHint") },
    broken: { cls: "danger", icon: "alert", label: () => t("store.broken"), hint: () => t("store.brokenHint") },
    untested: { cls: "", icon: "info", label: () => t("store.untested"), hint: () => "" }
};

export function StoreView(kind: "theme" | "plugin"): Node {
    const state: StoreState = { q: "", sort: "downloads", tag: "", showDuplicates: false, showBroken: false, limit: PAGE };
    let items: StoreAddon[] | null = null;
    let error = "";
    const fmt = (n: number) => n.toLocaleString(getLanguage(), { notation: "compact" });

    const view = createView(() => {
        if (error) return <div className="nc-banner danger">{t("store.loadFailed", { error })}</div>;
        if (!items) return <div className="nc-empty"><div className="nc-spinner" style="margin:0 auto 10px" />{t("store.loading")}</div>;
        const all = items.filter(a => a.type === kind);
        const tags = [...new Set(all.flatMap(a => a.tags))].sort();
        const q = state.q.trim().toLowerCase();
        let hidden = 0;
        const visible = all.filter(a => {
            if (a.name === "BDFDB") return false; // installed automatically when needed
            if (!state.showDuplicates && duplicateOf(a)) return (hidden++, false);
            if (!state.showBroken && compatOf(a) === "broken") return (hidden++, false);
            return (!q || `${a.name} ${a.description} ${a.author?.display_name}`.toLowerCase().includes(q)) && (!state.tag || a.tags.includes(state.tag));
        });
        const rank = (a: StoreAddon) => ({ ok: 0, partial: 1, untested: 2, broken: 3 })[compatOf(a)];
        const sorted = visible.sort((a, b) =>
            state.sort === "likes"
                ? b.likes - a.likes
                : state.sort === "new"
                  ? b.latest_release_date.localeCompare(a.latest_release_date)
                  : state.sort === "name"
                    ? a.name.localeCompare(b.name)
                    : rank(a) - rank(b) || b.downloads - a.downloads
        );
        const list = sorted.slice(0, state.limit);
        return (
            <div className="nc-stack">
                <div className="nc-toolbar">
                    <SearchBox value={state.q} placeholder={t("store.search")} focusKey={`store-${kind}`} onInput={v => ((state.q = v), (state.limit = PAGE), view.redraw())} />
                    <Select
                        value={state.sort}
                        options={[
                            { value: "downloads", label: t("store.sortDownloads") },
                            { value: "likes", label: t("store.sortLikes") },
                            { value: "new", label: t("store.sortNew") },
                            { value: "name", label: t("store.sortName") }
                        ]}
                        onChange={v => ((state.sort = v as StoreState["sort"]), view.redraw())}
                    />
                    <Select value={state.tag} options={[{ value: "", label: t("store.allTags") }, ...tags.map(tg => ({ value: tg, label: tg }))]} onChange={v => ((state.tag = String(v)), view.redraw())} />
                </div>
                {kind === "plugin" ? (
                    <div className="nc-row-wrap">
                        <Switch checked={state.showDuplicates} label={t("store.showDuplicates")} onChange={v => ((state.showDuplicates = v), view.redraw())} />
                        <span className="nc-sub">{t("store.showDuplicates")}</span>
                        <span style="width:16px" />
                        <Switch checked={state.showBroken} label={t("store.showBroken")} onChange={v => ((state.showBroken = v), view.redraw())} />
                        <span className="nc-sub">{t("store.showBroken")}</span>
                    </div>
                ) : null}
                <p className="nc-sub">
                    {t("store.count", { count: visible.length, total: all.length })}
                    {hidden ? ` · ${t("store.hiddenCount", { n: hidden })}` : ""}
                </p>
                <div className="nc-grid wide">
                    {list.map(a => {
                        const installed = isInstalled(a);
                        const dup = duplicateOf(a);
                        const c = COMPAT_TAG[compatOf(a)];
                        const needsLib: string | undefined = ((compat as any).needs ?? {})[a.name];
                        return (
                            <div className="nc-card interactive">
                                {a.thumbnail_url ? <img className="nc-thumb" loading="lazy" src={`https://betterdiscord.app${a.thumbnail_url}`} alt="" /> : null}
                                <div className="nc-card-head">
                                    <div className="nc-card-title">{a.name}</div>
                                    <span className="nc-tag">v{a.version}</span>
                                </div>
                                <div className="nc-card-desc">{a.description}</div>
                                <div className="nc-card-foot">
                                    {kind === "plugin" ? <span className={`nc-tag ${c.cls}`} title={c.hint()} html={svgIcon(c.icon, 12) + c.label()} /> : null}
                                    {dup ? <span className="nc-tag accent" title={t("store.builtInHint", { name: t(getPlugin(dup)!.name) })} html={svgIcon("logo", 12) + t("store.builtIn")} /> : null}
                                    {needsLib ? <span className="nc-tag" title={t("store.needsLibrary", { lib: needsLib })}>{needsLib}</span> : null}
                                    <span className="nc-tag" html={svgIcon("download", 12) + fmt(a.downloads)} />
                                    <span className="nc-tag" html={svgIcon("heart", 12) + fmt(a.likes)} />
                                </div>
                                <div className="nc-card-foot">
                                    <span className="nc-sub" style="font-size:12px">{t("common.by", { author: a.author?.display_name ?? "?" })}</span>
                                    <span className="nc-spacer" />
                                    <Button variant="ghost" icon={svgIcon("external")} title={t("store.source")} onClick={() => Native.shell.openExternal(a.latest_source_url)} />
                                    {installed ? (
                                        <Button
                                            variant="danger"
                                            onClick={async () => {
                                                if (a.type === "plugin") BdCompat.setEnabled(a.file_name, false);
                                                await Native.addons.remove(a.type, a.file_name);
                                                toast(t("store.removed", { name: a.name }), "success");
                                                setTimeout(view.redraw, 400);
                                            }}
                                        >
                                            {t("store.remove")}
                                        </Button>
                                    ) : (
                                        <Button variant="primary" icon={Icons.download} onClick={async () => (await installAddon(a)) && setTimeout(view.redraw, 600)}>
                                            {t("store.install")}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {sorted.length > list.length ? (
                    <div style="display:flex;justify-content:center">
                        <Button onClick={() => ((state.limit += PAGE), view.redraw())}>{t("store.loadMore")}</Button>
                    </div>
                ) : null}
            </div>
        );
    });

    loadStore()
        .then(r => ((items = r), view.redraw()))
        .catch(e => ((error = String(e.message ?? e)), view.redraw()));
    const offT = ThemeEngine.onChange(view.redraw);
    const offP = BdCompat.onChange(view.redraw);
    onPageCleanup(() => (offT(), offP()));
    return view.host;
}
