(async () => {
    const out = [];
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
        const text = await fetch(src).then(x => x.text()).catch(() => "");
        const i = text.indexOf("Loading chunk");
        const j = text.indexOf('hasOwnProperty(e)?"?"');
        if (i === -1 && j === -1) continue;
        const k = text.indexOf(".u=function");
        out.push({ src, len: text.length, around_u: k === -1 ? null : text.slice(k - 200, k + 400), sampleIds: text.match(/[{,]\d+:"[0-9a-f]{16,20}"/g)?.slice(0, 5), count: text.match(/[{,]\d+:"[0-9a-f]{16,20}"/g)?.length });
    }
    return out;
})()
