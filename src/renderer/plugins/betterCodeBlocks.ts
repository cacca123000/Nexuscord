/* Better code blocks (#34): language label, copy button and line numbers. */
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { copyText } from "../core/ui";

const ID = "betterCodeBlocks";
let off = () => {};

function decorate(pre: HTMLElement) {
    if (pre.dataset.ncCode || !pre.closest('li[id^="chat-messages-"]')) return;
    const code = pre.querySelector("code");
    if (!code) return;
    pre.dataset.ncCode = "1";
    const lang = [...code.classList].find(c => c !== "hljs" && !c.includes("_") && !c.startsWith("scroll"))?.replace(/^language-/, "") ?? "";
    const lines = (code.textContent ?? "").replace(/\n$/, "").split("\n").length;
    const head = h(
        "div",
        { className: "nc-code-head" },
        h("span", null, lang ? lang.toUpperCase() : t("plugin.betterCodeBlocks.code")),
        h("span", { className: "nc-sub", style: "font-size:11px" }, t("plugin.betterCodeBlocks.lines", { n: lines })),
        h("button", { type: "button", className: "nc-code-copy", onClick: () => copyText(code.textContent ?? "") }, t("plugin.betterCodeBlocks.copy"))
    );
    pre.prepend(head);
    if (getOption(ID, "lineNumbers") && lines > 1 && lines < 2000) {
        const gutter = h("div", { className: "nc-code-gutter", "aria-hidden": "true" }, Array.from({ length: lines }, (_, i) => `${i + 1}`).join("\n"));
        pre.classList.add("nc-code-numbered");
        code.before(gutter);
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.betterCodeBlocks.name",
    description: "plugin.betterCodeBlocks.desc",
    category: "chat",
    options: { lineNumbers: { type: "boolean", label: "plugin.betterCodeBlocks.opt.lineNumbers", default: true } },
    start() {
        setStyle("nc-code", `pre[data-nc-code]{position:relative;border-radius:8px;overflow:hidden}
.nc-code-head{display:flex;gap:10px;align-items:center;padding:4px 10px;font:700 11px var(--font-primary,sans-serif);letter-spacing:.04em;color:var(--text-muted,#949ba4);background:color-mix(in srgb,var(--background-base-lowest,#000) 50%,transparent);border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.nc-code-copy{margin-left:auto;border:0;border-radius:6px;padding:3px 9px;background:var(--brand-500,#5865f2);color:#fff;font:600 11.5px var(--font-primary,sans-serif);cursor:pointer}.nc-code-copy:hover{filter:brightness(1.1)}
pre.nc-code-numbered{display:grid;grid-template-columns:auto 1fr}pre.nc-code-numbered>.nc-code-head{grid-column:1/-1}
.nc-code-gutter{padding:.5em .6em .5em .8em;text-align:right;white-space:pre;color:var(--text-muted,#949ba4);opacity:.55;user-select:none;font-family:var(--font-code,monospace);font-size:.875rem;line-height:1.125rem;border-right:1px solid color-mix(in srgb,currentColor 15%,transparent)}`);
        off = observe(ID, "pre", decorate);
    },
    stop() {
        off();
        setStyle("nc-code", null);
        document.querySelectorAll(".nc-code-head, .nc-code-gutter").forEach(e => e.remove());
        document.querySelectorAll<HTMLElement>("pre[data-nc-code]").forEach(p => (delete p.dataset.ncCode, p.classList.remove("nc-code-numbered")));
    }
});
