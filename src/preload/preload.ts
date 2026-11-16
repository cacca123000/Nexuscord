/*
 * NexusCord preload.
 *  1. Exposes a narrow, validated `NexusCordNative` bridge to the page.
 *  2. Injects renderer.js into Discord's main world before Discord's webpack boots.
 *  3. Chains Discord's ORIGINAL preload so DiscordNative (voice, Krisp,
 *     screenshare, notifications...) keeps working exactly as before.
 */
import { contextBridge, ipcRenderer, webFrame } from "electron";
import { readFileSync } from "fs";
import { join } from "path";
import { FolderKind, IPC } from "../shared/ipc";
import type { NexusSettings } from "../shared/settings";

const originalPreload: string | null = ipcRenderer.sendSync(IPC.GET_PRELOAD);
const isDiscordApp = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\//.test(location.href);

function listen(channel: string, cb: (...args: any[]) => void): () => void {
    const handler = (_e: unknown, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

const NexusCordNative = {
    version: NEXUSCORD_VERSION,
    platform: process.platform,
    settings: {
        get: (): NexusSettings => ipcRenderer.sendSync(IPC.GET_SETTINGS),
        set: (s: NexusSettings): Promise<boolean> => ipcRenderer.invoke(IPC.SET_SETTINGS, s),
        paths: (): { data: string; themes: string; plugins: string } => ipcRenderer.sendSync(IPC.GET_PATHS)
    },
    themes: {
        list: () => ipcRenderer.invoke(IPC.THEMES_LIST),
        onChange: (cb: (themes: unknown) => void) => listen(IPC.THEMES_CHANGED, cb),
        getQuickCss: (): Promise<string> => ipcRenderer.invoke(IPC.QUICKCSS_GET),
        setQuickCss: (css: string) => ipcRenderer.invoke(IPC.QUICKCSS_SET, String(css)),
        onQuickCssChange: (cb: (css: string) => void) => listen(IPC.QUICKCSS_CHANGED, cb)
    },
    plugins: {
        list: () => ipcRenderer.invoke(IPC.PLUGINS_LIST),
        onChange: (cb: (file: string | null) => void) => listen(IPC.PLUGINS_CHANGED, cb),
        loadData: (plugin: string) => ipcRenderer.sendSync(IPC.BD_DATA_LOAD, String(plugin)),
        saveData: (plugin: string, data: unknown) => ipcRenderer.invoke(IPC.BD_DATA_SAVE, String(plugin), data)
    },
    shell: {
        openFolder: (kind: FolderKind) => ipcRenderer.invoke(IPC.OPEN_FOLDER, kind),
        openExternal: (url: string, opts?: { bypassShield?: boolean }) =>
            ipcRenderer.invoke(IPC.OPEN_EXTERNAL, String(url), { bypassShield: !!opts?.bypassShield })
    },
    perf: {
        memory: () => ipcRenderer.invoke(IPC.MEMORY_STATS),
        rendererMemory: () => {
            const m = process.memoryUsage();
            return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external };
        },
        purgeCache: async () => {
            webFrame.clearCache();
            return ipcRenderer.invoke(IPC.PURGE_CACHE);
        },
        clearWebFrameCache: () => webFrame.clearCache(),
        relaunch: () => ipcRenderer.invoke(IPC.RELAUNCH),
        setAcrylic: (enabled: boolean) => ipcRenderer.invoke(IPC.SET_ACRYLIC, !!enabled)
    },
    linkShield: {
        isPhishing: (host: string): boolean => ipcRenderer.sendSync(IPC.PHISH_CHECK_SYNC, String(host)),
        status: () => ipcRenderer.invoke(IPC.PHISH_STATUS),
        refresh: () => ipcRenderer.invoke(IPC.PHISH_REFRESH),
        unshorten: (url: string): Promise<{ url: string; hops: number }> => ipcRenderer.invoke(IPC.UNSHORTEN, String(url)),
        onBlocked: (cb: (url: string, reason: string) => void) => listen(IPC.LINK_BLOCKED, cb)
    }
};

export type NexusCordNativeApi = typeof NexusCordNative;

if (isDiscordApp) {
    try {
        contextBridge.exposeInMainWorld("NexusCordNative", NexusCordNative);
    } catch {
        // contextIsolation disabled - share the object directly
        (window as any).NexusCordNative = NexusCordNative;
    }

    try {
        const code = readFileSync(join(__dirname, "renderer.js"), "utf8");
        webFrame.executeJavaScript(`${code}\n//# sourceURL=nexuscord://renderer.js`).catch(e =>
            console.error("[NexusCord] renderer failed to start:", e)
        );
    } catch (e) {
        console.error("[NexusCord] Could not read renderer.js:", e);
    }
}

// Always chain Discord's original preload last.
if (originalPreload) {
    try {
        require(originalPreload);
    } catch (e) {
        console.error("[NexusCord] Discord's original preload threw:", e);
    }
}
