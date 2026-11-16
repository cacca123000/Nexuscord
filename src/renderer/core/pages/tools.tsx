/* Tools page: updates, backup & sync, profiles, multi-account, safe mode, diagnostics, dev tools. */
import { BdCompat } from "../bdCompat";
import { createView, h, Fragment } from "../dom";
import { t } from "../i18n";
import { errorLog } from "../logger";
import { Native } from "../native";
import { getPlugins, isEnabled, setPluginEnabled } from "../pluginManager";
import { Settings } from "../settings";
import { dataStore } from "../storage";
import { ThemeEngine } from "../themeEngine";
import { Button, confirmModal, copyText, Icons, openModal, SettingRow, Switch, TextInput, toast } from "../ui";
import { Webpack } from "../webpack";
import { relTime } from "./common";
void h;
void Fragment;

/** Data stores included in backups (everything user-created). */
export const BACKUP_STORES = ["bookmarks", "snippets", "localNicknames", "keywordAlerts", "scheduled", "messageLog", "wrapped", "profiles", "linkLists", "pinnedDms", "relationshipLog"];

export async function buildBackup(): Promise<string> {
    const data: Record<string, unknown> = {};
    for (const k of BACKUP_STORES) data[k] = dataStore<unknown>(k, null as unknown).get();
    return JSON.stringify(
        {
            nexuscord: NEXUSCORD_VERSION,
            createdAt: new Date().toISOString(),
            settings: { ...Settings.get(), security: { ...Settings.get().security, pinHash: "", pinSalt: "" } },
            quickCss: ThemeEngine.getQuickCss(),
            data
        },
        null,
        2
    );
}

export async function restoreBackup(json: string): Promise<void> {
    const b = JSON.parse(json);
    if (!b?.settings || !b.nexuscord) throw new Error(t("tools.invalidBackup"));
    const keepSecurity = Settings.get().security;
    Settings.replace({ ...b.settings, security: keepSecurity });
    if (typeof b.quickCss === "string") ThemeEngine.setQuickCss(b.quickCss);
    for (const [k, v] of Object.entries(b.data ?? {})) if (BACKUP_STORES.includes(k) && v != null) dataStore<unknown>(k, null as unknown).set(v);
    toast(t("tools.restored"), "success");
    if (await confirmModal(t("tools.restored"), t("tools.restartToApply"), t("app.restartNow"))) Native.perf.relaunch();
}

// ---------------------------------------------------------------------------
interface Profile {
    plugins: Record<string, boolean>;
    themes: Record<string, boolean>;
    external: Record<string, boolean>;
    savedAt: number;
}
const profiles = dataStore<Record<string, Profile>>("profiles", {});

function saveProfile(name: string) {
    const s = Settings.get();
    profiles.update(p => {
        p[name] = {
            plugins: Object.fromEntries(getPlugins().map(pl => [pl.id, isEnabled(pl.id)])),
            themes: { ...s.themes },
            external: { ...s.externalPlugins },
            savedAt: Date.now()
        };
    });
    toast(t("tools.profileSaved", { name }), "success");
}

function applyProfile(name: string) {
    const p = profiles.get()[name];
    if (!p) return;
    for (const [id, on] of Object.entries(p.plugins)) if (isEnabled(id) !== on) setPluginEnabled(id, on);
    for (const [file, on] of Object.entries(p.themes)) ThemeEngine.setEnabled(file, on);
    for (const [file, on] of Object.entries(p.external)) if (BdCompat.isEnabled(file) !== on) BdCompat.setEnabled(file, on);
    toast(t("tools.profileApplied", { name }), "success");
}

// ---------------------------------------------------------------------------
export function diagnostics(): string {
    const info = Native.system?.info?.() ?? ({} as any);
    const lines = [
        `NexusCord ${info.version ?? NEXUSCORD_VERSION}${info.safeMode ? " (SAFE MODE)" : ""}${info.profile ? ` profile=${info.profile}` : ""}`,
        `Discord ${info.discord ?? "?"} · Electron ${info.electron ?? "?"} · Chrome ${info.chrome ?? navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]} · ${info.platform ?? Native.platform} ${info.arch ?? ""}`,
        `Webpack runtimes: ${Webpack.instances.length}, modules: ${Object.keys(Webpack.require?.m ?? {}).length}, settings patch: ${(window as any).$NexusCordSettings?.patched ? "native" : "fallback"}`,
        `Locale: ${document.documentElement?.lang} · NexusCord language: ${Settings.get().language}`,
        `Enabled plugins: ${getPlugins().filter(p => isEnabled(p.id)).map(p => p.id).join(", ")}`,
        `BD plugins: ${BdCompat.getPlugins().map(p => `${p.meta.name}@${p.meta.version}${BdCompat.isEnabled(p.file) ? "" : " (off)"}${p.error ? " [ERROR]" : ""}`).join(", ") || "none"}`,
        `Themes: ${ThemeEngine.getThemes().filter(x => ThemeEngine.isEnabled(x.file)).map(x => x.meta.name).join(", ") || "none"}`,
        "",
        `Recent errors (${errorLog.length}):`,
        ...errorLog.slice(-15).map(e => `[${new Date(e.at).toISOString()}] ${e.scope}: ${e.text}`)
    ];
    return lines.join("\n");
}

