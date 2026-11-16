/* BetterDiscord add-on store (themes & plugins) - api.betterdiscord.app/v3/store/addons */
import { BdCompat } from "../bdCompat";
import { createView, h, Fragment } from "../dom";
import { getLanguage, t } from "../i18n";
import { Logger } from "../logger";
import { Native } from "../native";
import { scanPlugin } from "../pluginScanner";
import { onPageCleanup } from "../settingsUI";
import { ThemeEngine } from "../themeEngine";
import { Button, confirmModal, Icons, SearchBox, Select, toast } from "../ui";
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

export async function installAddon(a: StoreAddon): Promise<boolean> {
    try {
        if (a.type === "plugin") {
            const src = await Native.net.request(a.latest_source_url);
            if (!src.ok) throw new Error(`HTTP ${src.status}`);
            const scan = scanPlugin(src.body);
            if (scan.risk !== "low") {
                const ok = await confirmModal(
                    t("store.riskTitle", { name: a.name }),
                    h(
                        "div",
                        { className: "nc-stack" },
                        h("p", { style: "margin:0" }, t(scan.risk === "high" ? "store.riskHigh" : "store.riskMedium")),
                        scan.findings.map(f => h("div", { className: "nc-row", style: "padding:8px 10px" }, h("span", { className: `nc-tag ${f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : ""}` }, f.severity), h("div", { className: "nc-row-label" }, t(f.label))))
                    ),
                    t("store.installAnyway"),
                    scan.risk === "high" ? "danger" : "info"
                );
                if (!ok) return false;
            }
        }
        await Native.addons.install(a.type, a.file_name, a.latest_source_url);
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
}

export function StoreView(kind: "theme" | "plugin"): Node {
    const state: StoreState = { q: "", sort: "downloads", tag: "" };
    let items: StoreAddon[] | null = null;
    let error = "";
    const fmt = (n: number) => n.toLocaleString(getLanguage(), { notation: "compact" });

    const view = createView(() => {
        if (error) return <div className="nc-banner danger">{t("store.loadFailed", { error })}</div>;
        if (!items) return <div className="nc-empty">{t("store.loading")}</div>;
        const all = items.filter(a => a.type === kind);
        const tags = [...new Set(all.flatMap(a => a.tags))].sort();
        const q = state.q.trim().toLowerCase();
        const list = all
            .filter(a => (!q || `${a.name} ${a.description} ${a.author?.display_name}`.toLowerCase().includes(q)) && (!state.tag || a.tags.includes(state.tag)))
            .sort((a, b) =>
                state.sort === "likes" ? b.likes - a.likes : state.sort === "new" ? b.latest_release_date.localeCompare(a.latest_release_date) : state.sort === "name" ? a.name.localeCompare(b.name) : b.downloads - a.downloads
            )
            .slice(0, 120);
        return (
            <div className="nc-stack">
                <div className="nc-toolbar">
                    <SearchBox value={state.q} placeholder={t("store.search")} focusKey={`store-${kind}`} onInput={v => ((state.q = v), view.redraw())} />
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
                <p className="nc-sub">{t("store.count", { count: list.length, total: all.length })}</p>
                <div className="nc-grid wide">
                    {list.map(a => {
                        const installed = isInstalled(a);
                        return (
                            <div className="nc-card interactive">
                                {a.thumbnail_url ? <img className="nc-thumb" loading="lazy" src={`https://betterdiscord.app${a.thumbnail_url}`} alt="" /> : null}
                                <div className="nc-card-head">
                                    <div className="nc-card-title">{a.name}</div>
                                    <span className="nc-tag">v{a.version}</span>
                                </div>
                                <div className="nc-card-desc">{a.description}</div>
                                <div className="nc-card-foot">
                                    <span className="nc-sub" style="font-size:12px">{t("common.by", { author: a.author?.display_name ?? "?" })}</span>
                                    <span className="nc-tag">⬇ {fmt(a.downloads)}</span>
                                    <span className="nc-tag">♥ {fmt(a.likes)}</span>
                                    <span className="nc-spacer" />
                                    {installed ? (
                                        <Button
                                            variant="danger"
                                            onClick={async () => {
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
