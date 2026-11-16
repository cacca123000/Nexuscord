/* Who reacted (#43): tiny avatars of the people who reacted, right on the reaction. */
import { avatarUrl, RestAPI, UserStore } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe, parseMessageElement } from "../core/domObserver";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "whoReacted";
const cache = new Map<string, any[]>();
const queue: (() => Promise<void>)[] = [];
let busy = false;
let off = () => {};

async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
        await queue.shift()!();
        await new Promise(r => setTimeout(r, 800)); // stay far below rate limits
    }
    busy = false;
}

function emojiParam(btn: HTMLElement): string | null {
    const img = btn.querySelector("img");
    if (!img) return null;
    const m = /\/emojis\/(\d+)/.exec(img.src);
    if (m) return `${encodeURIComponent((img.alt || "e").replace(/:/g, ""))}:${m[1]}`;
    return img.alt ? encodeURIComponent(img.alt) : null;
}

function onReaction(btn: HTMLElement) {
    if (btn.dataset.ncWho) return;
    const ids = parseMessageElement(btn);
    const emoji = emojiParam(btn);
    if (!ids || !emoji) return;
    btn.dataset.ncWho = "1";
    const key = `${ids.messageId}:${emoji}`;
    const draw = (users: any[]) => {
        btn.querySelector(".nc-who")?.remove();
        const max = Number(getOption(ID, "max")) || 4;
        btn.appendChild(h("span", { className: "nc-who" }, users.slice(0, max).map(u => h("img", { src: avatarUrl(UserStore.getUser?.(u.id) ?? u, 32), title: u.global_name ?? u.username, alt: "" }))));
    };
    if (cache.has(key)) return draw(cache.get(key)!);
    queue.push(async () => {
        try {
            const res = await RestAPI.get({ url: `/channels/${ids.channelId}/messages/${ids.messageId}/reactions/${emoji}`, query: { limit: 10 }, oldFormErrors: true });
            cache.set(key, res.body ?? []);
            if (btn.isConnected) draw(res.body ?? []);
        } catch { /* ignore */ }
    });
    pump();
}

export default definePlugin({
    id: ID,
    name: "plugin.whoReacted.name",
    description: "plugin.whoReacted.desc",
    category: "chat",
    options: { max: { type: "number", label: "plugin.whoReacted.opt.max", default: 4, min: 1, max: 10 } },
    start() {
        setStyle("nc-who", `.nc-who{display:inline-flex;margin-left:4px}.nc-who img{width:14px;height:14px;border-radius:50%;margin-left:-4px;box-shadow:0 0 0 2px var(--background-base-low,#2b2d31)}.nc-who img:first-child{margin-left:0}`);
        off = observe(ID, 'li[id^="chat-messages-"] [class*="reaction_"] [role="button"], li[id^="chat-messages-"] [class*="reactionInner"]', onReaction);
    },
    stop() {
        off();
        setStyle("nc-who", null);
        document.querySelectorAll(".nc-who").forEach(e => e.remove());
    }
});
