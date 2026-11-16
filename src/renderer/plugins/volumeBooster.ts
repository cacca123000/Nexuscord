/* Volume booster (#47): per-user voice volume up to 500% (Discord stops at 200%). */
import { registerMenuItem } from "../core/contextMenu";
import { MediaEngineStore, UserStore } from "../core/discord";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { openModal, Slider, toast } from "../core/ui";
import { findByProps } from "../core/webpack";

const ID = "volumeBooster";
let off = () => {};

function currentVolume(userId: string): number {
    try {
        return Math.round(MediaEngineStore.getLocalVolume?.(userId) ?? 100);
    } catch {
        return 100;
    }
}

function openBooster(userId: string) {
    const mod = findByProps("setLocalVolume");
    if (!mod) return toast(t("plugin.volumeBooster.unavailable"), "error");
    const max = Number(getOption(ID, "max")) || 500;
    const user = UserStore.getUser?.(userId);
    openModal({
        title: t("plugin.volumeBooster.title", { name: user?.globalName ?? user?.username ?? userId }),
        body: h("div", { className: "nc-stack" }, h("p", { className: "nc-sub", style: "margin:0" }, t("plugin.volumeBooster.hint")), Slider({ value: currentVolume(userId), min: 0, max, step: 5, unit: "%", onChange: v => mod.setLocalVolume(userId, v) }))
    });
}

export default definePlugin({
    id: ID,
    name: "plugin.volumeBooster.name",
    description: "plugin.volumeBooster.desc",
    category: "media",
    options: { max: { type: "select", label: "plugin.volumeBooster.opt.max", default: 500, options: [300, 400, 500, 800].map(v => ({ label: `${v}%`, value: v })) } },
    start() {
        off = registerMenuItem(ID, { id: "nc-volume-boost", order: 15, label: () => t("plugin.volumeBooster.action"), when: m => !!m.userId && !m.messageId, action: m => openBooster(m.userId!) });
    },
    stop: () => off()
});
