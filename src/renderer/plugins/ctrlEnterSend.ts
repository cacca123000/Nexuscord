/* Ctrl+Enter to send: Enter adds a new line, Ctrl+Enter (or Shift+Enter, your choice) sends. */
import { onDomReady } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "ctrlEnterSend";
let replaying = false;

function onKey(e: KeyboardEvent) {
    if (replaying || e.key !== "Enter" || e.isComposing) return;
    const box = (e.target as HTMLElement | null)?.closest?.('[role="textbox"][data-slate-editor="true"]') as HTMLElement | null;
    // Only the main chat box (not edits in progress / threads search)
    if (!box || !box.closest('[class*="channelTextArea_"]')) return;
    // Keep autocomplete (emoji / mentions) working
    if (document.querySelector('[class*="autocomplete_"] [role="option"]')) return;
    const send = getOption(ID, "sendWith") === "shift" ? e.shiftKey && !e.ctrlKey : (e.ctrlKey || e.metaKey) && !e.shiftKey;
    const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    if (!send && !plain) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    replaying = true;
    try {
        // send -> plain Enter for Discord; plain -> Shift+Enter (new line)
        box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, shiftKey: !send, bubbles: true, cancelable: true }));
    } finally {
        replaying = false;
    }
}

export default definePlugin({
    id: ID,
    name: "plugin.ctrlEnterSend.name",
    description: "plugin.ctrlEnterSend.desc",
    category: "chat",
    options: {
        sendWith: { type: "select", label: "plugin.ctrlEnterSend.opt.sendWith", default: "ctrl", options: [{ label: "Ctrl + Enter", value: "ctrl" }, { label: "Shift + Enter", value: "shift" }] }
    },
    start() {
        onDomReady(() => document.addEventListener("keydown", onKey, true));
    },
    stop() {
        document.removeEventListener("keydown", onKey, true);
    }
});
