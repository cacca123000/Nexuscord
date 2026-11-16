/* Silent messages: send without notifying anyone (Discord's @silent), always or toggled by a keybind. */
import { h, setStyle } from "../core/dom";
import { t } from "../core/i18n";
import { onKeybind } from "../core/keybind";
import { addPreSendHook } from "../core/outgoing";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";
import { addCommands } from "./commandPalette";

const ID = "silentMessages";
const cleanups: (() => void)[] = [];
let active = false;
let badge: HTMLElement | null = null;

function setActive(v: boolean) {
    active = v;
    badge?.remove();
    badge = null;
    if (v && !getOption(ID, "always")) {
        badge = h("div", { className: "nc-silent-badge", title: t("plugin.silentMessages.badgeHint") }, t("plugin.silentMessages.badge"));
        document.body.appendChild(badge);
    }
}

export function toggleSilent() {
    setActive(!active);
    toast(t(active ? "plugin.silentMessages.on" : "plugin.silentMessages.off"), "info", 1800);
}

addCommands(() => [{ icon: "bellOff", label: t("plugin.silentMessages.toggle"), kind: t("palette.kind.action"), run: toggleSilent }]);

export default definePlugin({
    id: ID,
    name: "plugin.silentMessages.name",
    description: "plugin.silentMessages.desc",
    category: "chat",
    options: {
        always: { type: "boolean", label: "plugin.silentMessages.opt.always", default: false },
        keybind: { type: "keybind", label: "plugin.silentMessages.opt.keybind", default: "Ctrl+Shift+S" }
    },
    start() {
        setStyle(ID, ".nc-silent-badge{position:fixed;right:16px;bottom:76px;z-index:1000;padding:4px 10px;border-radius:6px;background:var(--background-base-lowest,#111214);color:var(--text-default,#dbdee1);font:600 12px var(--font-primary,sans-serif);border:1px solid var(--border-subtle,#3f4147);pointer-events:none}");
        cleanups.push(onKeybind(() => String(getOption(ID, "keybind")), toggleSilent));
        cleanups.push(
            addPreSendHook(ID, ({ message, edit }) => {
                if (edit || !(active || getOption(ID, "always"))) return;
                if (!message.content.trim() || /^@silent\b/.test(message.content) || message.content.startsWith("/")) return;
                message.content = "@silent " + message.content;
            }, 90)
        );
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setActive(false);
        setStyle(ID, null);
    }
});
