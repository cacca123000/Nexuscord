// NexusCord build script: compiles the three runtime bundles with esbuild.
//   dist/injector.js  - Electron main process (Node/CJS)
//   dist/preload.js   - Preload bridge (Node/CJS, sandbox-free Discord windows)
//   dist/renderer.js  - Injected into Discord's main world (browser IIFE)
import * as esbuild from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

mkdirSync("dist", { recursive: true });

/** @type {import("esbuild").BuildOptions} */
const common = {
    bundle: true,
    minify: !dev,
    sourcemap: dev ? "inline" : false,
    legalComments: "none",
    logLevel: "warning",
    target: ["chrome120", "node20"],
    define: {
        NEXUSCORD_VERSION: JSON.stringify(pkg.version),
        NEXUSCORD_DEV: String(dev)
    },
    loader: { ".css": "text" }
};

/** @type {import("esbuild").BuildOptions[]} */
const targets = [
    {
        ...common,
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/injector.js",
        platform: "node",
        format: "cjs",
        external: ["electron", "original-fs"]
    },
    {
        ...common,
        entryPoints: ["src/preload/preload.ts"],
        outfile: "dist/preload.js",
        platform: "node",
        format: "cjs",
        external: ["electron"]
    },
    {
        ...common,
        entryPoints: ["src/renderer/index.ts"],
        outfile: "dist/renderer.js",
        platform: "browser",
        format: "iife",
        globalName: "NexusCordRenderer",
        jsxFactory: "h",
        jsxFragment: "Fragment"
    }
];

const start = performance.now();
if (watch) {
    for (const t of targets) {
        const ctx = await esbuild.context(t);
        await ctx.watch();
    }
    console.log("[NexusCord] Watching for changes...");
} else {
    const results = await Promise.all(targets.map(t => esbuild.build({ ...t, metafile: true })));
    const ms = (performance.now() - start).toFixed(1);
    for (const r of results) {
        for (const [file, info] of Object.entries(r.metafile.outputs)) {
            console.log(`  ${file.padEnd(22)} ${(info.bytes / 1024).toFixed(1).padStart(7)} KB`);
        }
    }
    console.log(`[NexusCord] Built ${targets.length} bundles in ${ms}ms`);
}
