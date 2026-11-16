/* Unindent: code blocks you paste are sent without the common leading indentation. */
import { addPreSendHook } from "../core/outgoing";
import { unindentCode } from "../../shared/text";
import { definePlugin } from "../core/pluginManager";

const ID = "unindent";
let off = () => {};


export default definePlugin({
    id: ID,
    name: "plugin.unindent.name",
    description: "plugin.unindent.desc",
    category: "chat",
    start() {
        off = addPreSendHook(ID, ({ message }) => {
            if (message.content.includes("```")) message.content = unindentCode(message.content);
        }, 45);
    },
    stop() {
        off();
    }
});
