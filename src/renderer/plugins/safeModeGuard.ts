/*
 * Crash guard (#62): a BetterDiscord plugin that keeps throwing errors is disabled
 * automatically (with a notification); safe mode itself is handled by the injector.
 */
import { BdCompat } from "../core/bdCompat";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "safeModeGuard";
const errors = new Map<string, number[]>();

function attribute(stack: string | undefined): string | null {
    const m = /betterdiscord:\/\/plugins\/([^:)\s]+)/.exec(stack ?? "");
    return m ? decodeURIComponent(m[1]) : null;
}

function onError(e: ErrorEvent | PromiseRejectionEvent) {
    const err = "reason" in e ? e.reason : e.error;
    const file = attribute(err?.stack ?? (e as ErrorEvent).filename);
    if (!file || !BdCompat.isEnabled(file)) return;
    const now = Date.now();
    const list = (errors.get(file) ?? []).filter(x => now - x < 30_000);
    list.push(now);
    errors.set(file, list);
    if (list.length >= (Number(getOption(ID, "threshold")) || 8)) {
        errors.delete(file);
        BdCompat.setEnabled(file, false);
        toast(t("plugin.safeModeGuard.disabled", { name: file }), "error", 10000);
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.safeModeGuard.name",
    description: "plugin.safeModeGuard.desc",
    category: "utility",
    options: { threshold: { type: "number", label: "plugin.safeModeGuard.opt.threshold", default: 8, min: 3, max: 50 } },
    start() {
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onError);
    },
    stop() {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onError);
    }
});
