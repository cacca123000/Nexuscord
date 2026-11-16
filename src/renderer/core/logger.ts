const STYLE = "color:#fff;background:linear-gradient(90deg,#7c5cff,#3ec6ff);padding:1px 6px;border-radius:4px;font-weight:700";

/** Last errors logged by NexusCord (for the diagnostics report). */
export const errorLog: { at: number; scope: string; text: string }[] = [];

const fmt = (x: unknown): string => {
    if (x instanceof Error) return `${x.name}: ${x.message}\n${x.stack ?? ""}`;
    if (typeof x === "string") return x.replace(/%c/g, "");
    try {
        return JSON.stringify(x)?.slice(0, 500) ?? String(x);
    } catch {
        return String(x);
    }
};
/** Writes a line to %APPDATA%\NexusCord\nexuscord.log (desktop only). */
export function writeToLogFile(scope: string, args: unknown[]): void {
    try {
        (window as any).NexusCordNative?.system?.log?.(`[${scope}] ${args.map(fmt).join(" ")}`);
    } catch { /* never throw from logging */ }
}

/**
 * Discord's own crash screen ("Well, this is awkward") hides the real error. Forward React
 * render errors and uncaught exceptions to the log file so they can be diagnosed.
 */
export function installCrashReporter(): void {
    if ((window as any).__ncCrashReporter) return;
    (window as any).__ncCrashReporter = true;
    window.addEventListener("error", e => writeToLogFile("window.onerror", [e.error ?? e.message, `${e.filename}:${e.lineno}:${e.colno}`]));
    window.addEventListener("unhandledrejection", e => {
        const r = (e as PromiseRejectionEvent).reason;
        if (r instanceof Error) writeToLogFile("unhandledrejection", [r]);
    });
    const orig = console.error;
    console.error = function (...args: unknown[]) {
        try {
            const text = args.map(a => (a instanceof Error ? a.message + " " + a.stack : String(a))).join(" ");
            if (/react\.dev\/errors|reactjs\.org\/docs\/error|The above error occurred|componentStack|Uncaught|ErrorBoundary/i.test(text)) writeToLogFile("react", args);
        } catch { /* ignore */ }
        return orig.apply(this, args as any);
    };
}

export class Logger {
    constructor(private readonly scope: string) {}
    private out(fn: "log" | "info" | "warn" | "error" | "debug", args: unknown[]) {
        console[fn](`%cNexusCord%c [${this.scope}]`, STYLE, "color:inherit", ...args);
    }
    info(...a: unknown[]) { this.out("info", a); }
    warn(...a: unknown[]) { this.out("warn", a); }
    error(...a: unknown[]) {
        this.out("error", a);
        errorLog.push({ at: Date.now(), scope: this.scope, text: a.map(x => (x instanceof Error ? `${x.message}\n${x.stack?.split("\n").slice(1, 4).join("\n")}` : String(x))).join(" ").slice(0, 800) });
        if (errorLog.length > 50) errorLog.shift();
        writeToLogFile(this.scope, a);
    }
    debug(...a: unknown[]) { if (NEXUSCORD_DEV) this.out("debug", a); }
}
