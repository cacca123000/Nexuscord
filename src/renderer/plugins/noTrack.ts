/*
 * NoTrack - zero telemetry.
 * Renderer side: fetch / XHR / sendBeacon to /science, /track, /metrics and
 * Sentry are answered locally with an empty 204 and never leave the machine.
 * Main side (src/main/webRequest.ts) blocks the same URLs at the network
 * layer as a second line of defense. Sentry's client is also shut down.
 */
import { Logger } from "../core/logger";
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";

const log = new Logger("NoTrack");
const ID = "noTrack";

const BLOCKED = [
    /\/api\/v\d+\/(?:science|track|metrics)(?:[/?#]|$)/,
    /\/error-reporting-proxy\//,
    /^https?:\/\/(?:[\w-]+\.)*sentry\.io\//
];

export function isTelemetryUrl(url: unknown): boolean {
    if (typeof url !== "string") {
        if (url instanceof URL) url = url.href;
        else if (url instanceof Request) url = url.url;
        else return false;
    }
    return BLOCKED.some(r => r.test(url as string));
}

let blockedCount = 0;

function fakeXhrSuccess(xhr: XMLHttpRequest) {
    setTimeout(() => {
        for (const [k, v] of Object.entries({ readyState: 4, status: 204, statusText: "No Content", responseText: "", response: "" })) {
            Object.defineProperty(xhr, k, { value: v, configurable: true });
        }
        for (const type of ["readystatechange", "load", "loadend"]) {
            try {
                xhr.dispatchEvent(new ProgressEvent(type));
            } catch { /* ignore */ }
        }
    }, 0);
}

function neuterSentry(sentry: any) {
    try {
        const hubs = [sentry?.hub, ...Object.values(sentry ?? {}).map((v: any) => v?.defaultCurrentScope ?? v?.hub)];
        for (const hub of hubs) {
            const client = hub?.getClient?.();
            if (!client) continue;
            const opts = client.getOptions?.();
            if (opts) {
                opts.enabled = false;
                opts.sampleRate = 0;
                opts.tracesSampleRate = 0;
                opts.beforeSend = () => null;
            }
            client.close?.(0);
        }
    } catch (e) {
        log.warn("Could not shut down Sentry client", e);
    }
}

let sentryValue: unknown;
let sentryTrapInstalled = false;

export default definePlugin({
    id: ID,
    name: "plugin.noTrack.name",
    description: "plugin.noTrack.desc",
    authors: ["NexusCord"],

    start() {
        const xhrUrls = new WeakMap<XMLHttpRequest, string>();
        Patcher.before(ID, XMLHttpRequest.prototype, "open", (xhr, args) => {
            xhrUrls.set(xhr, String(args[1]));
        });
        Patcher.instead(ID, XMLHttpRequest.prototype, "send", (xhr, args, original) => {
            if (isTelemetryUrl(xhrUrls.get(xhr))) {
                blockedCount++;
                return fakeXhrSuccess(xhr);
            }
            return original(...args);
        });
        Patcher.instead(ID, window, "fetch", (_self, args, original) => {
            if (isTelemetryUrl(args[0])) {
                blockedCount++;
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            return original(...args);
        });
        if (typeof navigator.sendBeacon === "function") {
            Patcher.instead(ID, navigator, "sendBeacon", (_self, args, original) => {
                if (isTelemetryUrl(args[0])) {
                    blockedCount++;
                    return true;
                }
                return original(...args);
            });
        }

        // Sentry: shut down an existing client, or trap the global so the
        // client is disabled the moment Discord creates it.
        const w = window as any;
        if (w.__SENTRY__) neuterSentry(w.__SENTRY__);
        else if (!sentryTrapInstalled) {
            sentryTrapInstalled = true;
            try {
                Object.defineProperty(w, "__SENTRY__", {
                    configurable: true,
                    get: () => sentryValue,
                    set: v => {
                        sentryValue = v;
                        setTimeout(() => neuterSentry(v), 0);
                    }
                });
            } catch { /* already defined non-configurable */ }
        }
        if (w.DiscordSentry) neuterSentry({ hub: w.DiscordSentry });
    },

    stop() {
        // Patches are removed by the plugin manager (caller id = plugin id).
        log.info(`Blocked ${blockedCount} telemetry requests this session`);
    }
});
