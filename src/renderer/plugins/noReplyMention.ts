/* No reply ping: replies don't @mention the author by default (exceptions per user). */
import { intercept } from "../core/flux";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "noReplyMention";
let off = () => {};

export default definePlugin({
    id: ID,
    name: "plugin.noReplyMention.name",
    description: "plugin.noReplyMention.desc",
    category: "chat",
    options: {
        exceptions: { type: "string", label: "plugin.noReplyMention.opt.exceptions", hint: "plugin.noReplyMention.opt.exceptionsHint", default: "", placeholder: "123456789012345678, …" },
        pingBots: { type: "boolean", label: "plugin.noReplyMention.opt.pingBots", default: false }
    },
    start() {
        off = intercept(ID, action => {
            if (action.type !== "CREATE_PENDING_REPLY") return;
            const author = action.message?.author;
            const keep = String(getOption(ID, "exceptions") ?? "").split(/[\s,]+/).filter(Boolean);
            if (author && (keep.includes(author.id) || (author.bot && getOption(ID, "pingBots")))) return;
            action.shouldMention = false;
        });
    },
    stop() {
        off();
    }
});
