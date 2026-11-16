(async () => {
    const r = NexusCord.Webpack.require;
    const ids = [];
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
        const text = await fetch(src).then(x => x.text()).catch(() => "");
        if (!text.includes("Loading chunk")) continue;
        for (const m of text.matchAll(/[{,](\d+):"[0-9a-f]{16,20}"/g)) ids.push(m[1]);
    }
    const sample = ids.filter((_, i) => i % 700 === 0).slice(0, 10);
    const out = [];
    for (const id of sample) {
        const url = r.p + r.u(+id);
        const st = await fetch(url, { method: "HEAD" }).then(x => x.status).catch(e => String(e));
        let loaded;
        try { await r.e(+id); loaded = "ok"; } catch (e) { loaded = String(e.message).slice(0, 80); }
        out.push({ id, url, st, loaded, f: Object.keys(r.f || {}) });
    }
    return out;
})()
