(() => {
    const r = NexusCord.Webpack.require;
    const s = f => (typeof f === "function" ? Function.prototype.toString.call(f).slice(0, 600) : String(f));
    return { u: s(r.u), p: r.p, e: s(r.e), keys: Object.keys(r).join(","), scripts: [...document.scripts].map(x => x.src).filter(Boolean) };
})()
