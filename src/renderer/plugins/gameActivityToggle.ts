/* Game activity toggle: hide/show "Playing ..." with one shortcut or from the command palette. */
import { t } from "../core/i18n";
import { onKeybind } from "../core/keybind";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";
import { addCodePatch } from "../core/webpack";
import { addCommands } from "./commandPalette";

const ID = "gameActivityToggle";
let off = () => {};

// Discord keeps the setting object private; expose it as soon as its module loads.
// Registered at import time so it applies even if the plugin is enabled later.
addCodePatch({
    owner: "NexusCord:GameActivityToggle",
    find: '"status","showCurrentGame"',
    replacement: [{ match: /([\w$]+=)(\(0,[\w$]+\.[\w$]+\)\("status","showCurrentGame")/, replace: "$1window.$NexusCordShowGame=$2" }]
});

const setting = () => (window as any).$NexusCordShowGame as { getSetting(): boolean; updateSetting(v: boolean): unknown } | undefined;

export function toggleGameActivity() {
    const s = setting();
    if (!s) return toast(t("plugin.gameActivityToggle.unavailable"), "error");
    const next = !s.getSetting();
    s.updateSetting(next);
    toast(t(next ? "plugin.gameActivityToggle.shown" : "plugin.gameActivityToggle.hidden"), "info", 2000);
}

addCommands(() => (setting() ? [{ icon: "gamepad", label: t("plugin.gameActivityToggle.toggle"), kind: t("palette.kind.action"), run: toggleGameActivity }] : []));

export default definePlugin({
    id: ID,
    name: "plugin.gameActivityToggle.name",
    description: "plugin.gameActivityToggle.desc",
    category: "utility",
    options: { keybind: { type: "keybind", label: "plugin.gameActivityToggle.opt.keybind", default: "Ctrl+Shift+G" } },
    start() {
        off = onKeybind(() => String(getOption(ID, "keybind")), toggleGameActivity);
    },
    stop() {
        off();
    }
});
