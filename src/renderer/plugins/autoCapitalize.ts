/* Auto capitalize: first letter of each sentence in upper case (links, code and commands untouched). */
import { addPreSendHook } from "../core/outgoing";
import { capitalize } from "../../shared/text";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "autoCapitalize";
let off = () => {};


export default definePlugin({
    id: ID,
    name: "plugin.autoCapitalize.name",
    description: "plugin.autoCapitalize.desc",
    category: "chat",
    options: { fixI: { type: "boolean", label: "plugin.autoCapitalize.opt.fixI", default: true } },
    start() {
        off = addPreSendHook(ID, ({ message, edit }) => {
            if (!edit) message.content = capitalize(message.content, !!getOption(ID, "fixI"));
        }, 30);
    },
    stop() {
        off();
    }
});
