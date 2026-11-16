/* Never idle: Discord won't switch you to Idle/AFK when you step away from the keyboard. */
import { intercept } from "../core/flux";
import { definePlugin } from "../core/pluginManager";

const ID = "noIdle";
let off = () => {};

export default definePlugin({
    id: ID,
    name: "plugin.noIdle.name",
    description: "plugin.noIdle.desc",
    category: "utility",
    start() {
        off = intercept(ID, a => (a.type === "IDLE" && a.idle === true) || (a.type === "AFK" && a.afk === true));
    },
    stop() {
        off();
    }
});
