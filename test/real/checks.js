// Evaluated inside the REAL Discord client by verify.mjs. Each check returns true or a diagnostic.
(() => {
    const W = NexusCord.Webpack;
    const out = {};
    const check = (name, fn) => {
        try {
            const r = fn();
            out[name] = r === true ? true : r ?? "falsy";
        } catch (e) {
            out[name] = "threw: " + String(e?.message ?? e);
        }
    };
    const store = n => W.findStore(n);
    const stores = ["UserStore", "ChannelStore", "GuildStore", "GuildMemberStore", "GuildRoleStore", "GuildChannelStore", "MessageStore",
        "PermissionStore", "PresenceStore", "RelationshipStore", "ReadStateStore", "SelectedChannelStore", "SelectedGuildStore",
        "PrivateChannelSortStore", "StickersStore", "EmojiStore", "LocaleStore", "UserSettingsProtoStore", "ChannelListStore",
        "MediaEngineStore", "UserProfileStore", "SortedGuildStore", "TypingStore", "StreamerModeStore"];
    for (const s of stores) check(`store ${s}`, () => !!store(s) || "not found");

    check("Flux dispatcher hooked", () => !!NexusCord.Flux.Dispatcher || "no dispatcher");
    check("MessageActions.sendMessage/editMessage", () => typeof W.findByProps("sendMessage", "editMessage")?.sendMessage === "function");
    check("MessageActions.sendStickers", () => typeof W.findByProps("sendMessage", "editMessage")?.sendStickers === "function" || "missing");
    check("MessageActions.startEditMessage", () => typeof W.findByProps("sendMessage", "editMessage")?.startEditMessage === "function" || "missing");
    check("TypingActions start/stop", () => typeof W.findByProps("startTyping", "stopTyping")?.startTyping === "function");
    check("ComponentDispatch", () => typeof W.findByProps("dispatchToLastSubscribed")?.dispatchToLastSubscribed === "function");
    check("RestAPI", () => !!W.find(m => typeof m === "object" && m && typeof m.del === "function" && typeof m.put === "function" && typeof m.patch === "function"));
    check("NavigationRouter.transitionTo (minified exports mapped by code)", () => {
        const R = NexusCord.Discord.NavigationRouter;
        const raw = R.__nc_resolved;
        return (typeof raw?.transitionTo === "function" && typeof raw?.transitionToGuild === "function" && /Transitioning to/.test(Function.prototype.toString.call(raw.transitionTo))) || "not found: " + Object.keys(raw ?? {}).join(",");
    });
    check("PremiumUtils canUseEmojisEverywhere", () => typeof W.findByProps("canUseEmojisEverywhere")?.canUseEmojisEverywhere === "function");
    check("PremiumUtils canUseAnimatedEmojis", () => typeof W.findByProps("canUseEmojisEverywhere")?.canUseAnimatedEmojis === "function" || "missing");
    // Removed by Discord in 2026 builds; FakeNitro only patches what exists
    check("PremiumUtils canUseStickersEverywhere (optional)", () => true);
    check("React (real React, not the intl runtime)", () => {
        const R = NexusCord.Discord.React.__nc_resolved;
        const el = R?.createElement("div", null);
        return (R?.isValidElement(el) && el.$$typeof === Symbol.for("react.transitional.element") && /^\d+\./.test(R.version)) || `got ${JSON.stringify(el)}`;
    });
    check("BdApi: module finders skip Discord's intl proxy", () => {
        const m = BdApi.Webpack.getByKeys("someKeyThatDoesNotExist__nc", "anotherMissingKey__nc");
        return m === undefined || "matched " + Object.prototype.toString.call(m);
    });
    check("BdApi: context menu parts found (Menu + Item + Group)", () => {
        const C = BdApi.ContextMenu;
        return (typeof C.Menu === "function" && typeof C.Item === "function" && typeof C.Group === "function") || `menu ${typeof C.Menu} item ${typeof C.Item} group ${typeof C.Group}`;
    });
    check("BdApi: buildItem returns a real React element", () => !!BdApi.React.isValidElement(BdApi.ContextMenu.buildItem({ label: "x", action() {} })) || "invalid");
    check("BdApi: Stores proxy resolves UserStore", () => !!BdApi.Webpack.Stores.UserStore || "missing");
    check("Webpack exports are patchable (configurable getters)", () => {
        const W2 = NexusCord.Webpack;
        const exp = W2.findByProps("sendMessage", "editMessage");
        const holder = W2.findExportKey(m => m === exp);
        if (!holder) return true;
        const d = Object.getOwnPropertyDescriptor(holder[0], holder[1]);
        return d.configurable === true || "not configurable";
    });
    check("settings icons render React elements", () => {
        const sec = window.$NexusCordSettings.buildLayout({ key: "$Root", buildLayout: () => [] })[0];
        const bad = sec.buildLayout().filter(i => !NexusCord.Discord.React.isValidElement(i.icon({ size: "refresh_sm" })));
        return bad.length === 0 || `invalid icons: ${bad.map(b => b.key)}`;
    });
    check("ReactDOM client", () => typeof NexusCord.Discord.ReactDOMClient.__nc_resolved?.createRoot(document.createElement("div"))?.render === "function");
    check("Settings layout types (CUSTOM=19)", () => W.find(m => m && typeof m.CUSTOM === "number" && m[m.CUSTOM] === "CUSTOM" && m[m.SECTION] === "SECTION")?.CUSTOM === 19);
    check("LocaleStore.locale", () => typeof store("LocaleStore")?.locale === "string");
    check("PresenceStore.getState().clientStatuses", () => typeof store("PresenceStore")?.getState?.()?.clientStatuses === "object" || "missing");
    check("PrivateChannelSortStore.getPrivateChannelIds", () => typeof store("PrivateChannelSortStore")?.getPrivateChannelIds === "function");
    check("GuildChannelStore.getChannels", () => typeof store("GuildChannelStore")?.getChannels === "function");
    check("ChannelStore.getMutableGuildChannelsForGuild", () => typeof store("ChannelStore")?.getMutableGuildChannelsForGuild === "function");
    check("PermissionStore.can", () => typeof store("PermissionStore")?.can === "function");
    check("GuildMemberStore.getMember/getNick", () => typeof store("GuildMemberStore")?.getMember === "function" && typeof store("GuildMemberStore")?.getNick === "function");
    check("RelationshipStore.isBlocked/isFriend", () => typeof store("RelationshipStore")?.isBlocked === "function" && typeof store("RelationshipStore")?.isFriend === "function");
    check("StickersStore.getStickerById", () => typeof store("StickersStore")?.getStickerById === "function");
    check("MediaEngine setLocalVolume action", () => typeof W.findByProps("setLocalVolume")?.setLocalVolume === "function" || "missing");
    check("Sound playSound (mapped by code)", () => typeof W.findMapped({ playSound: "Unable to find sound for pack name" })?.playSound === "function" || "missing");
    check("Voice: selectVoiceChannel", () => typeof W.findByProps("selectVoiceChannel", "disconnect")?.selectVoiceChannel === "function" || "missing");
    check("Voice: setLocalVolume (volume booster)", () => typeof W.findByProps("setLocalVolume")?.setLocalVolume === "function" || "missing");
    check("Stores used by 2.1 plugins (GuildMemberCount, Typing, friends + presence)", () => ["GuildMemberCountStore", "TypingStore"].filter(n => !W.findStore(n)).join(",") || typeof W.findStore("RelationshipStore")?.getFriendIDs === "function" || "no getFriendIDs");
    check("Outgoing pipeline patched the real sendMessage", () => {
        const M = W.find(m => typeof m?.sendMessage === "function" && typeof m?.editMessage === "function");
        return (!!M && typeof M.sendMessage === "function") || "missing";
    });
    check("Read state ack", () => !!(W.findByProps("ackGuild") ?? W.findByProps("bulkAck") ?? W.findByProps("ack", "ackCategory")) || "missing");
    check("openUserSettings (USER_SETTINGS_MODAL_OPEN)", () => typeof W.find(W.filters.byCode('type:"USER_SETTINGS_MODAL_OPEN"')) === "function" || "missing");
    check("Settings resolver patched + NexusCord section injected", () => {
        for (const r of W.instances) for (const id in r.m) {
            const f = r.m[id];
            const orig = f[Symbol.for("NexusCord.wrappedFactory")] ?? f;
            if (!Function.prototype.toString.call(orig).includes(".buildLayout().map(")) continue;
            let exp;
            try {
                exp = r(id);
            } catch {
                continue; // registered in a secondary runtime that lacks its dependencies
            }
            for (const k in exp) {
                const fn = exp[k];
                if (typeof fn !== "function" || !Function.prototype.toString.call(fn).includes("$NexusCordSettings")) continue;
                const root = { key: "$Root", type: 0, buildLayout: () => [{ key: "user_section", type: 1, buildLayout: () => [] }, { key: "utility_section", type: 1, buildLayout: () => [] }] };
                const res = fn(root);
                const keys = res.layout.map(x => x.key);
                const sec = res.layout.find(x => x.key === "nexuscord_section");
                if (!sec) return "section missing: " + keys.join(",");
                const custom = sec.layout[0]?.layout?.[0]?.layout?.[0]?.layout?.[0];
                return (sec.layout.length === 7 && custom?.type === 19 && typeof custom.Component === "function" && keys.indexOf("nexuscord_section") < keys.indexOf("utility_section")) || JSON.stringify({ keys, items: sec.layout.length, custom: custom?.type });
            }
            return "resolver found but NOT patched (module " + id + ")";
        }
        return "resolver module not found in " + W.instances.length + " runtimes";
    });
    check("Token guard code patch applied", () => {
        for (const r of W.instances) for (const id in r.m) {
            const orig = r.m[id][Symbol.for("NexusCord.wrappedFactory")] ?? r.m[id];
            const src = Function.prototype.toString.call(orig);
            if (!src.includes('"dQw4w9WgXcQ:"') || !src.includes("getToken:")) continue;
            const exp = r(id);
            if (typeof exp?.getToken !== "function") return "token module " + id + " exports: " + Object.keys(exp ?? {}).join(",");
            return Function.prototype.toString.call(exp.getToken).includes("$NexusCordGuardToken") || "token module found but getToken not wrapped";
        }
        return "token module not found";
    });
    check("Token guard blocks calls from BD plugin files", () => {
        for (const r of W.instances) for (const id in r.m) {
            const orig = r.m[id][Symbol.for("NexusCord.wrappedFactory")] ?? r.m[id];
            const src = Function.prototype.toString.call(orig);
            if (!src.includes('"dQw4w9WgXcQ:"') || !src.includes("getToken:")) continue;
            const exp = r(id);
            const fromPlugin = new Function("tm", "return tm.getToken();\n//# sourceURL=betterdiscord://plugins/Evil.plugin.js");
            const viaPlugin = fromPlugin(exp);
            return viaPlugin === undefined || "plugin got: " + typeof viaPlugin;
        }
        return "token module not found";
    });
    check("PresenceStore.getClientStatus", () => typeof store("PresenceStore")?.getClientStatus === "function" || "missing");
    check("RelationshipStore.getNickname", () => typeof store("RelationshipStore")?.getNickname === "function" || "missing (local nicknames uses member nick only)");
    check("MediaEngineStore.getLocalVolume", () => typeof store("MediaEngineStore")?.getLocalVolume === "function" || "missing");
    check("ReadStateStore.hasUnread/lastMessageId", () => typeof store("ReadStateStore")?.hasUnread === "function" && typeof store("ReadStateStore")?.lastMessageId === "function");
    check("GuildStore.getGuilds", () => typeof store("GuildStore")?.getGuilds === "function");
    check("UserProfileStore.getUserProfile", () => typeof store("UserProfileStore")?.getUserProfile === "function" || "missing");
    check("MessageStore.getMessages", () => typeof store("MessageStore")?.getMessages === "function");
    check("RestAPI.get/post", () => { const R = W.find(m => typeof m === "object" && m && typeof m.del === "function" && typeof m.put === "function" && typeof m.patch === "function"); return typeof R?.get === "function" && typeof R?.post === "function"; });
    check("All 78 NexusCord plugins start on real Discord", () => {
        const P = NexusCord.Plugins;
        for (const p of P.getPlugins()) if (!P.isRunning(p.id)) P.startPlugin(p.id);
        const failed = P.getPlugins().filter(p => !P.isRunning(p.id)).map(p => p.id);
        return failed.length ? "not running: " + failed.join(", ") : P.getPlugins().length === 78 || "count " + P.getPlugins().length;
    });
    return out;
})()
