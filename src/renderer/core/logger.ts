const STYLE = "color:#fff;background:linear-gradient(90deg,#7c5cff,#3ec6ff);padding:1px 6px;border-radius:4px;font-weight:700";

/** Last errors logged by NexusCord (for the diagnostics report). */
export const errorLog: { at: number; scope: string; text: string }[] = [];

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
    }
    debug(...a: unknown[]) { if (NEXUSCORD_DEV) this.out("debug", a); }
}
