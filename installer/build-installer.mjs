// Packages the GUI installer + compiled mod payload into ONE double-clickable
// Windows executable: dist/NexusCord-Installer.exe
//
// How: Node.js Single Executable Application (SEA).
//   1. esbuild bundles installer-main.ts (+ installer-ui.html) into one CJS file
//   2. the official Windows node.exe (same version as the building Node, SHA-256 verified)
//      is downloaded from nodejs.org and cached in .cache/
//   3. a SEA blob containing the installer + injector.js/preload.js/renderer.js +
//      the WebView2 window host is injected into a copy of node.exe with postject
//   4. the PE header is switched to the GUI subsystem so no console window flashes
// Works on Windows, Linux and macOS (cross-builds the Windows .exe).
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { buildIco } from "./icon.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT_DIR = join(DIST, "installer");
const CACHE = join(ROOT, ".cache");
const EXE = join(DIST, "NexusCord-Installer.exe");
const NODE_VERSION = process.version; // SEA blobs must match the runtime they are injected into
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const t0 = performance.now();

const step = msg => console.log(`\x1b[35m▸\x1b[0m ${msg}`);
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Build the mod payload and the installer bundle
// ---------------------------------------------------------------------------
step("Building mod payload (npm run build)");
const build = spawnSync(process.execPath, [join(ROOT, "build.mjs")], { cwd: ROOT, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

step("Bundling installer");
await esbuild.build({
    entryPoints: [join(ROOT, "installer", "installer-main.ts")],
    outfile: join(OUT_DIR, "installer.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    minify: true,
    legalComments: "none",
    loader: { ".html": "text" },
    define: { NEXUSCORD_VERSION: JSON.stringify(pkg.version) },
    logLevel: "warning"
});
copyFileSync(join(ROOT, "installer", "host.ps1"), join(OUT_DIR, "host.ps1"));
const ICO = buildIco();
writeFileSync(join(OUT_DIR, "icon.ico"), ICO);

// ---------------------------------------------------------------------------
// Download helpers (cached, retried)
// ---------------------------------------------------------------------------
async function download(url, attempts = 4) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, { headers: { "User-Agent": "nexuscord-build" } });
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
            return Buffer.from(await res.arrayBuffer());
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 1000 * 2 ** i));
        }
    }
    throw lastErr;
}

const sha256 = buf => createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------------------
// 2. WebView2 SDK (frameless window host) - optional, Edge --app fallback otherwise
// ---------------------------------------------------------------------------
async function getWebView2() {
    const dir = join(CACHE, "webview2");
    const files = {
        "Microsoft.Web.WebView2.Core.dll": "lib/net462/Microsoft.Web.WebView2.Core.dll",
        "Microsoft.Web.WebView2.WinForms.dll": "lib/net462/Microsoft.Web.WebView2.WinForms.dll",
        "x64/WebView2Loader.dll": "runtimes/win-x64/native/WebView2Loader.dll",
        "x86/WebView2Loader.dll": "runtimes/win-x86/native/WebView2Loader.dll",
        "arm64/WebView2Loader.dll": "runtimes/win-arm64/native/WebView2Loader.dll"
    };
    if (Object.keys(files).every(f => existsSync(join(dir, f)))) return { dir, files: Object.keys(files), cached: true };

    const index = JSON.parse((await download("https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/index.json")).toString());
    const version = index.versions.filter(v => !v.includes("-")).at(-1);
    const nupkg = await download(`https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${version}/microsoft.web.webview2.${version}.nupkg`);
    const zip = unzipSync(new Uint8Array(nupkg));
    for (const [out, inZip] of Object.entries(files)) {
        if (!zip[inZip]) throw new Error(`${inZip} missing from WebView2 ${version} package`);
        mkdirSync(dirname(join(dir, out)), { recursive: true });
        writeFileSync(join(dir, out), zip[inZip]);
    }
    writeFileSync(join(dir, "VERSION"), version);
    return { dir, files: Object.keys(files), version, cached: false };
}

let webview2 = null;
step("Fetching WebView2 SDK (NuGet: Microsoft.Web.WebView2)");
try {
    webview2 = await getWebView2();
    const v = webview2.version ?? readFileSync(join(webview2.dir, "VERSION"), "utf8");
    console.log(`  WebView2 ${v}${webview2.cached ? " (cached)" : ""}`);
} catch (e) {
    console.warn(`  ! WebView2 SDK unavailable (${e.message}) - the installer will open in an Edge app window instead.`);
}

