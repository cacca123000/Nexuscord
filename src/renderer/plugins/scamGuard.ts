/*
 * Scam guard (#18, #21, #24):
 *  - flags typical scam DMs (free Nitro, Steam "gifts", fake "you were reported", crypto
 *    airdrops...) from non-friends or brand-new accounts with a red warning banner
 *  - warns when a NEW account (younger than N days) sends you a friend request
 *  - QR-login scam links are handled by LinkShield (discord.com/ra/...)
 */
import { ChannelStore, currentUser, RelationshipStore, snowflakeDate } from "../core/discord";
import { escapeCssString, setStyle } from "../core/dom";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";

const ID = "scamGuard";
const flagged = new Map<string, string>(); // messageId -> channelId
const unsubs: (() => void)[] = [];

export const SCAM_PATTERNS: RegExp[] = [
    /\bfree\s*(?:discord\s*)?nitro\b/i,
    /\bnitro\b.{0,40}\b(?:gift|giveaway|free|claim|generator)\b/i,
    /\bsteam\b.{0,40}\b(?:gift|giveaway|\$\d+|50\$|free)\b/i,
    /\b(?:accidentally|mistakenly)\s+reported\b/i,
    /\breported\s+your\s+account\b/i,
    /\b(?:verify|confirm)\s+your\s+(?:account|identity)\b.{0,60}https?:\/\//i,
    /\b(?:airdrop|nft\s*mint|crypto\s*giveaway|double\s+your\s+(?:btc|eth|crypto))\b/i,
    /\b(?:cs2|csgo|cs:go)\s*skins?\b.{0,40}\b(?:free|giveaway|trade)\b/i,
    /\b(?:i\s+)?(?:made|created)\s+(?:a|my)\s+(?:game|app)\b.{0,60}\b(?:test|try)\b.{0,40}\b(?:download|\.exe|\.zip)\b/i,
    /\bdiscord\s*(?:staff|moderator|trust\s*&?\s*safety)\b.{0,80}\b(?:ban|disable|terminated|verify)\b/i
];

export function looksLikeScam(content: string): boolean {
    return SCAM_PATTERNS.some(r => r.test(content));
}

function ageDays(id: string) {
    const d = snowflakeDate(id);
    return d ? (Date.now() - d.getTime()) / 86400000 : Infinity;
}

function check(msg: any) {
    if (!getOption(ID, "dmScan") || !msg?.id || !msg.author || msg.author.id === currentUser()?.id) return;
    const channel = ChannelStore.getChannel?.(msg.channel_id ?? msg.channelId);
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return; // DMs & group DMs
    const friend = RelationshipStore.isFriend?.(msg.author.id);
    const young = ageDays(msg.author.id) < Number(getOption(ID, "newAccountDays") || 30);
    if (friend && !young && !getOption(ID, "scanFriends")) return;
    if (!looksLikeScam(String(msg.content ?? "")) && !(young && /https?:\/\//.test(msg.content ?? "") && !friend)) return;
    flagged.set(msg.id, msg.channel_id ?? msg.channelId);
    render();
}

function render() {
    const label = escapeCssString(t("plugin.scamGuard.banner"));
    let css = "";
    for (const [id, ch] of flagged) {
        css += `#chat-messages-${ch}-${id}{box-shadow:inset 3px 0 0 var(--status-danger,#f23f43);background:color-mix(in srgb,var(--status-danger,#f23f43) 7%,transparent)!important}`;
        css += `#chat-messages-${ch}-${id} [id^="message-content-"]::before{content:"⚠ ${label}";display:block;font-size:12px;font-weight:700;color:var(--status-danger,#f23f43);margin-bottom:2px}`;
    }
    setStyle("nc-scam-guard", css || null);
}

export default definePlugin({
    id: ID,
    name: "plugin.scamGuard.name",
    description: "plugin.scamGuard.desc",
    category: "privacy",
    options: {
        dmScan: { type: "boolean", label: "plugin.scamGuard.opt.dmScan", default: true },
        scanFriends: { type: "boolean", label: "plugin.scamGuard.opt.scanFriends", default: false },
        friendRequestWarning: { type: "boolean", label: "plugin.scamGuard.opt.friendRequest", default: true },
        newAccountDays: { type: "number", label: "plugin.scamGuard.opt.newAccountDays", default: 30, min: 1, max: 365 }
    },
    start() {
        unsubs.push(
            subscribe("MESSAGE_CREATE", a => check(a.message)),
            subscribe("LOAD_MESSAGES_SUCCESS", a => (a.messages ?? []).forEach(check)),
            subscribe("RELATIONSHIP_ADD", a => {
                const rel = a.relationship;
                if (!getOption(ID, "friendRequestWarning") || rel?.type !== 3) return; // 3 = incoming request
                const days = ageDays(rel.id ?? rel.user?.id);
                if (days < Number(getOption(ID, "newAccountDays") || 30)) {
                    toast(t("plugin.scamGuard.newFriend", { name: rel.user?.username ?? rel.id, days: Math.max(0, Math.floor(days)) }), "warn", 10000);
                }
            })
        );
    },
    stop() {
        unsubs.splice(0).forEach(u => u());
        flagged.clear();
        setStyle("nc-scam-guard", null);
    }
});
