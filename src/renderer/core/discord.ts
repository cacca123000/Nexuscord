/*
 * Lazily-resolved Discord internals shared by all plugins.
 * Every name here was verified against the real Discord web client (Nov 2026) with
 * test/real/probe.mjs; everything is lazy so a missing module only disables the
 * feature that needs it.
 */
import { dispatch, Dispatcher } from "./flux";
import { find, findByProps, findMapped, findStore, lazy } from "./webpack";

const store = <T = any>(name: string) => lazy<T>(() => findStore(name));

export const UserStore = store("UserStore");
export const ChannelStore = store("ChannelStore");
export const GuildStore = store("GuildStore");
export const GuildMemberStore = store("GuildMemberStore");
export const GuildRoleStore = store("GuildRoleStore");
export const GuildChannelStore = store("GuildChannelStore");
export const MessageStore = store("MessageStore");
export const PermissionStore = store("PermissionStore");
export const PresenceStore = store("PresenceStore");
export const RelationshipStore = store("RelationshipStore");
export const ReadStateStore = store("ReadStateStore");
export const SelectedChannelStore = store("SelectedChannelStore");
export const SelectedGuildStore = store("SelectedGuildStore");
export const PrivateChannelSortStore = store("PrivateChannelSortStore");
export const StickersStore = store("StickersStore");
export const EmojiStore = store("EmojiStore");
export const UserProfileStore = store("UserProfileStore");
export const MediaEngineStore = store("MediaEngineStore");
export const LocaleStore = store("LocaleStore");
export const SortedGuildStore = store("SortedGuildStore");
export const StreamerModeStore = store("StreamerModeStore");
export const TypingStore = store("TypingStore");
export const UserGuildSettingsStore = store("UserGuildSettingsStore");

export const MessageActions = lazy(() => find(m => typeof m?.sendMessage === "function" && typeof m?.editMessage === "function"));
export const TypingActions = lazy(() => find(m => typeof m?.startTyping === "function" && typeof m?.stopTyping === "function"));
export const ComponentDispatch = lazy(() => findByProps("dispatchToLastSubscribed"));
export const RestAPI = lazy(() => find(m => typeof m === "object" && m !== null && typeof m.del === "function" && typeof m.put === "function" && typeof m.patch === "function"));
/** Fingerprints of Discord's router functions (their exports are minified nowadays). */
export const ROUTER_MARKERS = { transitionTo: "transitionTo - Transitioning to", transitionToGuild: "transitionToGuild - Transitioning to", replaceWith: "Replacing route with" };
export const NavigationRouter = lazy(
    () => find(m => typeof m?.transitionTo === "function" && typeof m?.transitionToGuild === "function") ?? findMapped(ROUTER_MARKERS)
);
/** Discord's sound player (playSound(name, volume) in older builds). */
export const SOUND_MARKERS = { playSound: "Unable to find sound for pack name" };
export const PremiumUtils = lazy(() => findByProps("canUseEmojisEverywhere"));
/**
 * React itself. A props-only filter is NOT enough: Discord's intl runtime also exports
 * `useState`/`createElement`/`Component`, and its createElement returns `{ locale, ast }`
 * message objects - rendering one of those crashes the whole settings screen (2.0.1 bug).
 */
export const isReactModule = (m: any): boolean => {
    try {
        if (!m || typeof m.createElement !== "function" || typeof m.useState !== "function" || typeof m.useEffect !== "function") return false;
        if (typeof m.Component !== "function" || typeof m.cloneElement !== "function" || typeof m.isValidElement !== "function" || m.Fragment == null) return false;
        if (typeof m.version !== "string" || !/^\d+\.\d+/.test(m.version)) return false;
        return m.isValidElement(m.createElement("div", null));
    } catch {
        return false;
    }
};
export const React = lazy<any>(() => find(isReactModule));
/**
 * react-dom/client. Discord's build is tree-shaken down to `{ createRoot }`, so validate
 * behaviour instead of prop names: the root must expose render/unmount.
 */
export const isReactDomClient = (m: any): boolean => {
    if (!m || typeof m.createRoot !== "function" || Object.keys(m).length > 6) return false;
    try {
        const root = m.createRoot(document.createElement("div"));
        const ok = typeof root?.render === "function" && typeof root?.unmount === "function";
        root?.unmount?.();
        return ok;
    } catch {
        return false;
    }
};
export const isReactDom = (m: any): boolean =>
    !!m && typeof m.createPortal === "function" && typeof m.flushSync === "function" && typeof m.version === "string" && /^\d+\.\d+/.test(m.version);
export const ReactDOMClient = lazy<any>(() => find(isReactDomClient));
/** Numeric TS enum (reverse-mapped): ROOT=0, SECTION=1, SIDEBAR_ITEM=2, PANEL=3, CATEGORY=5, CUSTOM=19 (Nov 2026) */
export const isLayoutTypesEnum = (m: any) =>
    m && typeof m.CUSTOM === "number" && typeof m.SIDEBAR_ITEM === "number" && m[m.CUSTOM] === "CUSTOM" && m[m.SECTION] === "SECTION";
export const SettingsLayoutTypes = lazy<any>(() => find(isLayoutTypesEnum));

export const DISCORD_EPOCH = 1420070400000n;

/** Snowflake -> creation Date. */
export function snowflakeDate(id: string | undefined | null): Date | null {
    if (!id || !/^\d{15,22}$/.test(id)) return null;
    return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
}

export function currentUser(): any {
    try {
        return UserStore.getCurrentUser?.();
    } catch {
        return undefined;
    }
}

export function currentChannelId(): string | undefined {
    try {
        return SelectedChannelStore.getChannelId?.() ?? undefined;
    } catch {
        return undefined;
    }
}

export function currentGuildId(): string | undefined {
    try {
        return SelectedGuildStore.getGuildId?.() ?? undefined;
    } catch {
        return undefined;
    }
}

export function getMessage(channelId: string | undefined, messageId: string | undefined): any {
    if (!channelId || !messageId) return undefined;
    try {
        return MessageStore.getMessage?.(channelId, messageId);
    } catch {
        return undefined;
    }
}

/** Inserts text into the focused chat input (Discord's Slate editor). */
export function insertText(text: string): boolean {
    try {
        ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", { rawText: text, plainText: text });
        return true;
    } catch {
        return false;
    }
}

/** Navigates inside Discord (/channels/...). */
export function navigate(path: string): void {
    try {
        NavigationRouter.transitionTo(path);
    } catch {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
    }
}

export function jumpToMessage(guildId: string | null | undefined, channelId: string, messageId?: string) {
    navigate(`/channels/${guildId ?? "@me"}/${channelId}${messageId ? "/" + messageId : ""}`);
}

export function avatarUrl(user: any, size = 64): string {
    if (!user) return "";
    if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "webp"}?size=${size}`;
    const idx = Number((BigInt(user.id ?? 0) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

export function displayName(user: any): string {
    return user?.globalName || user?.global_name || user?.username || "?";
}

export { dispatch, Dispatcher };
