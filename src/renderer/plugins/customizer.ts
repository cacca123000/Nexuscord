/* Customizer (#4): accent colour, roundness, density and text size - no CSS needed. */
import { setStyle } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "customizer";

function shade(hex: string, pct: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct < 0 ? c : 255 - c))));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(c => c.toString(16).padStart(2, "0")).join("");
}

export function buildCustomizerCss(o: { useAccent: boolean; accent: string; radius: number; density: string; fontScale: number }): string {
    let css = "";
    if (o.useAccent && /^#[0-9a-f]{6}$/i.test(o.accent)) {
        const a = o.accent, d = shade(a, -14), l = shade(a, 18);
        css += `:root,.theme-dark,.theme-light,.theme-darker,.theme-midnight{--brand-500:${a};--brand-560:${d};--brand-600:${shade(a, -22)};--brand-360:${l};--brand-experiment:${a};--brand-experiment-560:${d};--brand-experiment-600:${shade(a, -22)};--bg-brand:${a};--text-brand:${l};--control-brand-foreground:${l};--control-brand-foreground-new:${l};--button-filled-brand-background:${a};--button-filled-brand-background-hover:${d};--nc-accent:${a}}`;
    }
    if (o.radius >= 0) {
        const r = o.radius;
        css += `:root{--radius-xs:${Math.round(r / 3)}px;--radius-sm:${Math.round(r / 2)}px;--radius-md:${r}px;--radius-lg:${Math.round(r * 1.5)}px;--radius-xl:${r * 2}px}`;
        css += `[class*="embedFull"],[class*="imageWrapper"],[class*="attachment"],[class*="codeBlock"],pre code,[class*="card_"]{border-radius:${r}px!important}`;
    }
    if (o.density === "compact") {
        css += `li[id^="chat-messages-"] [class*="cozy"]{padding-top:.08rem!important;padding-bottom:.08rem!important;min-height:1.6rem!important}li[id^="chat-messages-"] [class*="groupStart"]{margin-top:.55rem!important}[data-list-item-id^="channels___"]{min-height:28px}`;
    } else if (o.density === "spacious") {
        css += `li[id^="chat-messages-"] [class*="cozy"]{padding-top:.3rem!important;padding-bottom:.3rem!important}li[id^="chat-messages-"] [class*="groupStart"]{margin-top:1.6rem!important}`;
    }
    if (o.fontScale && o.fontScale !== 100) css += `html{font-size:${o.fontScale}%!important}`;
    return css;
}

function apply() {
    setStyle(
        "nc-customizer",
        buildCustomizerCss({
            useAccent: !!getOption(ID, "useAccent"),
            accent: String(getOption(ID, "accent")),
            radius: getOption<boolean>(ID, "useRadius") ? Number(getOption(ID, "radius")) : -1,
            density: String(getOption(ID, "density")),
            fontScale: Number(getOption(ID, "fontScale"))
        }) || null
    );
}

export default definePlugin({
    id: ID,
    name: "plugin.customizer.name",
    description: "plugin.customizer.desc",
    category: "appearance",
    options: {
        useAccent: { type: "boolean", label: "plugin.customizer.opt.useAccent", default: false },
        accent: { type: "color", label: "plugin.customizer.opt.accent", default: "#7c5cff" },
        useRadius: { type: "boolean", label: "plugin.customizer.opt.useRadius", default: false },
        radius: { type: "slider", label: "plugin.customizer.opt.radius", default: 8, min: 0, max: 24, unit: "px" },
        density: {
            type: "select",
            label: "plugin.customizer.opt.density",
            default: "default",
            options: [
                { label: "plugin.customizer.density.default", value: "default" },
                { label: "plugin.customizer.density.compact", value: "compact" },
                { label: "plugin.customizer.density.spacious", value: "spacious" }
            ]
        },
        fontScale: { type: "slider", label: "plugin.customizer.opt.fontScale", default: 100, min: 80, max: 130, step: 5, unit: "%" }
    },
    start: apply,
    stop: () => setStyle("nc-customizer", null),
    onOptionChange: apply
});
