/*
 * App lock (#23): PIN (PBKDF2-SHA256, 150k iterations) and/or Windows Hello on startup,
 * after N idle minutes, or on demand ("Lock now" in the command palette).
 * Note: this is a privacy lock against people at your PC, not protection against malware.
 */
import { addCommands } from "./commandPalette";
import { h, onDomReady } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";
import { Settings } from "../core/settings";
import { Button, SettingRow, Switch, TextInput, toast } from "../core/ui";

const ID = "appLock";
let overlay: HTMLElement | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const cleanups: (() => void)[] = [];

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

export async function hashPin(pin: string, saltB64: string): Promise<string> {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 150_000 }, key, 256));
}

async function setPin(pin: string) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPin(pin, salt);
    Settings.update(s => Object.assign(s.security, { pinHash: hash, pinSalt: salt, appLock: true }));
}

function unlock() {
    overlay?.remove();
    overlay = null;
    resetIdle();
}

export function lockNow() {
    const sec = Settings.get().security;
    if (overlay || (!sec.pinHash && !sec.windowsHello)) return;
    const err = h("div", { className: "nc-sub", style: "min-height:18px;color:var(--nc-danger)" });
    const input = h("input", { className: "nc-input", type: "password", inputmode: "numeric", autocomplete: "off", placeholder: t("plugin.appLock.pin"), style: "text-align:center;font-size:20px;letter-spacing:.3em;width:220px" }) as HTMLInputElement;
    let attempts = 0;
    const tryPin = async () => {
        if (!sec.pinHash) return;
        if ((await hashPin(input.value, sec.pinSalt)) === sec.pinHash) return unlock();
        attempts++;
        input.value = "";
        err.textContent = t("plugin.appLock.wrong");
        if (attempts >= 5) {
            input.disabled = true;
            setTimeout(() => ((input.disabled = false), (attempts = 0), input.focus()), 30_000);
            err.textContent = t("plugin.appLock.cooldown");
        }
    };
    input.addEventListener("keydown", e => e.key === "Enter" && tryPin());
    const hello = async () => {
        if (await Native.system.windowsHello(t("plugin.appLock.helloPrompt"))) unlock();
        else err.textContent = t("plugin.appLock.helloFailed");
    };
    overlay = h(
        "div",
        { className: "nc-root nc-lock", role: "dialog", "aria-modal": "true" },
        h("div", { className: "nc-lock-card" }, h("div", { className: "nc-logo", html: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }), h("h2", null, t("plugin.appLock.locked")), sec.pinHash ? input : null, err, h("div", { className: "nc-row-wrap", style: "justify-content:center" }, sec.pinHash ? Button({ variant: "primary", onClick: tryPin, children: t("plugin.appLock.unlock") }) : null, sec.windowsHello ? Button({ onClick: hello, children: "Windows Hello" }) : null))
    );
    const mount = () => {
        document.body.appendChild(overlay!);
        if (sec.pinHash) input.focus();
        else if (sec.windowsHello) hello();
    };
    if (document.body) mount();
    else onDomReady(mount);
}

function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    const mins = Number(getOption(ID, "idleMinutes")) || 0;
    if (mins > 0) idleTimer = setTimeout(lockNow, mins * 60_000);
}

function Panel(): Node {
    const sec = Settings.get().security;
    let a = "", b = "";
    return h(
        "div",
        { className: "nc-stack" },
        h("div", { className: "nc-row" }, h("div", { className: "nc-row-label" }, t(sec.pinHash ? "plugin.appLock.changePin" : "plugin.appLock.setPin"), h("small", null, t("plugin.appLock.pinHint"))), TextInput({ value: "", type: "password", placeholder: t("plugin.appLock.pin"), live: true, onChange: v => (a = v) }), TextInput({ value: "", type: "password", placeholder: t("plugin.appLock.repeat"), live: true, onChange: v => (b = v) }), Button({ variant: "primary", onClick: async () => { if (!/^\d{4,12}$/.test(a)) return toast(t("plugin.appLock.pinFormat"), "error"); if (a !== b) return toast(t("plugin.appLock.mismatch"), "error"); await setPin(a); toast(t("plugin.appLock.pinSaved"), "success"); }, children: t("common.save") })),
        SettingRow({ label: "Windows Hello", hint: t("plugin.appLock.helloHint"), control: Switch({ checked: sec.windowsHello, onChange: v => Settings.update(s => void (s.security.windowsHello = v)) }) }),
        h("div", { className: "nc-row-wrap" }, Button({ onClick: lockNow, children: t("plugin.appLock.lockNow") }), sec.pinHash ? Button({ variant: "danger", onClick: () => (Settings.update(s => Object.assign(s.security, { pinHash: "", pinSalt: "" })), toast(t("plugin.appLock.pinRemoved"), "success")), children: t("plugin.appLock.removePin") }) : null)
    );
}

addCommands(() => [{ icon: "🔒", label: t("plugin.appLock.lockNow"), kind: t("palette.kind.action"), run: lockNow }]);

export default definePlugin({
    id: ID,
    name: "plugin.appLock.name",
    description: "plugin.appLock.desc",
    category: "privacy",
    options: {
        lockOnStart: { type: "boolean", label: "plugin.appLock.opt.lockOnStart", default: true },
        idleMinutes: { type: "number", label: "plugin.appLock.opt.idleMinutes", hint: "plugin.appLock.opt.idleHint", default: 0, min: 0, max: 240 }
    },
    settingsPanel: Panel,
    start() {
        const css = document.createElement("style");
        css.id = "nc-app-lock";
        css.textContent = `.nc-lock{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#2b1d63,#0b0c12 70%);-webkit-app-region:drag}.nc-lock-card{-webkit-app-region:no-drag;display:flex;flex-direction:column;align-items:center;gap:14px;padding:34px 40px;border-radius:22px;background:rgba(20,22,32,.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1)}.nc-lock-card h2{margin:0;color:#fff;font-size:20px}`;
        onDomReady(() => document.head.appendChild(css));
        cleanups.push(() => css.remove());
        if (getOption(ID, "lockOnStart")) lockNow();
        const activity = () => resetIdle();
        for (const ev of ["mousemove", "keydown", "mousedown"]) window.addEventListener(ev, activity, { passive: true });
        cleanups.push(() => ["mousemove", "keydown", "mousedown"].forEach(ev => window.removeEventListener(ev, activity)));
        resetIdle();
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        if (idleTimer) clearTimeout(idleTimer);
        unlock();
    },
    onOptionChange: resetIdle
});
