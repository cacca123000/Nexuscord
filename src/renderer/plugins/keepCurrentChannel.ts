/* Keep current channel: after a reload or reconnect you land where you were, not on Home. */
import { NavigationRouter } from "../core/discord";
import { subscribe } from "../core/flux";
import { definePlugin } from "../core/pluginManager";

const ID = "keepCurrentChannel";
const KEY = "nc-last-channel-path";
const cleanups: (() => void)[] = [];

function save() {
    const p = location.pathname;
    if (/^\/channels\/(@me|\d+)\/\d+/.test(p)) {
        try {
            localStorage.setItem(KEY, p);
        } catch { /* storage blocked */ }
    }
}

function restore() {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(KEY);
    } catch { /* ignore */ }
    if (saved && saved !== location.pathname && /^\/channels\/@me\/?$|^\/app\/?$|^\/channels\/@me$/.test(location.pathname)) {
        try {
            NavigationRouter.transitionTo?.(saved);
        } catch { /* channel gone */ }
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.keepCurrentChannel.name",
    description: "plugin.keepCurrentChannel.desc",
    category: "utility",
    start() {
        cleanups.push(subscribe("CHANNEL_SELECT", () => setTimeout(save, 0)));
        cleanups.push(subscribe("CONNECTION_OPEN", () => setTimeout(restore, 300)));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
    }
});
