(() => {
    const m = NexusCord.Webpack.require.m;
    const src = {};
    for (const id in m) {
        try {
            src[id] = Function.prototype.toString.call(m[id][Symbol.for("NexusCord.wrappedFactory")] ?? m[id]);
        } catch { /* ignore */ }
    }
    const count = n => Object.values(src).filter(s => s.includes(n)).length;
    const sample = re => {
        const out = new Set();
        for (const s of Object.values(src)) for (const x of s.matchAll(re)) { out.add(x[0]); if (out.size > 25) return [...out]; }
        return [...out];
    };
    return {
        total: Object.keys(src).length,
        MESSAGE_CREATE: count("MESSAGE_CREATE"),
        CONNECTION_OPEN: count("CONNECTION_OPEN"),
        displayName: count("displayName"),
        storeNames: sample(/"displayName","\w*Store"/g),
        storeNames2: sample(/displayName="\w*Store"/g),
        storeNames3: sample(/"\w{3,40}Store"/g).slice(0, 25),
        dispatch: count(".dispatch({type:"),
        sizes: Object.values(src).reduce((a, s) => a + s.length, 0)
    };
})()
