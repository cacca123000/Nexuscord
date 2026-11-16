/* Call timer: how long you've been in the current voice call, right in the voice panel. */
import { h, setStyle } from "../core/dom";
import { formatDuration } from "../../shared/text";
import { observe } from "../core/domObserver";
import { subscribe } from "../core/flux";
import { t } from "../core/i18n";
import { definePlugin } from "../core/pluginManager";

const ID = "callTimer";
const cleanups: (() => void)[] = [];
let startedAt = 0;
let tick: ReturnType<typeof setInterval> | null = null;


function paint() {
    const els = document.querySelectorAll<HTMLElement>(".nc-call-timer");
    els.forEach(el => {
        el.textContent = startedAt ? formatDuration(Date.now() - startedAt) : "";
        el.hidden = !startedAt;
    });
}

function attach(panel: HTMLElement) {
    if (panel.querySelector(".nc-call-timer")) return;
    const target = panel.querySelector('[class*="rtcConnectionStatus_"]') ?? panel;
    target.appendChild(h("span", { className: "nc-call-timer", title: t("plugin.callTimer.title") }));
    paint();
}

export default definePlugin({
    id: ID,
    name: "plugin.callTimer.name",
    description: "plugin.callTimer.desc",
    category: "media",
    start() {
        setStyle(ID, `.nc-call-timer{margin-left:6px;font:600 12px var(--font-code,monospace);color:var(--text-muted,#949ba4);font-variant-numeric:tabular-nums}`);
        cleanups.push(
            subscribe("RTC_CONNECTION_STATE", a => {
                if (a.streamKey || (a.context && a.context !== "default")) return;
                if (a.state === "RTC_CONNECTED" && !startedAt) startedAt = Date.now();
                if (a.state === "DISCONNECTED" || a.state === "RTC_DISCONNECTED") startedAt = 0;
                paint();
            }),
            subscribe("VOICE_CHANNEL_SELECT", a => {
                if (!a.channelId) startedAt = 0;
                else if (a.currentVoiceChannelId && a.currentVoiceChannelId !== a.channelId) startedAt = Date.now();
                paint();
            }),
            observe(ID, '[class*="rtcConnectionStatusWrapper_"], [class*="rtcConnectionStatus_"]', el => attach((el.closest('[class*="rtcConnectionStatusWrapper_"]') as HTMLElement) ?? el))
        );
        tick = setInterval(() => startedAt && paint(), 1000);
    },
    stop() {
        cleanups.splice(0).forEach(c => c());
        if (tick) clearInterval(tick);
        tick = null;
        document.querySelectorAll(".nc-call-timer").forEach(e => e.remove());
        setStyle(ID, null);
    }
});
