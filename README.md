# NexusCord

A lightweight, all-in-one Discord desktop client mod for Windows. It combines:

| Pillar | What you get |
| --- | --- |
| **Vencord-style core** | TypeScript + esbuild bundles, webpack chunk hook with module finders and code patches, a safe before/after/instead patcher, Flux dispatcher interceptors |
| **BetterDiscord compatibility** | `.theme.css` files with `@name/@author/@version` metadata and live reload, plus a `window.BdApi` shim for `.plugin.js` files |
| **TesCord-style UI and QoL** | Dark glassmorphism settings, titlebar drag fix, Windows 11 acrylic, "Copy ID / Raw JSON" context menu items |
| **Low-RAM engine** | V8 heap caps and Chromium switches, media hibernation when minimized, off-screen media cleanup, renderer cache purges |
| **LinkShield** | Phishing blacklist (FishFish + CERT.PL), spoofed-link and lookalike-domain detection, URL unshortener, tracker stripping, executable guard with a VirusTotal check |
| **Discord-synced i18n** | English by default; switches to Italian live when Discord is set to `it`. You can also force a language. |
| **One-click GUI installer** | `NexusCord-Installer.exe` detects Stable/PTB/Canary, closes Discord, and patches or unpatches it, with an optional relaunch |

> NexusCord modifies the Discord client, which is against Discord's Terms of Service. Use it at your own risk. Some features, especially **FakeNitro**, are opt-in for that reason.

---

## Quick start (users)

1. Get `NexusCord-Installer.exe` in one of two ways: download the **NexusCord-Installer** artifact from the repository's GitHub Actions run (a Windows runner builds it on every push), or build it yourself with `npm run build:installer`.
2. Double-click it. No terminal and no admin rights are needed, because everything goes into your user profile.
3. Pick your Discord (Stable / PTB / Canary), leave **Relaunch Discord after completion** on, and click **Install / Update**.
4. In Discord, open **User Settings → NexusCord**, or press **Ctrl + Alt + N** anywhere.

The exe isn't code-signed, so Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**.

Use **Repair** if a Discord update ever undoes the patch. NexusCord also re-patches new Discord versions by itself while it is running. **Uninstall** removes the patch but keeps your themes, plugins and settings in `%APPDATA%\NexusCord`.

### Where things live

```
%APPDATA%\NexusCord\
├── dist\            injector.js, preload.js, renderer.js (written by the installer)
├── themes\          *.theme.css  (BetterDiscord themes, hot-reloaded on save)
├── plugins\         *.plugin.js  (BetterDiscord plugins) + <Name>.config.json
├── cache\           phishing-domains.json
├── quickcss.css     QuickCSS editor contents
└── settings.json
%LOCALAPPDATA%\Discord\app-x.y.z\resources\app\   ← 2-file shim that loads dist\injector.js
```

---

## Building (developers)

Requires Node.js ≥ 20.12. Node 22 LTS is recommended because the installer exe embeds the same Node version you build with.

```bash
npm install
npm run build            # esbuild: dist/injector.js, dist/preload.js, dist/renderer.js (~50 ms)
npm run typecheck        # tsc --noEmit for the mod and the installer
npm run build:installer  # dist/NexusCord-Installer.exe (cross-builds from Windows, Linux or macOS)
npm test                 # headless renderer smoke test (needs Playwright + Chromium)
node --test test/unit.test.mjs   # pure unit tests (LinkShield analysis, CSP/telemetry rules, meta parser)
```

Developer install without the exe: `npm run build && npm run build:installer` once, then `npm run inject` or `npm run uninject`. These use `dist/installer/installer.cjs --cli`. The same CLI is built into the exe:

```
NexusCord-Installer.exe --cli <install|repair|uninstall|status> [--branch stable|ptb|canary|all] [--relaunch]
```

### How the installer exe is made

`installer/build-installer.mjs` produces a **Node.js Single Executable Application**:

1. esbuild bundles `installer-main.ts` and `installer-ui.html` into one CommonJS file.
2. The official `win-x64/node.exe` for your Node version is downloaded from nodejs.org, **checked against `SHASUMS256.txt`**, and cached in `.cache/`.
3. A SEA blob is injected with `postject`. It contains the installer, the mod payload (`injector.js`, `preload.js`, `renderer.js`), and the window host (`host.ps1` plus the WebView2 SDK DLLs from NuGet).
4. The Authenticode signature (no longer valid after injection) is removed, and the PE subsystem is set to **GUI** so no console window appears.

At runtime the installer serves its UI on `127.0.0.1`, using a random port and a random per-run token, and shows it in:

1. a **frameless 520×380 WebView2 window** hosted by Windows PowerShell + WinForms, with custom drag, minimize and close and rounded corners on Windows 11;
2. otherwise an Edge or Chrome `--app` window, if the WebView2 runtime or PowerShell is unavailable;
3. otherwise the default browser.

The installer log is written to `%TEMP%\NexusCord-Installer.log`.

---

## Architecture

