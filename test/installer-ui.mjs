// Drives the installer GUI (served by installer.cjs --no-open) in headless Chromium against a
// fake %LOCALAPPDATA% Discord tree. Usage: node test/installer-ui.mjs [screenshotDir] [installerBinary]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2];
const binary = process.argv[3];
const sandbox = mkdtempSync(join(tmpdir(), "nc-installer-"));
for (const [branch, ver] of [["Discord", "1.0.9175"], ["DiscordCanary", "1.0.700"]]) {
    mkdirSync(join(sandbox, "local", branch, `app-${ver}`, "resources"), { recursive: true });
    writeFileSync(join(sandbox, "local", branch, `app-${ver}`, "resources", "app.asar"), "asar");
}
const env = { ...process.env, LOCALAPPDATA: join(sandbox, "local"), APPDATA: join(sandbox, "roaming") };
const [cmd, args] = binary ? [binary, ["--no-open"]] : [process.execPath, [join(root, "dist", "installer", "installer.cjs"), "--no-open"]];
const server = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "inherit"] });
const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", d => {
        const m = /http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/.exec(String(d));
        if (m) resolve(m[0]);
    });
    server.on("exit", c => reject(new Error(`installer exited ${c}`)));
});

const results = {};
const check = (name, ok, extra = "") => { results[name] = ok; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`); };
const base = new URL(url);

check("rejects missing token", (await fetch(`${base.origin}/`)).status === 403);
check("rejects API without token header", (await fetch(`${base.origin}/api/state`)).status === 403);
check("rejects foreign Host header", await new Promise(resolve => {
    import("node:http").then(({ request }) => {
        const req = request({ host: "127.0.0.1", port: base.port, path: "/api/state", headers: { Host: "evil.example", "X-NC-Token": base.searchParams.get("t") } }, res => resolve(res.statusCode === 403));
        req.end();
    });
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 380 }, locale: process.env.NC_LOCALE || "en-US" });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto(url);
await page.waitForSelector(".branch");
check("detects 3 branches", (await page.locator(".branch").count()) === 3);
check("PTB shown as not found", (await page.locator(".branch.missing").count()) === 1);
if (shots) await page.screenshot({ path: join(shots, "installer-idle.png") });

await page.uncheck("#relaunch", { force: true }).catch(() => page.evaluate(() => (document.getElementById("relaunch").checked = false)));
await page.click("#install");
await page.waitForSelector(".status.ok, .status.err", { timeout: 15000 });
check("install succeeds", await page.isVisible(".status.ok"), await page.textContent("#status"));
const res = join(sandbox, "local", "Discord", "app-1.0.9175", "resources");
check("loader written as app.asar/ + original renamed to _app.asar", existsSync(join(res, "app.asar", "index.js")) && existsSync(join(res, "_app.asar")));
check("UI shows Installed", (await page.locator(".branch.sel .pill.ok").count()) === 1);
if (shots) await page.screenshot({ path: join(shots, "installer-installed.png") });

await page.click("#uninstall");
await page.waitForFunction(() => !document.querySelector(".spin"));
check("uninstall restores Discord's original app.asar", !existsSync(join(res, "_app.asar")) && existsSync(join(res, "app.asar")) && !existsSync(join(res, "app.asar", "index.js")));

console.log(errors.length ? "Page errors:\n  " + errors.join("\n  ") : "No page errors");
await browser.close();
server.kill();
rmSync(sandbox, { recursive: true, force: true });
const failed = Object.values(results).filter(v => !v).length;
console.log(`\n${Object.keys(results).length - failed}/${Object.keys(results).length} installer checks passed`);
process.exit(failed || errors.length ? 1 : 0);
