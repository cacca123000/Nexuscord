/* First-run setup wizard (#11): language + a preset of features, then a tour pointer. */
import { h } from "./dom";
import { t, TranslationKey } from "./i18n";
import { getPlugins, isEnabled, setPluginEnabled } from "./pluginManager";
import { Settings } from "./settings";
import { openSettings } from "./settingsUI";
import { openModal, Select, toast } from "./ui";

export const PRESETS: Record<string, { label: TranslationKey; desc: TranslationKey; plugins: string[] }> = {
    balanced: {
        label: "onboarding.preset.balanced",
        desc: "onboarding.preset.balancedDesc",
        plugins: ["noTrack", "linkShield", "lowRamOptimizer", "windowTweaks", "betterCodeBlocks", "imageViewer", "clearUrlsOutgoing", "uploadPrivacy", "pluginScanner", "scamGuard", "accountAge", "copyTools", "commandPalette", "customizer", "declutter", "platformIndicators", "safeModeGuard"]
    },
    privacy: {
        label: "onboarding.preset.privacy",
        desc: "onboarding.preset.privacyDesc",
        plugins: ["noTrack", "linkShield", "silentTyping", "uploadPrivacy", "clearUrlsOutgoing", "scamGuard", "pluginScanner", "appLock", "streamerPlus", "accountAge", "safeModeGuard", "commandPalette"]
    },
    performance: {
        label: "onboarding.preset.performance",
        desc: "onboarding.preset.performanceDesc",
        plugins: ["noTrack", "linkShield", "lowRamOptimizer", "declutter", "liteMode", "dataSaver", "safeModeGuard", "commandPalette"]
    },
    power: {
        label: "onboarding.preset.power",
        desc: "onboarding.preset.powerDesc",
        plugins: ["noTrack", "linkShield", "lowRamOptimizer", "windowTweaks", "betterCodeBlocks", "imageViewer", "clearUrlsOutgoing", "uploadPrivacy", "pluginScanner", "scamGuard", "accountAge", "copyTools", "commandPalette", "customizer", "declutter", "platformIndicators", "translate", "bookmarks", "messageLogger", "keywordAlerts", "betterTimestamps", "timezoneConverter", "doubleClickActions", "pinDms", "readAllButton", "relationshipNotifier", "textSnippets", "volumeBooster", "pictureInPicture", "mediaDownloader", "safeModeGuard", "friendOnline", "wrapped"]
    }
};

export function applyPreset(name: keyof typeof PRESETS) {
    const want = new Set(PRESETS[name].plugins);
    for (const p of getPlugins()) {
        if (p.required) continue;
        const on = want.has(p.id);
        if (isEnabled(p.id) !== on) setPluginEnabled(p.id, on);
    }
}

export function openOnboarding() {
    let preset: keyof typeof PRESETS = "balanced";
    const cards = h("div", { className: "nc-grid", style: "grid-template-columns:repeat(2,1fr)" });
    const drawCards = () =>
        cards.replaceChildren(
            ...Object.entries(PRESETS).map(([id, p]) =>
                h(
                    "div",
                    { className: `nc-card interactive${preset === id ? " on" : ""}`, style: "cursor:pointer", onClick: () => ((preset = id as keyof typeof PRESETS), drawCards()) },
                    h("div", { className: "nc-card-title" }, t(p.label)),
                    h("div", { className: "nc-card-desc" }, t(p.desc)),
                    h("div", { className: "nc-card-foot" }, h("span", { className: "nc-tag accent" }, t("onboarding.features", { n: p.plugins.length })))
                )
            )
        );
    drawCards();
    const body = h(
        "div",
        { className: "nc-stack", style: "gap:14px" },
        h("p", { style: "margin:0" }, t("onboarding.intro")),
        h("h3", { className: "nc-section-title" }, t("perf.language")),
        Select({
            value: Settings.get().language,
            options: [
                { value: "auto", label: t("perf.lang.auto") },
                { value: "en", label: "English" },
                { value: "it", label: "Italiano" },
                { value: "es", label: "Español" },
                { value: "fr", label: "Français" },
                { value: "de", label: "Deutsch" },
                { value: "pt", label: "Português" }
            ],
            onChange: v => Settings.update(s => void (s.language = v as typeof s.language))
        }),
        h("h3", { className: "nc-section-title" }, t("onboarding.choosePreset")),
        cards,
        h("p", { className: "nc-sub" }, t("onboarding.later"))
    );
    openModal({
        title: t("onboarding.title"),
        body,
        medium: true,
        onClose: () => Settings.update(s => void (s.onboardingDone = true)),
        buttons: [
            { label: t("onboarding.skip"), variant: "ghost" },
            {
                label: t("onboarding.apply"),
                variant: "primary",
                onClick: () => {
                    applyPreset(preset);
                    toast(t("onboarding.done"), "success", 6000);
                    setTimeout(() => openSettings("home"), 300);
                }
            }
        ]
    });
}
