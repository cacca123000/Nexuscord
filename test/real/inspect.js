// Debug helper for verify.mjs: inspect a module's exports by a source needle.
(() => {
    const needle = window.__inspect || ".buildLayout().map(";
    const hits = [];
    for (const r of NexusCord.Webpack.instances) for (const id in r.m) {
        const f = r.m[id][Symbol.for("NexusCord.wrappedFactory")] ?? r.m[id];
        if (!Function.prototype.toString.call(f).includes(needle)) continue;
        const mod = r.c[id];
        const exp = mod?.exports;
        hits.push({
            id,
            cached: !!mod,
            keys: exp ? Object.getOwnPropertyNames(exp) : null,
            enumerable: exp ? Object.keys(exp) : null,
            descriptors: exp ? Object.fromEntries(Object.getOwnPropertyNames(exp).slice(0, 8).map(k => [k, Object.getOwnPropertyDescriptor(exp, k)?.get ? "getter" : typeof exp[k]])) : null,
            patched: Function.prototype.toString.call(r.m[id]).includes("NexusCord") || Function.prototype.toString.call(f).length,
            hasPatchedExport: exp ? Object.values(exp).some(v => typeof v === "function" && Function.prototype.toString.call(v).includes("$NexusCord")) : null
        });
    }
    return hits.length ? hits : "not found; runtimes=" + NexusCord.Webpack.instances.map(r => Object.keys(r.m).length).join("/");
})()
