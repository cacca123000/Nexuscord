// Minimal imitation of Discord's webpack 5 JSONP runtime + a few internal modules.
(() => {
    const modules = {};
    const cache = {};
    function req(id) {
        if (cache[id]) return cache[id].exports;
        const m = (cache[id] = { id, loaded: false, exports: {} });
        req.m[id].call(m.exports, m, m.exports, req);
        m.loaded = true;
        return m.exports;
    }
    req.m = modules;
    req.c = cache;
    req.d = (e, defs) => { for (const k in defs) Object.defineProperty(e, k, { enumerable: true, get: defs[k] }); };
    const installed = {};
    const cb = (parentPush, data) => {
        const [ids, more, runtime] = data;
        if (ids.some(id => installed[id] !== 0)) {
            for (const id in more) req.m[id] = more[id];
            if (runtime) runtime(req);
        }
        if (parentPush) parentPush(data);
        for (const id of ids) installed[id] = 0;
    };
    const g = (self.webpackChunkdiscord_app = self.webpackChunkdiscord_app || []);
    g.forEach(cb.bind(null, 0));
    g.push = cb.bind(null, g.push.bind(g));
    self.__fakeReq = req;
})();
