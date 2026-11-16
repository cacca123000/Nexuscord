(async () => { const loaded = await (async () => {
    const r = NexusCord.Webpack.require;
    const ids = new Set();
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
        const text = await fetch(src).then(x => x.text()).catch(() => "");
        if (!text.includes(".u=function") && !text.includes("Loading chunk")) continue;
        for (const m of text.matchAll(/[{,](\d+):"[0-9a-f]{16,20}"/g)) ids.add(m[1]);
    }
    const before = Object.keys(r.m).length;
    const queue = [...ids];
    let ok = 0, fail = 0;
    const worker = async () => {
        while (queue.length) {
            const id = queue.shift();
            try {
                await r.e(+id);
                ok++;
            } catch {
                fail++;
            }
        }
    };
    await Promise.all(Array.from({ length: 32 }, worker));
    return { chunks: ids.size, ok, fail, modulesBefore: before, modulesAfter: Object.keys(r.m).length };
})(); const found = (() => {
    const m = NexusCord.Webpack.require.m;
    const src = {};
    for (const id in m) {
        try {
            src[id] = Function.prototype.toString.call(m[id][Symbol.for("NexusCord.wrappedFactory")] ?? m[id]);
        } catch { /* ignore */ }
    }
    const needles = [
        ".buildLayout().map", '"$Root"', "getPredicateSections", "SIDEBAR_ITEM", "canUseEmojisEverywhere", "canUseAnimatedEmojis",
        "canUseStickersEverywhere", "canUsePremiumProfileCustomization", "addInterceptor", "_dispatch(", '"LocaleStore"',
        '"GuildChannelStore"', '"ChannelListStore"', '"PermissionStore"', '"UserStore"', '"MessageStore"', '"ChannelStore"',
        '"StickersStore"', '"GuildRoleStore"', '"GuildMemberStore"', '"PresenceStore"', '"RelationshipStore"', '"ReadStateStore"',
        '"PrivateChannelSortStore"', '"UserSettingsProtoStore"', '"SelectedChannelStore"', '"SelectedGuildStore"', '"GuildStore"',
        '"MediaEngineStore"', "transitionTo", "startTyping", "stopTyping", "getPrivateChannelIds", "LOCAL_ACTIVITY_UPDATE",
        "setLocalVolume", "INSERT_TEXT", "ComponentDispatch", "playSound", "BULK_ACK", "clientStatuses", "CREATE_PENDING_REPLY",
        "startEditMessage", "sendStickers", "validNonShortcutEmojis", "getMutableGuildChannelsForGuild", "USER_SETTINGS_MODAL_OPEN",
        "getToken", "uploadFiles", "CloudUpload", "MESSAGE_DELETE_BULK", "getEmojiUnavailableReason", "isEmojiFiltered", "#{intl::"
    ];
    const out = {};
    for (const n of needles) {
        const ids = Object.keys(src).filter(id => src[id].includes(n));
        out[n] = ids.length + (ids.length ? " e.g. " + ids.slice(0, 3).join(",") : "");
    }
    return out;
})(); return { loaded, found }; })()
