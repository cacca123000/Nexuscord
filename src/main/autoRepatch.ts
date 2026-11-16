/*
 * Discord (Squirrel) installs every host update into a fresh `app-x.y.z` folder,
 * which would silently drop the NexusCord shim. While Discord runs we watch the
 * install root and drop our shim into any new version folder as it appears.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "fs";
import { dirname, join } from "path";

export function initAutoRepatch(): void {
    if (process.platform !== "win32") return;
    const ourApp = join(process.resourcesPath, "app");
    const shimIndex = join(ourApp, "index.js");
    const shimPkg = join(ourApp, "package.json");
    if (!existsSync(shimIndex)) return;

    let index: string, pkg: string;
    try {
        index = readFileSync(shimIndex, "utf8");
        pkg = readFileSync(shimPkg, "utf8");
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
                const target = join(resources, "app");
                if (!existsSync(join(resources, "app.asar")) || existsSync(join(target, "index.js"))) continue;
                mkdirSync(target, { recursive: true });
                writeFileSync(join(target, "index.js"), index);
                writeFileSync(join(target, "package.json"), pkg);
                console.log("[NexusCord] Re-patched Discord update:", dir);
            }
        } catch (e) {
            console.warn("[NexusCord] Auto re-patch failed:", e);
        }
    };

    patchAll();
    let timer: NodeJS.Timeout | null = null;
    try {
        watch(root, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(patchAll, 5000);
        });
    } catch { /* watching is best effort */ }
}
