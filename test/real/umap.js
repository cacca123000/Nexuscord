(async () => {
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
        const text = await fetch(src).then(x => x.text()).catch(() => "");
        if (!text.includes("Loading chunk") || text.length < 1e6) continue;
        const hits = [];
        let i = text.indexOf(".u=");
        while (i !== -1 && hits.length < 4) {
            hits.push(text.slice(i - 80, i + 420));
            i = text.indexOf(".u=", i + 3);
        }
        return { src, hits };
    }
})()
