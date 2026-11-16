/* Chat filter: hide or blur messages containing words you never want to read (local only). */
import { MessageStore } from "../core/discord";
import { setStyle } from "../core/dom";
import { MESSAGE_SELECTOR, observe, parseMessageElement } from "../core/domObserver";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "chatFilter";
let off = () => {};
let words: RegExp | null = null;

function compile() {
    const list = String(getOption(ID, "words") ?? "")
        .split(/[\n,]+/)
        .map(w => w.trim())
        .filter(Boolean)
        .map(w => (w.startsWith("/") && w.lastIndexOf("/") > 0 ? w.slice(1, w.lastIndexOf("/")) : `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    try {
        words = list.length ? new RegExp(list.join("|"), "i") : null;
    } catch {
        words = null;
    }
}

function check(li: HTMLElement) {
    if (!words) return;
    const ids = parseMessageElement(li);
    const msg = ids && MessageStore.getMessage?.(ids.channelId, ids.messageId);
    const text = msg?.content ?? li.querySelector('[id^="message-content-"]')?.textContent ?? "";
    if (!words.test(text)) return;
    li.classList.add(getOption(ID, "mode") === "hide" ? "nc-filtered-hide" : "nc-filtered-blur");
    li.title = t("plugin.chatFilter.hidden");
}

export default definePlugin({
    id: ID,
    name: "plugin.chatFilter.name",
    description: "plugin.chatFilter.desc",
    category: "chat",
    options: {
        words: { type: "text", label: "plugin.chatFilter.opt.words", hint: "plugin.chatFilter.opt.wordsHint", default: "", placeholder: "spoiler\n/regex/" },
        mode: { type: "select", label: "plugin.chatFilter.opt.mode", default: "blur", options: [{ label: "plugin.chatFilter.blur", value: "blur" }, { label: "plugin.chatFilter.hide", value: "hide" }] }
    },
    start() {
        compile();
        setStyle(ID, `.nc-filtered-hide{display:none!important}.nc-filtered-blur [id^="message-content-"],.nc-filtered-blur [id^="message-accessories-"]{filter:blur(6px);transition:filter .2s}.nc-filtered-blur:hover [id^="message-content-"],.nc-filtered-blur:hover [id^="message-accessories-"]{filter:none}`);
        off = observe(ID, MESSAGE_SELECTOR, check);
    },
    stop() {
        off();
        setStyle(ID, null);
        document.querySelectorAll(".nc-filtered-hide,.nc-filtered-blur").forEach(e => e.classList.remove("nc-filtered-hide", "nc-filtered-blur"));
    },
    onOptionChange() {
        this.stop();
        this.start();
    }
});
