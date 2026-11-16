(self.webpackChunkdiscord_app = self.webpackChunkdiscord_app || []).push([[1], {
    100: (module, exports) => {
        // Flux dispatcher
        class Dispatcher {
            constructor() { this._subscriptions = {}; this._actionHandlers = {}; }
            _dispatch(action) { (this._subscriptions[action.type] || []).forEach(cb => cb(action)); }
            dispatch(action) { this._dispatch(action); return Promise.resolve(); }
            subscribe(type, cb) { (this._subscriptions[type] ||= []).push(cb); }
            unsubscribe(type, cb) { this._subscriptions[type] = (this._subscriptions[type] || []).filter(x => x !== cb); }
            isDispatching() { return false; }
        }
        exports.Z = new Dispatcher();
    },
    101: (module, exports, req) => {
        const D = req(100).Z;
        class LocaleStore { constructor() { this._dispatchToken = "1"; this.locale = "en-US"; this.l = []; }
            getName() { return "LocaleStore"; } addChangeListener(f) { this.l.push(f); } }
        const store = new LocaleStore();
        D.subscribe("USER_SETTINGS_LOCALE_OVERRIDE", a => { store.locale = a.locale; store.l.forEach(f => f()); });
        exports.default = store;
    },
    99: (module, exports) => {
        // Decoy: Discord's intl runtime ALSO exports useState/createElement/Component, but its
        // createElement returns { locale, ast } - picking it as React crashed settings in 2.0.1.
        exports.useState = () => {}; exports.useEffect = () => {}; exports.Component = class {};
        exports.createElement = () => ({ locale: "en-US", ast: [] });
    },
    102: (module, exports) => {
        // React-like stub: just enough to pass NexusCord's real-React validation
        const EL = Symbol.for("react.transitional.element");
        exports.version = "19.2.3"; exports.Fragment = Symbol.for("react.fragment");
        exports.createElement = (type, props, ...children) => ({ $$typeof: EL, type, props: { ...props, children } });
        exports.isValidElement = o => !!o && o.$$typeof === EL; exports.cloneElement = e => ({ ...e });
        exports.useState = () => {}; exports.Component = class {};
        exports.useRef = () => ({ current: null }); exports.useEffect = () => {};
    },
    103: (module, exports) => {
        class UserStore { constructor() { this._dispatchToken = "2"; } getName() { return "UserStore"; }
            getCurrentUser() { return { id: "111", username: "tester", premiumType: 0 }; }
            getUser(id) { return { id, username: "user" + id, bot: false }; } }
        exports.Z = new UserStore();
    },
    104: (module, exports) => {
        class MessageStore { constructor() { this._dispatchToken = "3"; this.m = { "m1": { id: "m1", channel_id: "c1", content: "original text", author: { id: "222", bot: false } } }; }
            getName() { return "MessageStore"; } getMessage(c, id) { return this.m[id]; } }
        exports.Z = new MessageStore();
    },
    105: (module, exports) => {
        exports.sendMessage = (channelId, msg, w, opts) => { (window.__sentAll ||= []).push({ channelId, msg, opts }); window.__sent = { channelId, msg }; return Promise.resolve(); };
        exports.editMessage = () => {};
        exports.startEditMessage = (c, m, content) => (window.__editing = { c, m, content });
        exports.sendStickers = () => {};
    },
    // Discord 2025+ settings layout helpers - written as METHOD SHORTHAND like the real client
    108(module, exports) {
        var i, r = ((i = {})[i.ROOT = 0] = "ROOT", i[i.SECTION = 1] = "SECTION", i[i.SIDEBAR_ITEM = 2] = "SIDEBAR_ITEM", i[i.PANEL = 3] = "PANEL", i[i.CATEGORY = 5] = "CATEGORY", i[i.CUSTOM = 19] = "CUSTOM", i);
        exports.Z6 = r;
        exports.hl = function (t) { return function t(n) { if ("buildLayout" in n && "function" == typeof n.buildLayout) { let u = n.buildLayout().map(t), { buildLayout: e, ...r } = n, i = { ...r, layout: u }; return u.forEach(t => t.parent = i), i } return n }(t) };
    },
    109: (module, exports) => {
        exports.dispatchToLastSubscribed = (ev, data) => (window.__inserted = data?.rawText);
    },
    106: (module, exports) => {
        const channels = {
            c1: { id: "c1", name: "general", guild_id: "g1", type: 0 },
            dm1: { id: "dm1", name: "", type: 1, recipients: ["333"] },
            "1180000000000000000": { id: "1180000000000000000", name: "mods-only", guild_id: "g1", type: 0, topic: "Moderator coordination", rateLimitPerUser: 30,
                      permissionOverwrites: { g1: { id: "g1", type: 0, allow: 0n, deny: 1024n }, r1: { id: "r1", type: 0, allow: 1024n, deny: 0n } } }
        };
        class ChannelStore { constructor() { this._dispatchToken = "4"; } getName() { return "ChannelStore"; }
            getChannel(id) { return channels[id]; } getMutableGuildChannelsForGuild() { return channels; } }
        exports.Z = new ChannelStore();
    },
    107: (module, exports) => {
        class PermissionStore { constructor() { this._dispatchToken = "5"; } getName() { return "PermissionStore"; }
            can(perm, ch) { return ch?.name !== "mods-only"; } }
        class GuildChannelStore { constructor() { this._dispatchToken = "6"; } getName() { return "GuildChannelStore"; }
            getChannels(g) { return { SELECTABLE: [{ channel: { id: "c1", name: "general", guild_id: "g1", type: 0 }, comparator: 0 }], VOCAL: [] }; } }
        class GuildRoleStore { constructor() { this._dispatchToken = "7"; } getName() { return "GuildRoleStore"; }
            getRole(g, id) { return { r1: { id: "r1", name: "Moderator", colorString: "#3ddc97" } }[id]; } }
        class RelationshipStore { constructor() { this._dispatchToken = "8"; } getName() { return "RelationshipStore"; } isFriend(id) { return id === "444"; } isBlocked(id) { return id === "666"; } }
        // Like Discord's: builds the sidebar from GuildChannelStore + PermissionStore
        class ChannelListStore { constructor() { this._dispatchToken = "9"; } getName() { return "ChannelListStore"; }
            getGuild(g) { return { sidebar: exports.G.getChannels(g) }; } }
        exports.P = new PermissionStore(); exports.G = new GuildChannelStore(); exports.R = new GuildRoleStore(); exports.Rel = new RelationshipStore(); exports.CL = new ChannelListStore();
    },
    999: (module, exports, req) => { [99, 100, 101, 102, 103, 104, 105, 106, 107, 109].forEach(id => req(id)); window.__discordBooted = true; }
}, req => req(999)]);