// ---------------------------------------------------------------------------
function ModuleExplorer(): Node {
    const out = <div className="nc-code" style="max-height:300px">{t("tools.explorerHint")}</div>;
    let query = "";
    const run = (mode: "props" | "code" | "store") => {
        const args = query.split(",").map(x => x.trim()).filter(Boolean);
        if (!args.length) return;
        const res = mode === "store" ? [Webpack.findStore(args[0])].filter(Boolean) : Webpack.findAll(mode === "props" ? Webpack.filters.byProps(...args) : Webpack.filters.byCode(...args)).slice(0, 10);
        (window as any).$nc = res[0];
        (window as any).$ncAll = res;
        out.textContent = res.length
            ? `${res.length} result(s) - first stored in window.$nc, all in window.$ncAll\n\n` +
              res.map((r: any, i: number) => `#${i}: ${typeof r === "function" ? Function.prototype.toString.call(r).slice(0, 200) : Object.keys(r ?? {}).slice(0, 40).join(", ")}`).join("\n\n")
            : t("common.noResults");
    };
    return (
        <div className="nc-stack">
            <div className="nc-toolbar">
                <TextInput value="" placeholder="sendMessage, editMessage" grow live onChange={v => (query = v)} />
                <Button onClick={() => run("props")}>{t("tools.byProps")}</Button>
                <Button onClick={() => run("code")}>{t("tools.byCode")}</Button>
                <Button onClick={() => run("store")}>{t("tools.byStore")}</Button>
            </div>
            {out}
        </div>
    );
}

