/* Silent typing (#14): others never see "… is typing". Per-channel exceptions supported. */
import { addCommands } from "./commandPalette";
import { TypingActions } from "../core/discord";
import { t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { definePlugin, getOption, setOption } from "../core/pluginManager";
import { toast } from "../core/ui";
import { waitForProps } from "../core/webpack";

const ID = "silentTyping";
let stopWait = () => {};

addCommands(() => [
    {
        icon: "🤫",
        label: t("plugin.silentTyping.toggle"),
        kind: t("palette.kind.action"),
        run: () => {
            const v = !getOption(ID, "active");
            setOption(ID, "active", v);
            toast(t(v ? "plugin.silentTyping.on" : "plugin.silentTyping.off"), "info", 1800);
        }
    }
]);

export default definePlugin({
    id: ID,
    name: "plugin.silentTyping.name",
    description: "plugin.silentTyping.desc",
    category: "privacy",
    options: {
        active: { type: "boolean", label: "plugin.silentTyping.opt.active", default: true },
        allowIn: { type: "string", label: "plugin.silentTyping.opt.allowIn", hint: "plugin.silentTyping.opt.allowInHint", default: "", placeholder: "123456789012345678, …" }
    },
    start() {
        stopWait = waitForProps(["startTyping", "stopTyping"], mod => {
            Patcher.instead(ID, mod, "startTyping", (self, args, original) => {
                const channelId = String(args[0] ?? "");
                const allowed = String(getOption(ID, "allowIn") || "").split(/[\s,]+/).filter(Boolean);
                if (getOption(ID, "active") && !allowed.includes(channelId)) return;
                return original.apply(self, args);
            });
        }, ID);
        void TypingActions;
    },
    stop() {
        stopWait();
    },
    onOptionChange() { /* read live */ }
});
