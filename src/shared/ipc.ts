/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
    GET_PRELOAD: "nexuscord:get-preload",
    GET_SETTINGS: "nexuscord:get-settings",
    SET_SETTINGS: "nexuscord:set-settings",
    GET_PATHS: "nexuscord:get-paths",

    THEMES_LIST: "nexuscord:themes-list",
    THEMES_CHANGED: "nexuscord:themes-changed",
    QUICKCSS_GET: "nexuscord:quickcss-get",
    QUICKCSS_SET: "nexuscord:quickcss-set",
    QUICKCSS_CHANGED: "nexuscord:quickcss-changed",

    PLUGINS_LIST: "nexuscord:plugins-list",
    PLUGINS_CHANGED: "nexuscord:plugins-changed",
    BD_DATA_LOAD: "nexuscord:bd-data-load",
    BD_DATA_SAVE: "nexuscord:bd-data-save",

    OPEN_FOLDER: "nexuscord:open-folder",
    OPEN_EXTERNAL: "nexuscord:open-external",

    MEMORY_STATS: "nexuscord:memory-stats",
    PURGE_CACHE: "nexuscord:purge-cache",
    RELAUNCH: "nexuscord:relaunch",
    SET_ACRYLIC: "nexuscord:set-acrylic",

    PHISH_CHECK_SYNC: "nexuscord:phish-check-sync",
    PHISH_STATUS: "nexuscord:phish-status",
    PHISH_REFRESH: "nexuscord:phish-refresh",
    UNSHORTEN: "nexuscord:unshorten",
    LINK_BLOCKED: "nexuscord:link-blocked",

    // ---- v2 features ----
    DATA_LOAD: "nexuscord:data-load",
    DATA_SAVE: "nexuscord:data-save",
    DIALOG_OPEN_FILE: "nexuscord:dialog-open-file",
    DIALOG_SAVE_TEXT: "nexuscord:dialog-save-text",
    DIALOG_OPEN_TEXT: "nexuscord:dialog-open-text",
    DOWNLOAD: "nexuscord:download",
    SHOW_IN_FOLDER: "nexuscord:show-in-folder",
    HTTP: "nexuscord:http",
    WINDOW_SET: "nexuscord:window-set",
    WINDOW_ACTION: "nexuscord:window-action",
    WINDOWS_HELLO: "nexuscord:windows-hello",
    MEDIA_SESSION: "nexuscord:media-session",
    UPDATE_CHECK: "nexuscord:update-check",
    UPDATE_APPLY: "nexuscord:update-apply",
    SAFE_MODE: "nexuscord:safe-mode",
    BOOT_OK: "nexuscord:boot-ok",
    MEM_HISTORY: "nexuscord:mem-history",
    LAUNCH_INSTANCE: "nexuscord:launch-instance",
    SECRET_SET: "nexuscord:secret-set",
    SECRET_HAS: "nexuscord:secret-has",
    GIST_SYNC: "nexuscord:gist-sync",
    ADDON_INSTALL: "nexuscord:addon-install",
    ADDON_DELETE: "nexuscord:addon-delete",
    MAIN_EVENT: "nexuscord:main-event",
    APP_INFO: "nexuscord:app-info"
} as const;

/** Hosts the renderer may reach through the main process (CORS-free) - nothing else. */
export const HTTP_ALLOWLIST = [
    "translate.googleapis.com",
    "api.betterdiscord.app",
    "betterdiscord.app",
    "raw.githubusercontent.com",
    "api.github.com",
    "github.com",
    "objects.githubusercontent.com",
    "fonts.googleapis.com",
    "www.virustotal.com"
];

export type FolderKind = "themes" | "plugins" | "data";
