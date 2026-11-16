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
    102: (module, exports) => {
        // React-like stub (just enough for findByProps)
        exports.useState = () => {}; exports.createElement = () => ({}); exports.Component = class {};
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
        exports.sendMessage = (channelId, msg) => { window.__sent = { channelId, msg }; return Promise.resolve(); };
        exports.editMessage = () => {};
    },
    106: (module, exports) => {
        class ChannelStore { constructor() { this._dispatchToken = "4"; } getName() { return "ChannelStore"; }
            getChannel(id) { return { id, name: "general", guild_id: "g1", type: 0 }; } }
        exports.Z = new ChannelStore();
    },
    999: (module, exports, req) => { [100, 101, 102, 103, 104, 105, 106].forEach(id => req(id)); window.__discordBooted = true; }
}, req => req(999)]);
