/* No F1: stops F1 from opening Discord's help center in your browser. */
import { onDomReady } from "../core/dom";
import { definePlugin } from "../core/pluginManager";

const ID = "noF1";
const block = (e: KeyboardEvent) => {
    if (e.key === "F1" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
};

export default definePlugin({
    id: ID,
    name: "plugin.noF1.name",
    description: "plugin.noF1.desc",
    category: "utility",
    start() {
        onDomReady(() => window.addEventListener("keydown", block, true));
    },
    stop() {
        window.removeEventListener("keydown", block, true);
    }
});
