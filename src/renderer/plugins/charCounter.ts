/* Character counter under the message box (turns amber near the limit, red above it). */
import { currentUser } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe } from "../core/domObserver";
import { definePlugin } from "../core/pluginManager";

const ID = "charCounter";
const cleanups: (() => void)[] = [];

const limit = () => (currentUser()?.premiumType === 2 ? 4000 : 2000);

function attach(box: HTMLElement) {
    const area = (box.closest('[class*="channelTextArea_"]') as HTMLElement | null) ?? box.parentElement;
    if (!area || area.querySelector(".nc-char-counter")) return;
    const counter = h("div", { className: "nc-char-counter", "aria-live": "polite" });
    area.appendChild(counter);
    const update = () => {
        const n = (box.innerText ?? "").replace(/\n$/, "").length;
        const max = limit();
        counter.textContent = n ? `${n.toLocaleString()} / ${max.toLocaleString()}` : "";
        counter.dataset.state = n > max ? "over" : n > max * 0.9 ? "near" : "";
    };
    box.addEventListener("input", update);
    const mo = new MutationObserver(update);
    mo.observe(box, { childList: true, subtree: true, characterData: true });
    cleanups.push(() => (box.removeEventListener("input", update), mo.disconnect(), counter.remove()));
    update();
}

export default definePlugin({
    id: ID,
    name: "plugin.charCounter.name",
    description: "plugin.charCounter.desc",
    category: "chat",
    start() {
        setStyle(ID, `[class*="channelTextArea_"]{position:relative}.nc-char-counter{position:absolute;right:12px;bottom:-17px;font:500 11px var(--font-primary,sans-serif);color:var(--text-muted,#949ba4);pointer-events:none;font-variant-numeric:tabular-nums}.nc-char-counter[data-state=near]{color:var(--status-warning,#f0b232)}.nc-char-counter[data-state=over]{color:var(--status-danger,#f23f43);font-weight:700}`);
        cleanups.push(observe(ID, '[class*="channelTextArea_"] [role="textbox"]', attach));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle(ID, null);
    }
});
