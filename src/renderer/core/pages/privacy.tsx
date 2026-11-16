/* Privacy & Security page: LinkShield dashboard + every privacy/security feature inline. */
import { h, Fragment } from "../dom";
import { getLanguage, t, TranslationKey } from "../i18n";
import { Native } from "../native";
import { Settings } from "../settings";
import { Button, Icons } from "../ui";
import { PluginBlock, relTime } from "./common";
void h;
void Fragment;

export function PrivacyPage(): Node {
    const stats = Settings.get().linkShieldStats;
    const list = <small>…</small>;
    const update = (st: { count: number; updatedAt: number }) =>
        (list.textContent = t("perf.blacklistInfo", { count: st.count.toLocaleString(getLanguage()), when: relTime(st.updatedAt) }));
    Native.linkShield.status().then(update).catch(() => {});
    const stat = (value: number, label: TranslationKey) => (
        <div className="nc-stat">
            <b>{value.toLocaleString(getLanguage())}</b>
            <span>{t(label)}</span>
        </div>
    );
    return (
        <>
            <h3 className="nc-section-title">LinkShield</h3>
            <div className="nc-stats">
                {stat(stats.phishingBlocked, "perf.stat.phishing")}
                {stat(stats.spoofsBlocked, "perf.stat.spoofs")}
                {stat(stats.typosquatsFlagged, "perf.stat.typosquats")}
                {stat(stats.trackersStripped, "perf.stat.trackers")}
                {stat(stats.linksUnshortened, "perf.stat.unshortened")}
                {stat(stats.executablesIntercepted, "perf.stat.executables")}
            </div>
            <div className="nc-row">
                <div className="nc-row-label">
                    {t("perf.blacklist")}
                    {list}
                </div>
                <Button
                    icon={Icons.refresh}
                    onClick={async () => {
                        list.textContent = "…";
                        update(await Native.linkShield.refresh());
                    }}
                >
                    {t("perf.refreshList")}
                </Button>
            </div>
            {PluginBlock("linkShield")}
            <h3 className="nc-section-title">{t("privacy.account")}</h3>
            {PluginBlock("appLock")}
            {PluginBlock("scamGuard")}
            {PluginBlock("pluginScanner")}
            <h3 className="nc-section-title">{t("privacy.privacy")}</h3>
            {PluginBlock("noTrack")}
            {PluginBlock("silentTyping")}
            {PluginBlock("uploadPrivacy")}
            {PluginBlock("clearUrlsOutgoing")}
            {PluginBlock("streamerPlus")}
            <h3 className="nc-section-title">{t("privacy.visibility")}</h3>
            {PluginBlock("showHiddenChannels")}
        </>
    );
}
