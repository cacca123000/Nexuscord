/*
 * Now playing (#51): shows what you're listening to in ANY player (YouTube Music, Apple
 * Music, Tidal, VLC, browsers...) via the Windows media session. Spotify is skipped
 * (Discord already integrates it).
 */
import { dispatch, onDispatcherReady } from "../core/flux";
import { Native } from "../core/native";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "musicPresence";
const SOCKET = "NexusCordMusic";
let timer: ReturnType<typeof setInterval> | null = null;
let last = "";

export function appName(aumid: string): string {
    const known: [RegExp, string][] = [
        [/spotify/i, "Spotify"], [/youtube.?music|ytmdesktop|th-ch/i, "YouTube Music"], [/applemusic|itunes/i, "Apple Music"], [/tidal/i, "TIDAL"],
        [/deezer/i, "Deezer"], [/vlc/i, "VLC"], [/foobar/i, "foobar2000"], [/musicbee/i, "MusicBee"], [/chrome/i, "Chrome"], [/msedge|edge/i, "Edge"],
        [/firefox/i, "Firefox"], [/zunemusic|media\.player|microsoft\.zune/i, "Media Player"], [/soundcloud/i, "SoundCloud"], [/amazon/i, "Amazon Music"]
    ];
    return known.find(([r]) => r.test(aumid))?.[1] ?? aumid.split(/[!\\.]/).filter(Boolean).pop() ?? "Music";
}

async function poll() {
    const m = await Native.system.mediaSession().catch(() => null);
    const playing = m?.title && m.status === "Playing" && !/spotify/i.test(m.app ?? "") && !(getOption(ID, "ignoreBrowsers") && /chrome|edge|firefox|opera|brave/i.test(m.app ?? ""));
    const key = playing ? `${m!.app}|${m!.title}|${m!.artist}` : "";
    if (key === last) return;
    last = key;
    if (!playing) return void dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: SOCKET });
    const now = Date.now();
    const pos = (m!.position ?? 0) * 1000, dur = (m!.duration ?? 0) * 1000;
    dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        socketId: SOCKET,
        activity: {
            application_id: "0",
            name: appName(m!.app ?? ""),
            type: 2,
            details: m!.title,
            state: m!.artist ? `${m!.artist}${m!.album ? " — " + m!.album : ""}` : undefined,
            timestamps: dur > 0 ? { start: now - pos, end: now - pos + dur } : { start: now },
            flags: 1
        }
    });
}

export default definePlugin({
    id: ID,
    name: "plugin.musicPresence.name",
    description: "plugin.musicPresence.desc",
    category: "media",
    options: { ignoreBrowsers: { type: "boolean", label: "plugin.musicPresence.opt.ignoreBrowsers", default: false } },
    start() {
        onDispatcherReady(() => {
            poll();
            timer = setInterval(poll, 10_000);
        });
    },
    stop() {
        if (timer) clearInterval(timer);
        last = "";
        dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: SOCKET });
    }
});
