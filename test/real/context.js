// Probe: prints source context around given needles. Set window.__needles before evaluating.
(async () => {
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
})()
