// Probe helper: registers EVERY Discord webpack chunk (without executing modules).
// The chunk-id -> hash map lives in the webpack runtime script, so we fetch the page's
// scripts, extract `id:"hash"` pairs, and load each chunk with __webpack_require__.e.
(async () => {
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
                const url = r.u(+id);
                const k = url.startsWith("undefined") ? "css-only id" : "REAL JS FAIL " + url.slice(0, 40);
                errs[k] = (errs[k] || 0) + 1;
            }
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    return { errs, chunks: ids.size, ok, fail, modulesBefore: before, modulesAfter: Object.keys(r.m).length };
})()
