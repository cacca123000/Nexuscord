/*
 * Static risk scanner for BetterDiscord .plugin.js files (run before install and on
 * every load) + a runtime guard that stops BD plugins from reading your account token.
 */
import type { TranslationKey } from "./i18n";

export type Severity = "info" | "medium" | "high";
export interface Finding {
    id: string;
    label: TranslationKey;
    severity: Severity;
    sample?: string;
}
export interface ScanResult {
    risk: "low" | "medium" | "high";
    findings: Finding[];
}

const RULES: { id: string; label: TranslationKey; severity: Severity; re: RegExp }[] = [
    { id: "token", label: "scan.token", severity: "high", re: /\bgetToken\s*\(|["'`]token["'`]\s*\)|\.token\b\s*[;,)]|authorization["'`]?\s*:/i },
    { id: "webhook", label: "scan.webhook", severity: "high", re: /discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\//i },
    { id: "exfil", label: "scan.exfil", severity: "high", re: /\b(?:ngrok(?:-free)?\.(?:io|app)|pastebin\.com\/raw|ipify\.org|grabify|iplogger|requestbin|pipedream\.net|webhook\.site)\b/i },
    { id: "remoteEval", label: "scan.remoteEval", severity: "high", re: /(?:fetch|request|XMLHttpRequest)[\s\S]{0,200}?(?:\beval\s*\(|new\s+Function\s*\()/ },
    { id: "eval", label: "scan.eval", severity: "medium", re: /\beval\s*\(|new\s+Function\s*\(/ },
    { id: "obfuscated", label: "scan.obfuscated", severity: "medium", re: /(?:\\x[0-9a-f]{2}){40,}|[A-Za-z0-9+/]{800,}={0,2}|_0x[0-9a-f]{4,}\[/i },
    { id: "nodeApi", label: "scan.nodeApi", severity: "info", re: /require\(\s*["'`](?:child_process|fs|os|net|https?)["'`]\s*\)/ },
    { id: "password", label: "scan.password", severity: "medium", re: /\b(?:password|passwd|mfa_code|totp)\b[\s\S]{0,120}?(?:fetch|XMLHttpRequest|sendBeacon)/i },
    { id: "keylog", label: "scan.keylog", severity: "medium", re: /addEventListener\(\s*["'`]key(?:down|press|up)["'`][\s\S]{0,300}?(?:fetch|XMLHttpRequest|sendBeacon)\(/ }
];

export function scanPlugin(source: string): ScanResult {
    const findings: Finding[] = [];
    for (const r of RULES) {
        const m = r.re.exec(source);
        if (m) findings.push({ id: r.id, label: r.label, severity: r.severity, sample: source.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\s+/g, " ") });
    }
    // Reading the token alone is common in legit plugins only together with Discord's own API
    const high = findings.filter(f => f.severity === "high");
    const tokenOnly = high.length === 1 && high[0].id === "token" && !/https?:\/\/(?!discord(?:app)?\.com)/.test(source);
    if (tokenOnly) high[0].severity = "medium";
    const risk = findings.some(f => f.severity === "high") ? "high" : findings.some(f => f.severity === "medium") ? "medium" : "low";
    return { risk, findings };
}

/** URL of the NexusCord renderer bundle, read from our own stack trace at load time. */
const OWN_FILE = (() => {
    const line = (new Error().stack ?? "").split("\n").find(l => /:\d+:\d+\)?$/.test(l)) ?? "";
    return /\(?((?:[a-z-]+:\/\/|\/)[^\s()]+?|<anonymous>):\d+:\d+\)?$/.exec(line.trim())?.[1] ?? "nexuscord://renderer.js";
})();

/**
 * True only when a BetterDiscord plugin is the DIRECT caller (after skipping NexusCord's
 * own frames and the patched getToken wrapper). Discord's own HTTP code asking for the
 * token while a BD plugin is somewhere further up the stack (e.g. a patched click
 * handler) is allowed - blocking that broke navigation in 2.0.x.
 */
export function calledFromBdPlugin(): boolean {
    const frames = (new Error().stack ?? "").split("\n").slice(1);
    for (const f of frames) {
        if (f.includes(OWN_FILE) || f.includes("nexuscord://") || f.includes("nexuscord-patched://")) continue;
        return /betterdiscord:\/\/plugins\//.test(f);
    }
    return false;
}
