(async () => { window.__needles = ['.USER_SECTION,', 'useTitle', 'layout:', '.ROOT,']; const loaded = await (async () => {
    const r = NexusCord.Webpack.require;
    const ids = new Set();
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
        const text = await fetch(src).then(x => x.text()).catch(() => "");
        if (!text.includes(".u=function") && !text.includes("Loading chunk")) continue;
        for (const m of text.matchAll(/[{,](\d+):"[0-9a-f]{16,20}"/g)) ids.add(m[1]);
        for (const m of text.matchAll(/if\((\d+)===e\)return/g)) ids.add(m[1]);
    }
    const before = Object.keys(r.m).length;
    const queue = [...ids];
    let ok = 0, fail = 0;
    const errs = {};
    const worker = async () => {
        while (queue.length) {
            const id = queue.shift();
            try {
                await r.e(+id);
                ok++;
            } catch (e) {
                fail++;
                const k = String(e?.message ?? e).replace(/\d+/g, "N").slice(0, 120);
                errs[k] = (errs[k] || 0) + 1;
            }
        }
    };
    await Promise.all(Array.from({ length: 32 }, worker));
    return { errs, chunks: ids.size, ok, fail, modulesBefore: before, modulesAfter: Object.keys(r.m).length };
})(); const ctx = await (async () => {
    const needles = window.__needles || ["SIDEBAR_ITEM", "buildLayout"];
    const m = NexusCord.Webpack.require.m;
    const out = {};
    for (const n of needles) {
        out[n] = [];
        for (const id in m) {
            let s;
            try {
                s = Function.prototype.toString.call(m[id][Symbol.for("NexusCord.wrappedFactory")] ?? m[id]);
            } catch {
                continue;
            }
            let i = s.indexOf(n);
            let k = 0;
            while (i !== -1 && k < 3) {
                out[n].push(`[${id}] …${s.slice(Math.max(0, i - 220), i + 260)}…`);
                i = s.indexOf(n, i + n.length);
                k++;
            }
            if (out[n].length > 8) break;
        }
    }
    return out;
})(); return { loaded, ctx }; })()
