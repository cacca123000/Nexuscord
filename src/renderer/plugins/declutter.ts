/* Declutter (#54): hide Nitro upsells, Shop, Quests, gift buttons, app launcher & more. */
import { setStyle } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "declutter";

export const RULES: Record<string, string> = {
    nitroTab: `a[href="/store"],a[href="/store/"],[data-list-item-id$="___nitro"],li:has(> div > a[href="/store"])`,
    shop: `a[href="/shop"],[data-list-item-id$="___shop"],li:has(> div > a[href="/shop"]),[class*="shopButton"]`,
    quests: `a[href="/quest-home"],[data-list-item-id$="___quests"],li:has(> div > a[href="/quest-home"]),[class*="questsEntry"],[class*="questPromo"]`,
    giftButton: `[class*="channelTextArea"] [class*="buttons"] > [class*="button"]:has(svg path[d^="M16.8"]),[class*="channelTextArea"] button[aria-label*="gift" i],[class*="channelTextArea"] button[aria-label*="regal" i]`,
    appLauncher: `[class*="channelAppLauncher"],[class*="appLauncherButton"],[class*="channelTextArea"] [class*="app-launcher-entrypoint"]`,
    stickerButton: `[class*="channelTextArea"] button[aria-label*="sticker" i]`,
    upsells: `[class*="premiumPromo"],[class*="upsell"],[class*="nitroUpsell"],[class*="boostedGuildTierText"]:empty,[class*="tryItOut"]`,
    activityButton: `[class*="actionButtons"] button[aria-label*="activit" i]`,
    discovery: `[data-list-item-id="guildsnav___guild-discover-button"],[class*="discoveryButton"]`,
    downloadApps: `[data-list-item-id="guildsnav___app-download-button"]`,
    superReactions: `[class*="burstReaction"],[class*="superReaction"]`,
    profileEffects: `[class*="profileEffects"]`
};

function apply() {
    const sel = Object.keys(RULES).filter(k => getOption(ID, k)).map(k => RULES[k]);
    setStyle("nc-declutter", sel.length ? `${sel.join(",")}{display:none!important}` : null);
}

export default definePlugin({
    id: ID,
    name: "plugin.declutter.name",
    description: "plugin.declutter.desc",
    category: "performance",
    options: Object.fromEntries(
        Object.keys(RULES).map(k => [k, { type: "boolean" as const, label: `plugin.declutter.opt.${k}` as any, default: !["stickerButton", "activityButton", "profileEffects", "superReactions"].includes(k) }])
    ),
    start: apply,
    stop: () => setStyle("nc-declutter", null),
    onOptionChange: apply
});
