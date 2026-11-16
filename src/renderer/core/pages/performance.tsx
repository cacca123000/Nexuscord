/* Performance page: live RAM dashboard + history chart, savings report, engine flags. */
import { h, Fragment } from "../dom";
import { svgIcon } from "../icons";
import { getLanguage, t, TranslationKey } from "../i18n";
import { Native } from "../native";
import { onPageCleanup } from "../settingsUI";
import { Settings } from "../settings";
import { Button, Icons, LineChart, Select, SettingRow, Switch, toast } from "../ui";
import { PluginBlock } from "./common";
import type { PerformanceSettings } from "../../../shared/settings";
void h;
void Fragment;

function perfSet<K extends keyof PerformanceSettings>(k: K, v: PerformanceSettings[K]) {
    Settings.update(s => void (s.performance[k] = v));
}

export function RamDashboard(): Node {
    const chartHost = <div />;
    const stats = <div className="nc-stats" />;
    const procs = <div className="nc-stack" />;
    const fmt = (n: number) => `${n.toLocaleString(getLanguage())} MB`;
    const draw = async () => {
        try {
            const [hist, now] = await Promise.all([Native.system?.memHistory?.() ?? [], Native.perf.memory()]);
            const heap = Native.perf.rendererMemory();
            const last = hist.slice(-120);
            const peak = Math.max(0, ...hist.map(x => x.total));
            const avg = hist.length ? Math.round(hist.reduce((a, x) => a + x.total, 0) / hist.length) : 0;
            stats.replaceChildren(
                ...[
                    [now.totalMB ? fmt(now.totalMB) : "—", t("perf.ramTotal")],
                    [fmt(Math.round(heap.heapUsed / 1048576)), t("perf.ramRenderer")],
                    [peak ? fmt(peak) : "—", t("perf.peak")],
                    [avg ? fmt(avg) : "—", t("perf.average")]
                ].map(([v, l]) => (
                    <div className="nc-stat">
                        <b>{v}</b>
                        <span>{l}</span>
                    </div>
                ))
            );
            chartHost.replaceChildren(
                last.length > 1 ? (
                    <LineChart
                        unit=" MB"
                        series={[
                            { label: t("perf.series.total"), color: "#e57a4c", values: last.map(x => x.total) },
                            { label: t("perf.series.renderer"), color: "#a3a6ad", values: last.map(x => x.renderer) },
                            { label: "GPU", color: "#3fb67a", values: last.map(x => x.gpu) }
                        ]}
                    />
                ) : (
                    <div className="nc-empty">{t("perf.collecting")}</div>
                )
            );
            procs.replaceChildren(
                ...((now.processes as { type: string; name?: string; mb: number }[]) ?? [])
                    .sort((a, b) => b.mb - a.mb)
                    .slice(0, 8)
                    .map(p => (
                        <div className="nc-row" style="padding:7px 12px">
                            <div className="nc-row-label" style="font-weight:400">{p.name || p.type}</div>
                            <span className="nc-tag">{p.type}</span>
                            <b style="min-width:80px;text-align:right">{fmt(p.mb)}</b>
                        </div>
                    ))
            );
        } catch { /* ignore */ }
    };
    draw();
    const iv = setInterval(draw, 5000);
    onPageCleanup(() => clearInterval(iv));
    return (
        <div className="nc-stack">
            {stats}
            <div className="nc-card">{chartHost}</div>
            <details className="nc-card">
                <summary style="cursor:pointer;color:var(--nc-text);font-weight:600">{t("perf.processes")}</summary>
                <div style="margin-top:8px">{procs}</div>
            </details>
        </div>
    );
}

async function savingsReport() {
    const before = Native.perf.rendererMemory().heapUsed;
    const beforeTotal = (await Native.perf.memory()).totalMB;
    await Native.perf.purgeCache();
    (window as any).gc?.();
    await new Promise(r => setTimeout(r, 2500));
    const after = Native.perf.rendererMemory().heapUsed;
    const afterTotal = (await Native.perf.memory()).totalMB;
    toast(t("perf.reportResult", { before: beforeTotal || Math.round(before / 1048576), after: afterTotal || Math.round(after / 1048576), saved: Math.max(0, (beforeTotal || 0) - (afterTotal || 0)) }), "success", 8000);
}

