/*
 * Timestamps everyone sees in their own timezone. Write {{18:30}}, {{2026-12-24 20:00}},
 * {{+2h}} or {{in 30m}} (optionally |R |F |d ... for the style) and it is sent as <t:...>.
 */
import { addPreSendHook } from "../core/outgoing";
import { parseWhen, convertTimestamps } from "../../shared/text";
import { definePlugin } from "../core/pluginManager";

const ID = "sendTimestamps";
let off = () => {};



export default definePlugin({
    id: ID,
    name: "plugin.sendTimestamps.name",
    description: "plugin.sendTimestamps.desc",
    category: "chat",
    start() {
        off = addPreSendHook(ID, ({ message }) => {
            if (message.content.includes("{{")) message.content = convertTimestamps(message.content);
        }, 40);
    },
    stop() {
        off();
    }
});