const view = createView(() => {
    const s = Settings.get();
    const updateBox = <div className="nc-sub">{t("tools.updateIdle")}</div>;
    const hasToken = Native.system?.hasSecret?.("githubToken") ?? false;
    let newProfile = "";
    let tokenValue = "";
    let instanceName = "";
    const profileList = Object.entries(profiles.get());

    const check = async () => {
        updateBox.textContent = t("tools.checking");
        const u: any = await Native.system.checkUpdate();
        Settings.update(st => void (st.updates.lastCheck = Date.now()));
        if (u?.available) {
            updateBox.replaceChildren(
                <div className="nc-banner info">
                    <div style="flex:1">
                        <b>{t("home.updateAvailable", { version: u.latest })}</b>
                        <div className="nc-sub" style="white-space:pre-wrap;max-height:120px;overflow:auto">{u.notes}</div>
                    </div>
                    <Button
                        variant="primary"
                        onClick={async () => {
                            const r: any = await Native.system.applyUpdate();
                            if (r?.ok) {
                                toast(t("tools.updated", { version: r.version }), "success");
                                if (await confirmModal(t("tools.updated", { version: r.version }), t("tools.restartToApply"), t("app.restartNow"))) Native.perf.relaunch();
                            } else toast(t("common.error", { error: r?.error ?? "?" }), "error");
                        }}
                    >
                        {t("tools.install")}
                    </Button>
                </div>
            );
        } else updateBox.textContent = u?.error ? t("tools.updateError", { error: u.error }) : t("tools.upToDate", { version: NEXUSCORD_VERSION });
    };

    return (
        <div className="nc-stack" style="gap:14px">
            <h3 className="nc-section-title">{t("tools.updates")}</h3>
            <div className="nc-card">
                <div className="nc-row-wrap">
                    <div style="flex:1">
                        <div className="nc-card-title">NexusCord v{NEXUSCORD_VERSION}</div>
                        <div className="nc-sub">{t("tools.lastCheck", { when: relTime(s.updates.lastCheck) })}</div>
                    </div>
                    <Button icon={Icons.refresh} onClick={check}>{t("tools.checkNow")}</Button>
                </div>
                {updateBox}
            </div>
            <SettingRow label={t("tools.autoCheck")} control={<Switch checked={s.updates.autoCheck} onChange={v => Settings.update(st => void (st.updates.autoCheck = v))} />} />

            <h3 className="nc-section-title">{t("tools.backup")}</h3>
            <div className="nc-row-wrap">
                <Button icon={Icons.download} onClick={async () => { const p = await Native.files.saveText(`nexuscord-backup-${new Date().toISOString().slice(0, 10)}.json`, await buildBackup()); if (p) toast(t("tools.exported"), "success"); }}>{t("tools.export")}</Button>
                <Button icon={Icons.folder} onClick={async () => { const txt = await Native.files.openText(); if (txt) restoreBackup(txt).catch(e => toast(String(e.message), "error")); }}>{t("tools.import")}</Button>
            </div>
            <div className="nc-card">
                <div className="nc-card-title">{t("tools.gist")}</div>
                <p className="nc-sub">{t("tools.gistHint")}</p>
                <div className="nc-toolbar">
                    <TextInput value="" type="password" placeholder={hasToken ? t("tools.tokenSaved") : "github_pat_…"} grow live onChange={v => (tokenValue = v)} />
                    <Button onClick={async () => { await Native.system.setSecret("githubToken", tokenValue); toast(t("tools.tokenStored"), "success"); view.redraw(); }}>{t("common.save")}</Button>
                </div>
                <div className="nc-row-wrap">
                    <Button variant="primary" onClick={async () => { const r: any = await Native.system.gistSync("push", await buildBackup()); toast(r.ok ? t("tools.pushed") : t("common.error", { error: r.error }), r.ok ? "success" : "error"); view.redraw(); }}>{t("tools.push")}</Button>
                    <Button onClick={async () => { const r: any = await Native.system.gistSync("pull"); if (r.ok) restoreBackup(r.content); else toast(t("common.error", { error: r.error }), "error"); }}>{t("tools.pull")}</Button>
                    <span className="nc-sub">{s.sync.gistId ? t("tools.lastSync", { when: relTime(s.sync.lastSync) }) : ""}</span>
                </div>
            </div>

            <h3 className="nc-section-title">{t("tools.profiles")}</h3>
            <div className="nc-toolbar">
                <TextInput value="" placeholder={t("tools.profileName")} grow live onChange={v => (newProfile = v)} />
                <Button variant="primary" onClick={() => { if (newProfile.trim()) { saveProfile(newProfile.trim()); view.redraw(); } }}>{t("tools.saveProfile")}</Button>
            </div>
            {profileList.length ? (
                <div className="nc-stack">
                    {profileList.map(([name, p]) => (
                        <div className="nc-row">
                            <div className="nc-row-label">
                                {name}
                                <small>{t("tools.profileInfo", { plugins: Object.values(p.plugins).filter(Boolean).length, when: relTime(p.savedAt) })}</small>
                            </div>
                            <Button onClick={() => applyProfile(name)}>{t("tools.apply")}</Button>
                            <Button variant="icon" icon={Icons.trash} title={t("store.remove")} onClick={() => (profiles.update(x => void delete x[name]), view.redraw())} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="nc-empty">{t("tools.noProfiles")}</div>
            )}

            <h3 className="nc-section-title">{t("tools.accounts")}</h3>
            <div className="nc-toolbar">
                <TextInput value="" placeholder={t("tools.accountName")} grow live onChange={v => (instanceName = v)} />
                <Button onClick={async () => { const name = instanceName.trim().replace(/[^\w.-]/g, "_"); if (name && (await Native.system.launchInstance(name))) toast(t("tools.launched", { name }), "success"); }}>{t("tools.launch")}</Button>
            </div>
            <p className="nc-sub">{t("tools.accountsHint")}</p>

            <h3 className="nc-section-title">{t("tools.recovery")}</h3>
            <div className="nc-row-wrap">
                <Button onClick={() => Native.window.action("restart")}>{t("tools.restart")}</Button>
                <Button variant="danger" onClick={() => Native.window.action("restart-safe")}>{t("tools.safeRestart")}</Button>
            </div>
            <p className="nc-sub">{t("tools.safeHint")}</p>

            <h3 className="nc-section-title">{t("tools.diagnostics")}</h3>
            <div className="nc-row-wrap">
                <Button icon={Icons.copy} onClick={() => copyText(diagnostics())}>{t("tools.copyReport")}</Button>
                <Button icon={Icons.eye} onClick={() => openModal({ title: t("tools.diagnostics"), body: <pre className="nc-code">{diagnostics()}</pre>, medium: true })}>{t("tools.viewReport")}</Button>
            </div>

            <h3 className="nc-section-title">{t("tools.developer")}</h3>
            <div className="nc-row-wrap">
                <Button onClick={() => Native.window.action("devtools")}>{t("tools.devtools")}</Button>
                <Button onClick={() => Native.window.action("reload")}>{t("tools.reload")}</Button>
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("data")}>{t("perf.openDataFolder")}</Button>
            </div>
            <div className="nc-card">
                <div className="nc-card-title">{t("tools.explorer")}</div>
                {ModuleExplorer()}
            </div>
        </div>
    );
});

export function ToolsPage(): Node {
    view.redraw();
    return view.host;
}