```
NexusCord/
├── build.mjs                     esbuild → injector.js / preload.js / renderer.js
├── installer/                    standalone GUI installer (SEA exe)
│   ├── installer-main.ts         detection, kill/relaunch, patch/unpatch, local UI server, CLI
│   ├── installer-ui.html         dark glassmorphism UI (EN/IT)
│   ├── host.ps1                  frameless WebView2 window host
│   └── build-installer.mjs       packages everything into dist/NexusCord-Installer.exe
├── src/
│   ├── main/                     Electron main process
│   │   ├── index.ts              BrowserWindow Proxy (preload chaining), V8/Chromium flags, CSP bypass, boots app.asar
│   │   ├── ipc.ts                validated IPC (settings, themes, plugins, LinkShield, memory, cache)
│   │   ├── webRequest.ts         single master onHeadersReceived/onBeforeRequest that chains Discord's own
│   │   ├── linkShieldMain.ts     phishing list download/cache, redirect resolver
│   │   └── autoRepatch.ts        re-applies the shim to new app-x.y.z folders after Discord updates
│   ├── preload/preload.ts        NexusCordNative bridge + renderer injection + Discord's original preload
│   ├── shared/                   settings schema, IPC names, BD meta parser, LinkShield URL analysis
│   └── renderer/
│       ├── index.ts              bootstrap (webpack hook first, then flux, i18n, plugins, themes, BdApi, UI)
│       ├── core/                 webpack, patcher, flux, i18n, themeEngine, bdCompat, settingsUI, ui, dom (JSX→DOM)
│       ├── i18n/                 en.ts (base) + it.ts (complete; enforced by the type checker)
│       └── plugins/              noTrack, messageLogger, showHiddenChannels, fakeNitro, lowRamOptimizer, linkShield, windowTweaks
└── test/                         unit tests + Playwright smoke test against a fake Discord webpack runtime
```

**Injection flow.** Electron loads `resources/app` before `app.asar`. The two-file shim there requires `%APPDATA%\NexusCord\dist\injector.js`, which then:

1. applies the Chromium switches;
2. swaps `BrowserWindow` for a `Proxy` that points `webPreferences.preload` at NexusCord's preload, keeping Discord's original preload so it can be chained (voice, Krisp and screen share keep working);
3. hooks `webRequest` to strip CSP, block telemetry and add a phishing guard on `shell.openExternal`;
4. boots Discord's real `app.asar`.

The preload exposes a narrow, validated `NexusCordNative` bridge and runs `renderer.js` in the main world before Discord's webpack starts. Third-party BetterDiscord plugins get **no Node.js access**, which is stricter than BetterDiscord itself.

**Resilience.** Every finder, patch, interceptor and plugin start runs in its own `try/catch`. If a Discord update moves something, the affected feature turns itself off and the client keeps running. The settings UI has three entry points: a native settings section, a DOM sidebar fallback, and the **Ctrl + Alt + N** hotkey.

## Built-in plugins

| Plugin | Default | Notes |
| --- | --- | --- |
| NoTrack | on | Answers `/api/v*/science`, `/track`, `/metrics` and Sentry locally (fetch, XHR, beacon) and blocks them in the main process. The Sentry client is shut down. |
| LinkShield | on | Phishing lists refresh every 6 h. All checks are synchronous on click. Clean links are never touched, and neither are Discord's own links. |
| Low-RAM Optimizer | on | Hibernates media when hidden (optionally also when unfocused), frees off-screen videos on channel switch, and clears the cache periodically. |
| WindowTweaks | on | Titlebar drag fix, acrylic (opt-in), context-menu "Copy ID / Raw JSON". |
| MessageLogger | off | Swallows `MESSAGE_DELETE` so messages stay in place with a **[Deleted]/[Eliminato]** badge. Edits keep their history (**[Edited]/[Modificato]**). Rendered with CSS, so it survives re-renders. |
| ShowHiddenChannels | off | Shows locked channels with a lock icon. Clicking one opens a read-only details modal (topic, slowmode, creation date, roles). Messages are never requested. |
| FakeNitro | off | Sends unusable emojis and stickers as 48 px lossless CDN links (size is configurable). Adds client-side cosmetic previews and a local profile badge. Users with real Nitro are left alone. |

## Testing status

- `npm test`: the renderer runs headless in Chromium against a fake Discord webpack runtime (`test/fake-discord`). It checks the webpack hook, finders, the Flux interceptor, live i18n switching, the patcher, every plugin's behaviour, BdApi plugin loading, themes, and the settings panel in EN and IT.
- `node --test test/injector.test.mjs`: boots `dist/injector.js` under a mocked Electron. It checks the preload swap and chaining, the V8/Chromium flags, CSP stripping with Discord's own listener still chained, telemetry blocking, and the hand-off to Discord's `app.asar`.
- `npm run test:installer`: drives the installer UI in Chromium against a fake `%LOCALAPPDATA%`. It checks token and Host protection, branch detection, and install/uninstall.
- `node --test test/unit.test.mjs`: LinkShield heuristics (typosquats, spoofs, trackers, shorteners, executables), telemetry/CSP rules, the BD meta parser, and settings normalization.
- `npm run build:installer` checks that the produced exe has the SEA fuse set, the blob embedded, and the GUI subsystem.

Not covered by automated tests: running inside a live Discord client and on real Windows. Discord's internal module shapes (settings sections, channel list stores, emoji utils) change between releases. Expect to adjust a finder now and then, which is the same maintenance every client mod needs.