export function PerformancePage(): Node {
    const p = Settings.get().performance;
    const toggle = (k: "processPerSite" | "gpuRasterization" | "disableBackgroundTimerThrottling" | "startMinimized" | "trimWhenHidden", label: TranslationKey, hint?: TranslationKey) => (
        <SettingRow label={t(label)} hint={hint ? t(hint) : undefined} control={<Switch checked={p[k]} onChange={v => perfSet(k, v)} />} />
    );
    return (
        <>
            <h3 className="nc-section-title">{t("perf.ram")}</h3>
            {RamDashboard()}
            <div className="nc-row-wrap">
                <Button icon={Icons.trash} onClick={async () => (await Native.perf.purgeCache(), toast(t("perf.purged"), "success"))}>{t("perf.purge")}</Button>
                <Button icon={Icons.bolt} onClick={savingsReport}>{t("perf.report")}</Button>
                <Button
                    icon={svgIcon("chip")}
                    onClick={async () => {
                        const mb = await Native.perf.trimNow?.();
                        toast(mb ? t("perf.trimmed", { n: mb }) : t("perf.trimUnavailable"), mb ? "success" : "info");
                    }}
                >
                    {t("perf.trimNow")}
                </Button>
            </div>
            <h3 className="nc-section-title">{t("perf.optimizers")}</h3>
            {PluginBlock("lowRamOptimizer")}
            {PluginBlock("declutter")}
            {PluginBlock("liteMode")}
            {PluginBlock("dataSaver")}
            <h3 className="nc-section-title">{t("perf.engine")}</h3>
            <div className="nc-stack">
                <SettingRow
                    label={t("perf.memorySaver")}
                    hint={t("perf.memorySaverHint")}
                    control={
                        <Select
                            value={p.memorySaver}
                            options={[
                                { value: "off", label: t("perf.memorySaver.off") },
                                { value: "balanced", label: t("perf.memorySaver.balanced") },
                                { value: "aggressive", label: t("perf.memorySaver.aggressive") }
                            ]}
                            onChange={v => perfSet("memorySaver", v as any)}
                        />
                    }
                />
                {toggle("trimWhenHidden", "perf.trimWhenHidden", "perf.trimWhenHiddenHint")}
                <SettingRow
                    label={t("perf.maxOldSpace")}
                    hint={t("perf.maxOldSpaceHint")}
                    control={
                        <Select
                            value={p.maxOldSpaceSize}
                            options={[0, 384, 512, 768, 1024, 2048].map(v => ({ value: v, label: v ? `${v} MB` : t("perf.unlimited") }))}
                            onChange={v => perfSet("maxOldSpaceSize", Number(v))}
                        />
                    }
                />
                <SettingRow
                    label={t("perf.autoRestart")}
                    hint={t("perf.autoRestartHint")}
                    control={<Select value={p.autoRestartMB} options={[0, 600, 800, 1000, 1500].map(v => ({ value: v, label: v ? `> ${v} MB` : t("common.disabled") }))} onChange={v => perfSet("autoRestartMB", Number(v))} />}
                />
                {toggle("startMinimized", "perf.startMinimized", "perf.startMinimizedHint")}
                {toggle("processPerSite", "perf.processPerSite")}
                {toggle("gpuRasterization", "perf.gpuRaster")}
                {toggle("disableBackgroundTimerThrottling", "perf.bgThrottle", "perf.bgThrottleHint")}
                <div className="nc-row">
                    <div className="nc-row-label">{t("app.restartRequired")}</div>
                    <Button variant="primary" icon={Icons.refresh} onClick={() => Native.perf.relaunch()}>{t("app.restartNow")}</Button>
                </div>
            </div>
        </>
    );
}
