/*
 * Discord (Squirrel) installs every host update into a fresh `app-x.y.z` folder, which
 * would silently drop NexusCord. While Discord runs we watch the install root and apply
 * the loader to any new version folder as soon as its app.asar appears:
 *   resources/app.asar (file)  ->  resources/_app.asar
 *   resources/app.asar/ (folder) with our index.js + package.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync } from "fs";
import { dirname, join } from "path";

const isDir = (p: string) => {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
};
const isFile = (p: string) => {
    try {
        return statSync(p).isFile();
    } catch {
        return false;
    }
};

export function initAutoRepatch(log: (...a: unknown[]) => void = console.log): void {
    if (process.platform !== "win32") return;
    // Our own loader: resources/app.asar/ (current layout) or resources/app/ (legacy)
    const loaderDir = [join(process.resourcesPath, "app.asar"), join(process.resourcesPath, "app")].find(d => isDir(d) && existsSync(join(d, "index.js")));
    if (!loaderDir) return;
    let index: string, pkg: string;
    try {
        index = readFileSync(join(loaderDir, "index.js"), "utf8");
        pkg = readFileSync(join(loaderDir, "package.json"), "utf8");
    } catch {
        return;
    }
    if (!index.includes("NexusCord")) return;

    const root = dirname(dirname(process.resourcesPath)); // %localappdata%\Discord
    const patchAll = () => {
        try {
            for (const dir of readdirSync(root)) {
                if (!/^app-\d/.test(dir)) continue;
                const resources = join(root, dir, "resources");
                const asar = join(resources, "app.asar");
                const original = join(resources, "_app.asar");
                if (!isFile(asar)) continue; // already patched (folder) or not extracted yet
                if (resources === process.resourcesPath) continue; // never touch the running version
                if (existsSync(original)) continue; // inconsistent state - leave it to the installer's Repair
                renameSync(asar, original);
                mkdirSync(asar, { recursive: true });
                writeFileSync(join(asar, "index.js"), index);
                writeFileSync(join(asar, "package.json"), pkg);
                log("Re-patched Discord update:", dir);
            }
        } catch (e) {
            log("Auto re-patch failed:", e);
        }
    };

    patchAll();
    let timer: NodeJS.Timeout | null = null;
    try {
        watch(root, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(patchAll, 5000);
        }).unref?.();
    } catch { /* watching is best effort */ }
}
