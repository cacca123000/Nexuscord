/* Theme scheduler (#7): switch between a day and a night theme automatically. */
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { definePlugin, getOption, setOption } from "../core/pluginManager";
import { ThemeEngine } from "../core/themeEngine";
import { Select, SettingRow } from "../core/ui";

const ID = "themeScheduler";
let timer: ReturnType<typeof setInterval> | null = null;

const minutes = (hhmm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function isNight(now: Date, dayStart: string, nightStart: string): boolean {
    const n = now.getHours() * 60 + now.getMinutes();
    const d = minutes(dayStart), x = minutes(nightStart);
    if (isNaN(d) || isNaN(x)) return false;
    return d < x ? n < d || n >= x : n >= x && n < d;
}

function tick() {
    const mode = String(getOption(ID, "mode"));
    const night = mode === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : isNight(new Date(), String(getOption(ID, "dayStart")), String(getOption(ID, "nightStart")));
    const day = String(getOption(ID, "dayTheme") || ""), nightTheme = String(getOption(ID, "nightTheme") || "");
    const want = night ? nightTheme : day;
    const other = night ? day : nightTheme;
    if (other && other !== want && ThemeEngine.isEnabled(other)) ThemeEngine.setEnabled(other, false);
    if (want && !ThemeEngine.isEnabled(want)) ThemeEngine.setEnabled(want, true);
}

function Panel(): Node {
    const themes = [{ value: "", label: t("plugin.themeScheduler.none") }, ...ThemeEngine.getThemes().map(th => ({ value: th.file, label: th.meta.name }))];
    return h(
        "div",
        { className: "nc-stack" },
        SettingRow({ label: t("plugin.themeScheduler.day"), control: Select({ value: String(getOption(ID, "dayTheme") || ""), options: themes, onChange: v => setOption(ID, "dayTheme", v) }) }),
        SettingRow({ label: t("plugin.themeScheduler.night"), control: Select({ value: String(getOption(ID, "nightTheme") || ""), options: themes, onChange: v => setOption(ID, "nightTheme", v) }) })
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.themeScheduler.name",
    description: "plugin.themeScheduler.desc",
    category: "appearance",
    options: {
        mode: {
            type: "select",
            label: "plugin.themeScheduler.opt.mode",
            default: "time",
            options: [
                { label: "plugin.themeScheduler.mode.time", value: "time" },
                { label: "plugin.themeScheduler.mode.system", value: "system" }
            ]
        },
        dayStart: { type: "string", label: "plugin.themeScheduler.opt.dayStart", default: "07:30", placeholder: "07:30" },
        nightStart: { type: "string", label: "plugin.themeScheduler.opt.nightStart", default: "20:00", placeholder: "20:00" }
    },
    settingsPanel: Panel,
    start() {
        tick();
        timer = setInterval(tick, 60_000);
    },
    stop() {
        if (timer) clearInterval(timer);
        timer = null;
    },
    onOptionChange: tick
});
