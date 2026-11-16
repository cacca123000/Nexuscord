/*
 * Outgoing message pipeline: ONE patch on MessageActions.sendMessage / editMessage that
 * runs every registered pre-send hook in priority order. A hook may mutate the message
 * or return "cancel" to stop it (e.g. scheduled messages).
 */
import { Logger } from "./logger";
import { Patcher } from "./patcher";
import { waitFor } from "./webpack";

const log = new Logger("Outgoing");

export interface OutgoingMessage {
    content: string;
    validNonShortcutEmojis?: any[];
    invalidEmojis?: any[];
    tts?: boolean;
    [k: string]: any;
}
export type PreSendHook = (ctx: { channelId: string; message: OutgoingMessage; options: any; edit: boolean }) => void | "cancel";

const hooks: { owner: string; priority: number; fn: PreSendHook }[] = [];
let installed = false;

function run(channelId: string, message: OutgoingMessage, options: any, edit: boolean): boolean {
    for (const h of hooks) {
        try {
            if (h.fn({ channelId, message, options, edit }) === "cancel") return false;
        } catch (e) {
            log.error(`Pre-send hook from ${h.owner} threw`, e);
        }
    }
    return true;
}

function install() {
    if (installed) return;
    installed = true;
    waitFor(m => typeof m?.sendMessage === "function" && typeof m?.editMessage === "function", MessageActions => {
        Patcher.instead("NexusCord:Outgoing", MessageActions, "sendMessage", (self, args, original) => {
            const [channelId, message, waitForChannel, options] = args;
            if (!hooks.length || !message || typeof message.content !== "string") return original.apply(self, args);
            if (!run(channelId, message, options ?? {}, false)) return Promise.resolve();
            return original.apply(self, [channelId, message, waitForChannel, options]);
        });
        Patcher.instead("NexusCord:Outgoing", MessageActions, "editMessage", (self, args, original) => {
            const [channelId, , message] = args;
            if (hooks.length && message && typeof message.content === "string" && !run(channelId, message, {}, true)) return Promise.resolve();
            return original.apply(self, args);
        });
    }, "outgoing");
}

export function addPreSendHook(owner: string, fn: PreSendHook, priority = 50): () => void {
    install();
    const entry = { owner, priority, fn };
    hooks.push(entry);
    hooks.sort((a, b) => a.priority - b.priority);
    return () => {
        const i = hooks.indexOf(entry);
        if (i !== -1) hooks.splice(i, 1);
    };
}
