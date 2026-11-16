/*
 * WindowTweaks (TesCord-style QoL)
 *  - Keeps -webkit-app-region: drag on Discord's custom titlebar (and no-drag on
 *    its buttons) so the frameless window can always be moved
 *  - Optional Windows 11 acrylic transparency
 *  - "Copy User ID / Message ID / Channel ID / Raw JSON" context menu items
 */
import { onDomReady, setStyle } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "windowTweaks";
const cleanups: (() => void)[] = [];

const DRAG_CSS = `
[class*="titleBar"], [class^="bar_"]:has([class*="winButton"]), [class*=" bar_"]:has([class*="winButton"]) { -webkit-app-region: drag; }
[class*="titleBar"] :is([class*="winButton"], button, a, input, [role="button"], [class*="trailing"] > *, [class*="leading"] > *),
[class^="bar_"] :is([class*="winButton"], button, a, input, [role="button"], [class*="trailing"] > *) { -webkit-app-region: no-drag; }
`;

/** Makes Discord's surfaces translucent so Mica/Acrylic (Appearance > Window) shows through. */
const ACRYLIC_CSS = `
html.nc-acrylic, html.nc-acrylic body, html.nc-acrylic #app-mount, html.nc-acrylic [class*="appMount"] { background: transparent !important; }
html.nc-acrylic .theme-dark, html.nc-acrylic.theme-dark {
  --background-primary: rgba(49, 51, 56, .72); --background-secondary: rgba(43, 45, 49, .62);
  --background-secondary-alt: rgba(35, 36, 40, .62); --background-tertiary: rgba(30, 31, 34, .55);
  --background-base-lowest: rgba(30, 31, 34, .5); --background-base-lower: rgba(35, 36, 40, .58);
  --background-base-low: rgba(43, 45, 49, .62); --background-surface-high: rgba(49, 51, 56, .7);
  --bg-base-primary: rgba(49, 51, 56, .72); --bg-base-secondary: rgba(43, 45, 49, .62); --bg-base-tertiary: rgba(30, 31, 34, .55);
  --chat-background: rgba(49, 51, 56, .5);
}
`;

export default definePlugin({
    id: ID,
    name: "plugin.windowTweaks.name",
    description: "plugin.windowTweaks.desc",
    category: "appearance",
    authors: ["NexusCord"],
    options: {
        fixDrag: { type: "boolean", label: "plugin.windowTweaks.opt.fixDrag", default: true },
        translucent: { type: "boolean", label: "plugin.windowTweaks.opt.translucent", hint: "plugin.windowTweaks.opt.translucentHint", default: false }
    },

    start() {
        const apply = () => {
            setStyle("nc-window-drag", getOption(ID, "fixDrag") ? DRAG_CSS : null);
            const tr = !!getOption(ID, "translucent");
            setStyle("nc-window-acrylic", tr ? ACRYLIC_CSS : null);
            document.documentElement?.classList.toggle("nc-acrylic", tr);
        };
        onDomReady(apply);
        cleanups.push(() => {
            for (const id of ["nc-window-drag", "nc-window-acrylic"]) setStyle(id, null);
            document.documentElement?.classList.remove("nc-acrylic");
        });
    },

    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
