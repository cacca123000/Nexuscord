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
    LINK_BLOCKED: "nexuscord:link-blocked"
} as const;

export type FolderKind = "themes" | "plugins" | "data";
