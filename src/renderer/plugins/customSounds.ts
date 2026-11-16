/* Custom sounds (#48): replace or mute any Discord sound (message, mention, join, mute...). */
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { Native } from "../core/native";
import { Patcher } from "../core/patcher";
import { definePlugin } from "../core/pluginManager";
import { dataStore } from "../core/storage";
import { Button, toast } from "../core/ui";
import { waitForProps } from "../core/webpack";

const ID = "customSounds";
type Entry = { mode: "custom"; dataUrl: string; name: string; volume: number } | { mode: "mute" };
const store = dataStore<Record<string, Entry>>("customSounds", {});
export const SOUNDS = ["message1", "mention1", "call_ringing", "call_calling", "user_join", "user_leave", "user_moved", "mute", "unmute", "deafen", "undeafen", "disconnect", "ptt_start", "ptt_stop", "stream_started", "stream_ended", "stream_user_joined", "stream_user_left", "reconnect", "activity_launch"];
let stopWait = () => {};
const audios = new Map<string, HTMLAudioElement>();

function play(e: Entry & { mode: "custom" }, key: string) {
    let a = audios.get(key);
    if (!a || a.src !== e.dataUrl) audios.set(key, (a = new Audio(e.dataUrl)));
    a.volume = Math.min(1, Math.max(0, e.volume / 100));
    a.currentTime = 0;
    a.play().catch(() => {});
}

function Panel(): Node {
    const list = h("div", { className: "nc-stack" });
    const draw = () =>
        list.replaceChildren(
            ...SOUNDS.map(name => {
                const e = store.get()[name];
                return h(
                    "div",
                    { className: "nc-row", style: "padding:8px 12px" },
                    h("div", { className: "nc-row-label" }, name, h("small", null, !e ? t("plugin.customSounds.default") : e.mode === "mute" ? t("plugin.customSounds.muted") : e.name)),
                    e?.mode === "custom" ? Button({ variant: "icon", children: "▶", title: t("plugin.customSounds.preview"), onClick: () => play(e, name) }) : null,
                    Button({ children: t("appearance.choose"), onClick: async () => { const f = await Native.files.pick({ kind: "audio", copyAs: `sound-${name}` }); if (!f?.dataUrl) return; store.update(d => void (d[name] = { mode: "custom", dataUrl: f.dataUrl!, name: f.name, volume: 80 })); draw(); } }),
                    Button({ variant: e?.mode === "mute" ? "primary" : undefined, children: t("plugin.customSounds.mute"), onClick: () => (store.update(d => void (d[name] = { mode: "mute" })), draw()) }),
                    e ? Button({ variant: "ghost", children: t("appearance.reset"), onClick: () => (store.update(d => void delete d[name]), draw()) }) : null
                );
            })
        );
    draw();
    return list;
}

export default definePlugin({
    id: ID,
    name: "plugin.customSounds.name",
    description: "plugin.customSounds.desc",
    category: "media",
    settingsPanel: Panel,
    start() {
        stopWait = waitForProps(["playSound"], mod => {
            Patcher.instead(ID, mod, "playSound", (self, args, original) => {
                const e = store.get()[String(args[0])];
                if (!e) return original.apply(self, args);
                if (e.mode === "custom") play(e, String(args[0]));
                return undefined;
            });
        }, ID);
        void toast;
    },
    stop() {
        stopWait();
        audios.clear();
    }
});
