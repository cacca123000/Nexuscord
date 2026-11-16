/* Command palette (#12): Ctrl+Shift+P - search & run anything NexusCord can do. */
import { h, onDomReady } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { definePlugin, getPlugins, isEnabled, setPluginEnabled } from "../core/pluginManager";
import { getPages, openSettings } from "../core/settingsUI";
import { ThemeEngine } from "../core/themeEngine";
import { copyText, openModal, toast } from "../core/ui";

const ID = "commandPalette";

interface Command {
    icon: string;
    label: string;
    kind: string;
    run: () => void;
}

const extraCommands: (() => Command[])[] = [];
/** Other plugins can contribute commands (e.g. streamer panic). */
export function addCommands(fn: () => Command[]) {
    extraCommands.push(fn);
}

function commands(): Command[] {
    const list: Command[] = [];
    for (const p of getPages()) list.push({ icon: "⚙️", label: `${t("palette.open")}: ${t(p.label)}`, kind: t("palette.kind.page"), run: () => openSettings(p.id) });
    for (const p of getPlugins()) {
        if (p.required) continue;
        const on = isEnabled(p.id);
        list.push({ icon: on ? "🟢" : "⚪", label: `${on ? t("palette.disable") : t("palette.enable")}: ${t(p.name)}`, kind: t("palette.kind.plugin"), run: () => setPluginEnabled(p.id, !on) });
    }
    for (const th of ThemeEngine.getThemes()) {
        const on = ThemeEngine.isEnabled(th.file);
        list.push({ icon: "🎨", label: `${on ? t("palette.disable") : t("palette.enable")}: ${th.meta.name}`, kind: t("palette.kind.theme"), run: () => ThemeEngine.setEnabled(th.file, !on) });
    }
    list.push(
        { icon: "🧹", label: t("perf.purge"), kind: t("palette.kind.action"), run: () => Native.perf.purgeCache().then(() => toast(t("perf.purged"), "success")) },
        { icon: "🔄", label: t("tools.restart"), kind: t("palette.kind.action"), run: () => Native.window.action("restart") },
        { icon: "🛟", label: t("tools.safeRestart"), kind: t("palette.kind.action"), run: () => Native.window.action("restart-safe") },
        { icon: "♻️", label: t("tools.reload"), kind: t("palette.kind.action"), run: () => Native.window.action("reload") },
        { icon: "🧪", label: t("tools.devtools"), kind: t("palette.kind.action"), run: () => Native.window.action("devtools") },
        { icon: "📋", label: t("tools.copyReport"), kind: t("palette.kind.action"), run: () => import("../core/pages/tools").then(m => copyText(m.diagnostics())) },
        { icon: "📂", label: t("perf.openDataFolder"), kind: t("palette.kind.action"), run: () => Native.shell.openFolder("data") },
        { icon: "✨", label: t("home.setup"), kind: t("palette.kind.action"), run: () => (window as any).NexusCord?.openOnboarding?.() }
    );
    for (const f of extraCommands) {
        try {
            list.push(...f());
        } catch { /* ignore */ }
    }
    return list;
}

/** Subsequence fuzzy score (higher = better), -1 = no match. */
export function fuzzy(query: string, text: string): number {
    const q = query.toLowerCase(), s = text.toLowerCase();
    if (!q) return 0;
    const idx = s.indexOf(q);
    if (idx !== -1) return 1000 - idx;
    let score = 0, pos = 0;
    for (const ch of q) {
        const i = s.indexOf(ch, pos);
        if (i === -1) return -1;
        score += i === pos ? 5 : 1;
        pos = i + 1;
    }
    return score;
}

let open: { close: () => void } | null = null;

export function openPalette() {
    if (open) return open.close();
    const all = commands();
    let sel = 0;
    let shown: Command[] = all;
    const list = h("div", { className: "nc-palette-list", role: "listbox" });
    const input = h("input", { className: "nc-input", placeholder: t("palette.placeholder"), "aria-label": t("palette.placeholder") }) as HTMLInputElement;
    const render = () => {
        list.replaceChildren(
            ...shown.slice(0, 60).map((c, i) =>
                h(
                    "div",
                    { className: `nc-palette-item${i === sel ? " sel" : ""}`, role: "option", onMouseDown: (e: MouseEvent) => (e.preventDefault(), exec(c)), onMouseMove: () => i !== sel && ((sel = i), render()) },
                    h("span", { className: "nc-palette-icon" }, c.icon),
                    c.label,
                    h("span", { className: "nc-palette-kind" }, c.kind)
                )
            )
        );
        list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    };
    const exec = (c: Command) => {
        open?.close();
        try {
            c.run();
        } catch (e) {
            toast(String(e), "error");
        }
    };
    input.addEventListener("input", () => {
        const q = input.value.trim();
        shown = q ? all.map(c => ({ c, s: fuzzy(q, c.label) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).map(x => x.c) : all;
        sel = 0;
        render();
    });
    input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown") (sel = Math.min(shown.length - 1, sel + 1)), render(), e.preventDefault();
        else if (e.key === "ArrowUp") (sel = Math.max(0, sel - 1)), render(), e.preventDefault();
        else if (e.key === "Enter" && shown[sel]) exec(shown[sel]);
    });
    render();
    const m = openModal({ title: "", body: h("div", null, input, list), buttons: [], className: "nc-palette", onClose: () => (open = null) });
    m.element.querySelector(".nc-modal-head")?.remove();
    open = m;
    requestAnimationFrame(() => input.focus());
}

const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyP") {
        e.preventDefault();
        e.stopPropagation();
        openPalette();
    }
};

export default definePlugin({
    id: ID,
    name: "plugin.commandPalette.name",
    description: "plugin.commandPalette.desc",
    category: "utility",
    start() {
        onDomReady(() => document.addEventListener("keydown", onKey, true));
        (window as any).NexusCord && ((window as any).NexusCord.openPalette = openPalette);
    },
    stop() {
        document.removeEventListener("keydown", onKey, true);
    }
});
