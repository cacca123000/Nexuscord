/*
 * IPC handlers exposed to the renderer through the preload bridge.
 * Every handler validates its input: the renderer is treated as untrusted
 * (it runs third-party BetterDiscord plugins), so there is no generic fs access.
 */
import { app, BrowserWindow, ipcMain, session, shell, WebContents } from "electron";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { FolderKind, IPC } from "../shared/ipc";
import { parseMeta } from "../shared/meta";
import { watchDir } from "./fileWatch";
import { getPhishingStatus, isPhishingHost, refreshPhishingLists, unshorten } from "./linkShieldMain";
import { DATA_DIR, PLUGINS_DIR, QUICKCSS_FILE, THEMES_DIR } from "./paths";
import { getSettings, setSettings } from "./settings";

/** webContents id -> Discord's original preload script */
export const originalPreloads = new Map<number, string>();
/** URLs the user explicitly chose to open despite a warning (consumed once) */
const allowOnce = new Set<string>();

const subscribers = new Set<WebContents>();

function broadcast(channel: string, ...args: unknown[]) {
    for (const wc of subscribers) {
        if (wc.isDestroyed()) subscribers.delete(wc);
        else wc.send(channel, ...args);
    }
}

function safeFileName(name: unknown, ext: string): string | null {
    if (typeof name !== "string") return null;
    const base = basename(name);
    if (base !== name || !base.endsWith(ext) || base.startsWith(".")) return null;
    return base;
}

function readAddons(dir: string, ext: string) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(f => f.endsWith(ext))
        .map(file => {
            try {
                const source = readFileSync(join(dir, file), "utf8");
                return { file, meta: parseMeta(source, file.slice(0, -ext.length)), source };
            } catch (e) {
                return { file, meta: parseMeta("", file), source: "", error: String(e) };
            }
        });
}

export function listThemes() {
    return readAddons(THEMES_DIR, ".theme.css");
}

export function isHttpUrl(url: unknown): url is string {
    if (typeof url !== "string" || url.length > 8192) return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

/** Called by the main-process openExternal guard; true = allowed */
export function consumeAllowOnce(url: string): boolean {
    return allowOnce.delete(url);
}

export function notifyLinkBlocked(url: string, reason: string) {
    broadcast(IPC.LINK_BLOCKED, url, reason);
}

export function registerIpc(): void {
    ipcMain.on(IPC.GET_PRELOAD, e => {
        e.returnValue = originalPreloads.get(e.sender.id) ?? null;
        subscribers.add(e.sender);
    });

    ipcMain.on(IPC.GET_SETTINGS, e => {
        e.returnValue = getSettings();
    });
    ipcMain.handle(IPC.SET_SETTINGS, (_e, next) => {
        setSettings(next);
        return true;
    });
    ipcMain.on(IPC.GET_PATHS, e => {
        e.returnValue = { data: DATA_DIR, themes: THEMES_DIR, plugins: PLUGINS_DIR };
    });

    // ---- Themes & QuickCSS -------------------------------------------------
    ipcMain.handle(IPC.THEMES_LIST, () => listThemes());
    ipcMain.handle(IPC.QUICKCSS_GET, () => {
        try {
            return readFileSync(QUICKCSS_FILE, "utf8");
        } catch {
            return "";
        }
    });
    ipcMain.handle(IPC.QUICKCSS_SET, (_e, css) => {
        if (typeof css !== "string") return false;
        writeFileSync(QUICKCSS_FILE, css);
        return true;
    });

    // ---- External BetterDiscord plugins -----------------------------------
    ipcMain.handle(IPC.PLUGINS_LIST, () => readAddons(PLUGINS_DIR, ".plugin.js"));
    ipcMain.on(IPC.BD_DATA_LOAD, (e, plugin) => {
        const file = safeFileName(`${plugin}.config.json`, ".config.json");
        try {
            e.returnValue = file ? JSON.parse(readFileSync(join(PLUGINS_DIR, file), "utf8")) : {};
        } catch {
            e.returnValue = {};
        }
    });
    ipcMain.handle(IPC.BD_DATA_SAVE, (_e, plugin, data) => {
        const file = safeFileName(`${plugin}.config.json`, ".config.json");
        if (!file) return false;
        writeFileSync(join(PLUGINS_DIR, file), JSON.stringify(data ?? {}, null, 4));
        return true;
    });

    // ---- Shell ----------------------------------------------------------------
    ipcMain.handle(IPC.OPEN_FOLDER, (_e, kind: FolderKind) => {
        const dir = kind === "themes" ? THEMES_DIR : kind === "plugins" ? PLUGINS_DIR : DATA_DIR;
        return shell.openPath(dir);
    });
    ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url, opts?: { bypassShield?: boolean }) => {
        if (!isHttpUrl(url)) return false;
        if (opts?.bypassShield) allowOnce.add(url);
        return shell.openExternal(url).then(() => true);
    });

    // ---- Performance ----------------------------------------------------------
    ipcMain.handle(IPC.MEMORY_STATS, () => {
        const metrics = app.getAppMetrics();
        const totalKB = metrics.reduce((sum, m) => sum + (m.memory.privateBytes ?? m.memory.workingSetSize), 0);
        return {
            totalMB: Math.round(totalKB / 1024),
            processes: metrics.map(m => ({
                type: m.type,
                name: m.name,
                mb: Math.round((m.memory.privateBytes ?? m.memory.workingSetSize) / 1024)
            })),
            main: process.memoryUsage()
        };
    });
    ipcMain.handle(IPC.PURGE_CACHE, async () => {
        const s = session.defaultSession;
        await s.clearCache();
        await s.clearCodeCaches({}).catch(() => {});
        return true;
    });
    ipcMain.handle(IPC.RELAUNCH, () => {
        app.relaunch();
        app.exit(0);
    });
    ipcMain.handle(IPC.SET_ACRYLIC, (e, enabled: boolean) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        if (!win || process.platform !== "win32" || !win.setBackgroundMaterial) return false;
        try {
            win.setBackgroundColor(enabled ? "#00000000" : "#313338");
            win.setBackgroundMaterial(enabled ? "acrylic" : "none");
        } catch {
            return false;
        }
        return true;
    });

    // ---- LinkShield -----------------------------------------------------------
    ipcMain.on(IPC.PHISH_CHECK_SYNC, (e, host) => {
        e.returnValue = typeof host === "string" && isPhishingHost(host);
    });
    ipcMain.handle(IPC.PHISH_STATUS, () => getPhishingStatus());
    ipcMain.handle(IPC.PHISH_REFRESH, async () => {
        await refreshPhishingLists(true);
        return getPhishingStatus();
    });
    ipcMain.handle(IPC.UNSHORTEN, (_e, url) => (isHttpUrl(url) ? unshorten(url) : { url, hops: 0 }));

    // ---- Live reload watchers ------------------------------------------------
    watchDir(THEMES_DIR, () => broadcast(IPC.THEMES_CHANGED, listThemes()));
    watchDir(PLUGINS_DIR, file => {
        if (!file || file.endsWith(".plugin.js")) broadcast(IPC.PLUGINS_CHANGED, file);
    });
    watchDir(DATA_DIR, file => {
        if (file === "quickcss.css") {
            try {
                broadcast(IPC.QUICKCSS_CHANGED, readFileSync(QUICKCSS_FILE, "utf8"));
            } catch { /* deleted */ }
        }
    });
}
