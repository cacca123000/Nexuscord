// Probe expression: counts how many REAL Discord module factories contain each string.
(() => {
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
})()
