/* Account age (#31): account creation date + server join date in profiles and on hover. */
import { GuildMemberStore, MessageStore, SelectedGuildStore, snowflakeDate } from "../core/discord";
import { h, setStyle } from "../core/dom";
import { observe, parseMessageElement, userIdFromElement } from "../core/domObserver";
import { getLanguage, t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "accountAge";
const cleanups: (() => void)[] = [];

export function ageLabel(created: Date, now = Date.now()): string {
    const days = Math.floor((now - created.getTime()) / 86400000);
    const rtf = new Intl.RelativeTimeFormat(getLanguage(), { numeric: "always" });
    if (days < 1) return t("plugin.accountAge.today");
    if (days < 60) return rtf.format(-days, "day");
    if (days < 730) return rtf.format(-Math.round(days / 30.4), "month");
    return rtf.format(-Math.round(days / 365.25), "year");
}

function info(userId: string): { created: Date | null; joined: Date | null } {
    const created = snowflakeDate(userId);
    let joined: Date | null = null;
    try {
        const m = GuildMemberStore.getMember?.(SelectedGuildStore.getGuildId?.(), userId);
        if (m?.joinedAt) joined = new Date(m.joinedAt);
    } catch { /* DM */ }
    return { created, joined };
}

function onUsername(el: HTMLElement) {
    if (el.dataset.ncAge) return;
    const msg = parseMessageElement(el);
    const uid = userIdFromElement(el) ?? (msg ? MessageStore.getMessage?.(msg.channelId, msg.messageId)?.author?.id : null);
    if (!uid) return;
    const { created, joined } = info(uid);
    if (!created) return;
    el.dataset.ncAge = "1";
    const fmt = (d: Date) => d.toLocaleDateString(getLanguage(), { dateStyle: "medium" });
    el.title = `${t("plugin.accountAge.created")}: ${fmt(created)} (${ageLabel(created)})${joined ? `\n${t("plugin.accountAge.joined")}: ${fmt(joined)} (${ageLabel(joined)})` : ""}`;
    const young = Date.now() - created.getTime() < Number(getOption(ID, "warnDays") || 30) * 86400000;
    if (young && getOption(ID, "badgeNew")) el.after(h("span", { className: "nc-new-account", title: el.title }, t("plugin.accountAge.new")));
}

function onProfile(el: HTMLElement) {
    if (el.querySelector(".nc-age-block")) return;
    const uid = userIdFromElement(el.querySelector("img[src*='/avatars/']") ?? el);
    if (!uid) return;
    const { created, joined } = info(uid);
    if (!created) return;
    const fmt = (d: Date) => d.toLocaleDateString(getLanguage(), { dateStyle: "long" });
    const block = h(
        "div",
        { className: "nc-age-block nc-root" },
        h("div", null, h("b", null, `${t("plugin.accountAge.created")}: `), `${fmt(created)} · ${ageLabel(created)}`),
        joined ? h("div", null, h("b", null, `${t("plugin.accountAge.joined")}: `), `${fmt(joined)} · ${ageLabel(joined)}`) : null
    );
    (el.querySelector('[class*="body"], [class*="userInfo"], [class*="profileBody"]') ?? el).appendChild(block);
}

export default definePlugin({
    id: ID,
    name: "plugin.accountAge.name",
    description: "plugin.accountAge.desc",
    category: "chat",
    options: {
        badgeNew: { type: "boolean", label: "plugin.accountAge.opt.badgeNew", default: true },
        warnDays: { type: "number", label: "plugin.accountAge.opt.warnDays", default: 30, min: 1, max: 365 },
        inProfiles: { type: "boolean", label: "plugin.accountAge.opt.inProfiles", default: true }
    },
    start() {
        setStyle("nc-account-age", `.nc-new-account{margin-left:6px;padding:0 5px;border-radius:4px;font-size:10px;font-weight:700;line-height:15px;vertical-align:1px;background:var(--status-warning,#f0b232);color:#000;text-transform:uppercase}.nc-age-block{margin:8px 0 0;padding:8px 10px;border-radius:8px;font-size:12px;background:color-mix(in srgb,var(--background-base-lowest,#000) 40%,transparent);display:flex;flex-direction:column;gap:2px}`);
        cleanups.push(observe(ID, 'li[id^="chat-messages-"] [class*="username"]', onUsername));
        if (getOption(ID, "inProfiles")) cleanups.push(observe(ID, '[class*="userPopout"], [class*="userProfileOuter"], [class*="profilePanel"]', onProfile));
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        setStyle("nc-account-age", null);
        document.querySelectorAll(".nc-new-account, .nc-age-block").forEach(e => e.remove());
        document.querySelectorAll<HTMLElement>("[data-nc-age]").forEach(e => delete e.dataset.ncAge);
    }
});
