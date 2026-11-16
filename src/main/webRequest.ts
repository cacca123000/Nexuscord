/*
 * Electron allows exactly ONE onHeadersReceived / onBeforeRequest listener per
 * session. Discord registers its own, so instead of fighting over the slot we
 * install a master listener and transparently chain Discord's listener into it.
 */
import type {
    BeforeRequestListener,
    CallbackResponse,
    HeadersListener,
    HeadersReceivedResponse,
    Session,
    WebRequestFilter
} from "electron";

/** Converts a Chrome extension match pattern (e.g. *://*.discord.com/*) to a RegExp. */
export function matchPatternToRegExp(pattern: string): RegExp {
    if (pattern === "<all_urls>") return /^(?:https?|wss?|file|ftp):\/\//;
    const m = /^(\*|https?|wss?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)?(\/.*)$/.exec(pattern);
    if (!m) return /$^/;
    const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const scheme = m[1] === "*" ? "(?:https?|wss?)" : esc(m[1]);
    let host = m[2] ?? "";
    if (host === "*") host = "[^/]+";
    else if (host.startsWith("*.")) host = "(?:[^/]+\\.)?" + esc(host.slice(2));
    else host = esc(host);
    const path = m[3].split("*").map(esc).join(".*");
    return new RegExp(`^${scheme}://${host}(?::\\d+)?${path}$`);
}

function compileFilter(filter?: WebRequestFilter | null): ((url: string) => boolean) {
    if (!filter?.urls?.length) return () => true;
    const res = filter.urls.map(matchPatternToRegExp);
    return url => res.some(r => r.test(url));
}

type BlockPredicate = (url: string) => boolean;
type HeaderTransform = (url: string, headers: Record<string, string | string[]>) => void;

export interface WebRequestHooks {
    shouldBlock: BlockPredicate;
    transformHeaders: HeaderTransform;
}

export function installWebRequestHooks(ses: Session, hooks: WebRequestHooks): void {
    const wr = ses.webRequest;
    const origHeaders = wr.onHeadersReceived.bind(wr) as (f: WebRequestFilter | HeadersListener | null, l?: HeadersListener | null) => void;
    const origBefore = wr.onBeforeRequest.bind(wr) as (f: WebRequestFilter | BeforeRequestListener | null, l?: BeforeRequestListener | null) => void;

    let foreignHeaders: { match: (u: string) => boolean; listener: HeadersListener } | null = null;
    let foreignBefore: { match: (u: string) => boolean; listener: BeforeRequestListener } | null = null;

    origHeaders((details, callback) => {
        const finish = (res: HeadersReceivedResponse) => {
            if (res.cancel) return callback(res);
            const headers = (res.responseHeaders ?? details.responseHeaders ?? {}) as Record<string, string | string[]>;
            try {
                hooks.transformHeaders(details.url, headers);
            } catch (e) {
                console.error("[NexusCord] header transform failed:", e);
            }
            callback({ ...res, responseHeaders: headers });
        };
        if (foreignHeaders?.match(details.url)) {
            try {
                return foreignHeaders.listener(details, finish);
            } catch (e) {
                console.error("[NexusCord] Discord onHeadersReceived listener threw:", e);
            }
        }
        finish({});
    });

    origBefore((details, callback) => {
        let blocked = false;
        try {
            blocked = hooks.shouldBlock(details.url);
        } catch { /* never break networking */ }
        if (blocked) return callback({ cancel: true });
        if (foreignBefore?.match(details.url)) {
            try {
                return foreignBefore.listener(details, (r: CallbackResponse) => callback(r));
            } catch (e) {
                console.error("[NexusCord] Discord onBeforeRequest listener threw:", e);
            }
        }
        callback({});
    });

    // Re-route future registrations (Discord's) into our chain.
    (wr as any).onHeadersReceived = (a: WebRequestFilter | HeadersListener | null, b?: HeadersListener | null) => {
        const [filter, listener] = typeof a === "function" || a === null ? [null, a] : [a, b ?? null];
        foreignHeaders = listener ? { match: compileFilter(filter), listener } : null;
    };
    (wr as any).onBeforeRequest = (a: WebRequestFilter | BeforeRequestListener | null, b?: BeforeRequestListener | null) => {
        const [filter, listener] = typeof a === "function" || a === null ? [null, a] : [a, b ?? null];
        foreignBefore = listener ? { match: compileFilter(filter), listener } : null;
    };
}

const CSP_HEADERS = new Set(["content-security-policy", "content-security-policy-report-only"]);

export function stripCsp(headers: Record<string, string | string[]>): void {
    for (const key of Object.keys(headers)) {
        if (CSP_HEADERS.has(key.toLowerCase())) delete headers[key];
    }
}

/** Telemetry endpoints blocked by the NoTrack plugin. */
const TRACKING_RE = [
    /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/v\d+\/(?:science|track|metrics)(?:[/?]|$)/,
    /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/error-reporting-proxy\//,
    /^https:\/\/(?:[\w-]+\.)?sentry\.io\//
];

export function isTrackingUrl(url: string): boolean {
    return TRACKING_RE.some(r => r.test(url));
}
