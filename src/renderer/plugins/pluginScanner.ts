/*
 * BetterDiscord plugin guard (#17): static risk scan of every .plugin.js (shown on its
 * card, high-risk plugins are not auto-started) + a runtime guard that refuses to give
 * your account token to code running from a BD plugin file.
 */
import { setStartGuard } from "../core/bdCompat";
import { t } from "../core/i18n";
import { Patcher } from "../core/patcher";
import { calledFromBdPlugin, scanPlugin } from "../core/pluginScanner";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";
import { addCodePatch, filters, waitFor } from "../core/webpack";

const ID = "pluginScanner";
let stopWait = () => {};
const warned = new Set<string>();
let patchInstalled = false;

function pluginFromStack(): string {
    return /betterdiscord:\/\/plugins\/([^:)\s]+)/.exec(new Error().stack ?? "")?.[1] ?? "?";
}

export default definePlugin({
    id: ID,
    name: "plugin.pluginScanner.name",
    description: "plugin.pluginScanner.desc",
    category: "privacy",
    options: {
        blockHighRisk: { type: "boolean", label: "plugin.pluginScanner.opt.blockHighRisk", default: true },
        tokenGuard: { type: "boolean", label: "plugin.pluginScanner.opt.tokenGuard", default: true }
    },
    start() {
        setStartGuard(p => {
            if (!getOption(ID, "blockHighRisk")) return true;
            const scan = scanPlugin(p.source);
            if (scan.risk !== "high") return true;
            toast(t("plugin.pluginScanner.blocked", { name: p.meta.name }), "error", 8000);
            return false;
        });
        // Discord's token manager exports getToken as a READ-ONLY binding (verified on the
        // real client), so it is wrapped at module-load time with a code patch instead.
        (window as any).$NexusCordGuardToken = () => {
            if (!getOption(ID, "tokenGuard") || !calledFromBdPlugin()) return false;
            const name = decodeURIComponent(pluginFromStack());
            if (!warned.has(name)) {
                warned.add(name);
                toast(t("plugin.pluginScanner.tokenBlocked", { name }), "error", 10000);
            }
            return true;
        };
        if (!patchInstalled) {
            patchInstalled = true;
            addCodePatch({
                owner: ID,
                find: ['"dQw4w9WgXcQ:"', "getToken:"],
                replacement: [{ match: /getToken:([\w$]+)([,}])/, replace: "getToken:(...a)=>(window.$NexusCordGuardToken?.()?void 0:$1(...a))$2" }]
            });
        }
        // The AuthenticationStore instance method is patchable at runtime too
        stopWait = waitFor(filters.byStoreName("AuthenticationStore"), store => {
            if (typeof store.getToken !== "function") return;
            Patcher.instead(ID, store, "getToken", (self, args, original) => ((window as any).$NexusCordGuardToken?.() ? undefined : original.apply(self, args)));
        }, ID);
    },
    stop() {
        stopWait();
        setStartGuard(null);
    }
});