// ---------------------------------------------------------------------------
// 3. Official Windows node.exe (verified against nodejs.org SHASUMS256)
// ---------------------------------------------------------------------------
step(`Fetching node.exe ${NODE_VERSION} (win-x64)`);
const nodeExe = join(CACHE, `node-${NODE_VERSION}-win-x64.exe`);
const sums = (await download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`)).toString();
const expected = /^([0-9a-f]{64})\s+win-x64\/node\.exe$/m.exec(sums)?.[1];
if (!expected) throw new Error("win-x64/node.exe not listed in SHASUMS256.txt");
if (!existsSync(nodeExe) || sha256(readFileSync(nodeExe)) !== expected) {
    const bin = await download(`https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`);
    if (sha256(bin) !== expected) throw new Error("node.exe checksum mismatch - refusing to continue");
    writeFileSync(nodeExe, bin);
}
console.log(`  sha256 ${expected.slice(0, 16)}… verified`);

// ---------------------------------------------------------------------------
// 4. SEA blob with embedded assets
// ---------------------------------------------------------------------------
step("Generating SEA blob");
const assets = {
    "injector.js": join(DIST, "injector.js"),
    "preload.js": join(DIST, "preload.js"),
    "renderer.js": join(DIST, "renderer.js")
};
assets["icon.ico"] = join(OUT_DIR, "icon.ico");
if (webview2) {
    assets["host.ps1"] = join(OUT_DIR, "host.ps1");
    for (const f of webview2.files) assets[f] = join(webview2.dir, f);
}
for (const p of Object.values(assets)) if (!existsSync(p)) throw new Error(`Missing asset ${p}`);

const blob = join(OUT_DIR, "sea-prep.blob");
const seaConfig = join(OUT_DIR, "sea-config.json");
writeFileSync(
    seaConfig,
    JSON.stringify({ main: join(OUT_DIR, "installer.cjs"), output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }, null, 2)
);
const gen = spawnSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });
if (gen.status !== 0) throw new Error("SEA blob generation failed");

// ---------------------------------------------------------------------------
// 5. PE helpers: drop Authenticode signature (invalid after injection), set GUI subsystem
// ---------------------------------------------------------------------------
function peOffsets(buf) {
    if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error("not a PE file (MZ)");
    const pe = buf.readUInt32LE(0x3c);
    if (buf.readUInt32LE(pe) !== 0x4550) throw new Error("not a PE file (PE\\0\\0)");
    const opt = pe + 24;
    const magic = buf.readUInt16LE(opt);
    const dataDirs = opt + (magic === 0x20b ? 112 : 96);
    return { opt, magic, securityDir: dataDirs + 4 * 8 };
}

function stripSignature(file) {
    const buf = readFileSync(file);
    const { opt, securityDir } = peOffsets(buf);
    const certOffset = buf.readUInt32LE(securityDir);
    const certSize = buf.readUInt32LE(securityDir + 4);
    if (!certOffset || !certSize) return false;
    buf.writeUInt32LE(0, securityDir);
    buf.writeUInt32LE(0, securityDir + 4);
    buf.writeUInt32LE(0, opt + 64); // CheckSum
    writeFileSync(file, certOffset + certSize >= buf.length - 8 ? buf.subarray(0, certOffset) : buf);
    return true;
}

function setGuiSubsystem(file) {
    const buf = readFileSync(file);
    const { opt } = peOffsets(buf);
    buf.writeUInt16LE(2, opt + 68); // IMAGE_SUBSYSTEM_WINDOWS_GUI
    writeFileSync(file, buf);
}

/** Replaces node.exe's icon + version info with NexusCord's (pure JS, via resedit). */
async function brandExecutable(file) {
    const ResEdit = await import("resedit");
    const exe = ResEdit.NtExecutable.from(readFileSync(file), { ignoreCert: true });
    const res = ResEdit.NtExecutableResource.from(exe);
    const icons = ResEdit.Data.IconFile.from(ICO).icons.map(i => i.data);
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const target = groups[0] ?? { id: 1, lang: 1033 };
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, target.id, target.lang, icons);
    const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
    if (vi) {
        const [maj, min, pat] = pkg.version.split(".").map(Number);
        const lang = vi.getAllLanguagesForStringValues()[0] ?? { lang: 1033, codepage: 1200 };
        vi.setFileVersion(maj, min, pat, 0, lang.lang);
        vi.setProductVersion(maj, min, pat, 0, lang.lang);
        vi.setStringValues(lang, {
            CompanyName: "NexusCord",
            FileDescription: "NexusCord Installer",
            ProductName: "NexusCord",
            InternalName: "NexusCord-Installer",
            OriginalFilename: "NexusCord-Installer.exe",
            LegalCopyright: "GPL-3.0-or-later",
            FileVersion: pkg.version,
            ProductVersion: pkg.version,
            Comments: "Installs NexusCord into Discord"
        });
        vi.outputToResourceEntries(res.entries);
    }
    res.outputResource(exe);
    writeFileSync(file, Buffer.from(exe.generate()));
}

// ---------------------------------------------------------------------------
// 6. Inject
// ---------------------------------------------------------------------------
step("Injecting payload into NexusCord-Installer.exe");
rmSync(EXE, { force: true });
copyFileSync(nodeExe, EXE);
console.log(`  signature ${stripSignature(EXE) ? "stripped" : "not present"}`);
await brandExecutable(EXE);
console.log("  icon + version info applied");
const { inject } = await import("postject");
await inject(EXE, "NODE_SEA_BLOB", readFileSync(blob), { sentinelFuse: SEA_FUSE, overwrite: true });
setGuiSubsystem(EXE);

// ---------------------------------------------------------------------------
// 7. Verify
// ---------------------------------------------------------------------------
const final = readFileSync(EXE);
const { opt } = peOffsets(final);
const fuseFlipped = final.includes(Buffer.from(`${SEA_FUSE}:1`));
const blobBytes = readFileSync(blob);
const blobEmbedded = final.includes(blobBytes.subarray(0, 64));
if (!fuseFlipped || !blobEmbedded || final.readUInt16LE(opt + 68) !== 2) throw new Error("Verification failed: SEA fuse/blob/subsystem not applied");

const mb = (statSync(EXE).size / 1048576).toFixed(1);
console.log(`\n\x1b[32m✔ dist/NexusCord-Installer.exe\x1b[0m  ${mb} MB  sha256 ${sha256(final)}`);
console.log(`  Node ${NODE_VERSION} SEA · GUI subsystem · payload: ${Object.keys(assets).join(", ")}`);
console.log(`  Built in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
