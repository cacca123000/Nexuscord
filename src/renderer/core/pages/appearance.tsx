/* Appearance page: customizer, fonts, background, scheduler, window & icons, language. */
import { createView, h, Fragment } from "../dom";
import { t } from "../i18n";
import { Native } from "../native";
import { onPageCleanup } from "../settingsUI";
import { Settings } from "../settings";
import { Button, ColorInput, Icons, Select, SettingRow, Slider, toast } from "../ui";
import { PluginBlock } from "./common";
import type { WindowSettings } from "../../../shared/settings";
void h;
void Fragment;

function setWindow(patch: Partial<WindowSettings>) {
    Settings.update(s => Object.assign(s.window, patch));
    Native.window?.applySettings?.();
}

async function pickFile(kind: "image", copyAs: string, apply: (path: string) => void) {
    const f = await Native.files.pick({ kind, copyAs });
    if (f) {
        apply(f.path);
        toast(t("appearance.saved"), "success", 1800);
    }
}

function WindowCard(redraw: () => void) {
    const w = Settings.get().window;
    const isWin = Native.platform === "win32";
    return (
        <div className="nc-stack">
            <SettingRow label={t("appearance.opacity")} hint={t("appearance.opacityHint")} control={<Slider value={Math.round(w.opacity * 100)} min={30} max={100} unit="%" onChange={v => setWindow({ opacity: v / 100 })} />} />
            <SettingRow
                label={t("appearance.material")}
                hint={isWin ? t("appearance.materialHint") : t("appearance.windowsOnly")}
                control={
                    <Select
                        value={w.material}
                        options={[
                            { value: "none", label: t("appearance.material.none") },
                            { value: "mica", label: "Mica" },
                            { value: "acrylic", label: "Acrylic" },
                            { value: "tabbed", label: "Mica Alt" }
                        ]}
                        onChange={v => setWindow({ material: v as WindowSettings["material"] })}
                    />
                }
            />
            <SettingRow
                label={t("appearance.appIcon")}
                hint={w.customIcon ? w.customIcon.split(/[\\/]/).pop() : t("appearance.default")}
                control={
                    <span className="nc-row-wrap">
                        <Button onClick={() => pickFile("image", "app-icon", p => (setWindow({ customIcon: p }), redraw()))}>{t("appearance.choose")}</Button>
                        {w.customIcon ? <Button variant="ghost" onClick={() => (setWindow({ customIcon: "" }), redraw())}>{t("appearance.reset")}</Button> : null}
                    </span>
                }
            />
            <SettingRow
                label={t("appearance.trayIcon")}
                hint={w.customTrayIcon ? w.customTrayIcon.split(/[\\/]/).pop() : t("appearance.trayHint")}
                control={
                    <span className="nc-row-wrap">
                        <Button onClick={() => pickFile("image", "tray-icon", p => (setWindow({ customTrayIcon: p }), redraw()))}>{t("appearance.choose")}</Button>
                        {w.customTrayIcon ? <Button variant="ghost" onClick={() => (setWindow({ customTrayIcon: "" }), redraw())}>{t("appearance.reset")}</Button> : null}
                    </span>
                }
            />
            <SettingRow
                label={t("appearance.splash")}
                hint={t("appearance.splashHint")}
                control={
                    <span className="nc-row-wrap">
                        <ColorInput value={w.splashColor || "#1e1f22"} onChange={v => setWindow({ splashColor: v })} />
                        <Button onClick={() => pickFile("image", "splash", p => (setWindow({ splashImage: p }), redraw()))}>{t("appearance.image")}</Button>
                        {w.splashColor || w.splashImage ? <Button variant="ghost" onClick={() => (setWindow({ splashColor: "", splashImage: "" }), redraw())}>{t("appearance.reset")}</Button> : null}
                    </span>
                }
            />
        </div>
    );
}

const view = createView(() => {
    const s = Settings.get();
    return (
        <div className="nc-stack" style="gap:14px">
            <h3 className="nc-section-title">{t("appearance.style")}</h3>
            {PluginBlock("customizer")}
            {PluginBlock("customFonts")}
            {PluginBlock("backgroundImage")}
            {PluginBlock("themeScheduler")}
            <h3 className="nc-section-title">{t("appearance.window")}</h3>
            {WindowCard(view.redraw)}
            {PluginBlock("windowTweaks")}
            <h3 className="nc-section-title">{t("appearance.general")}</h3>
            <SettingRow
                label={t("perf.language")}
                hint={t("perf.languageHint")}
                control={
                    <Select
                        value={s.language}
                        options={[
                            { value: "auto", label: t("perf.lang.auto") },
                            { value: "en", label: "English" },
                            { value: "it", label: "Italiano" },
                            { value: "es", label: "Español" },
                            { value: "fr", label: "Français" },
                            { value: "de", label: "Deutsch" },
                            { value: "pt", label: "Português" }
                        ]}
                        onChange={v => Settings.update(st => void (st.language = v as typeof st.language))}
                    />
                }
            />
            <SettingRow
                label={t("appearance.location")}
                hint={t("appearance.locationHint")}
                control={
                    <Select
                        value={s.settingsLocation}
                        options={[
                            { value: "top", label: t("appearance.location.top") },
                            { value: "aboveUtility", label: t("appearance.location.aboveUtility") },
                            { value: "bottom", label: t("appearance.location.bottom") }
                        ]}
                        onChange={v => Settings.update(st => void (st.settingsLocation = v as typeof st.settingsLocation))}
                    />
                }
            />
            {PluginBlock("commandPalette")}
        </div>
    );
});

export function AppearancePage(): Node {
    view.redraw();
    void onPageCleanup;
    void Icons;
    return view.host;
}
