# NexusCord

**All-in-one, lightweight Discord client mod for Windows.** It installs *into* Discord: everything lives in **User Settings → NexusCord**, right next to Discord's own settings.

- **Vencord-style core.** TypeScript and esbuild, with webpack hooks, code patches, a safe patcher and Flux interceptors.
- **BetterDiscord compatibility.** `.theme.css` and `.plugin.js` files work through a `BdApi` shim, and there's a built-in **BetterDiscord store** that scans plugins for malware.
- **52 built-in features** across 7 categories, each one toggleable live.
- **Discord-synced language.** Complete English and Italian, plus Spanish, French, German and Portuguese packs. It follows Discord's language automatically, or you can choose one.
- **One-click installer.** `NexusCord-Installer.exe` detects Discord Stable/PTB/Canary, closes it, patches it and relaunches it.

> NexusCord modifies the Discord client, which is against Discord's Terms of Service. Use it at your own risk. Features that change what your account sends are labelled **ToS risk** and are off by default.

---

## Install

1. Download `NexusCord-Installer.exe`. It's attached to every GitHub release and to every CI run as an artifact. You can also build it yourself (see below).
2. Double-click it. No admin rights are needed. Windows SmartScreen may warn you because the exe is unsigned: click **More info → Run anyway**.
3. Pick your Discord and click **Install / Update**. Discord restarts with NexusCord inside.
4. Open **User Settings → NexusCord**, or press **Ctrl + Alt + N**. A short setup wizard appears on first launch. **Ctrl + Shift + P** opens the command palette anywhere.

Discord updates are re-patched automatically while NexusCord runs. If NexusCord doesn't appear, check `%APPDATA%\NexusCord\nexuscord.log`. **Repair** in the installer fixes anything else. If a plugin or theme ever breaks Discord, NexusCord restarts in **safe mode** by itself after two failed starts.

## What's inside Discord's settings

| Page | Contents |
| --- | --- |
| **Overview** | Status dashboard (features, RAM, threats blocked), quick toggles, notification center, update notice |
| **Plugins** | All 52 features by category, search and filters, per-feature settings; installed BetterDiscord plugins with a risk badge; **plugin store** |
| **Themes** | Installed `.theme.css` files (hot reload), **theme store**, **QuickCSS+** editor (syntax colors, Discord variable autocomplete, live error check) |
| **Appearance** | Customizer, fonts, background, theme scheduler, window opacity, Mica/Acrylic, custom app/tray icon and splash, language, section position |
| **Privacy & Security** | LinkShield dashboard and lists, app lock, scam guard, plugin guard, NoTrack, silent typing, upload privacy… |
| **Performance** | Live RAM chart with history, savings report, optimizers, V8 heap cap, auto-refresh when bloated, start minimized |
| **Tools & Backup** | Auto-update, backup/restore (file or private GitHub Gist), profiles, multiple accounts, safe mode, diagnostics, webpack module explorer |

## The 52 features

<details><summary><b>🎨 Appearance</b></summary>

Customizer (accent color, roundness, density, text size) · Custom fonts (40 Google Fonts, UI and code) · Background image/video with blur and dim · Theme scheduler (day/night or follows Windows) · Window tweaks (draggable titlebar, translucent panels) · BD theme store · QuickCSS+ · Window opacity, Mica/Acrylic, custom icons and splash
</details>

<details><summary><b>🛡️ Privacy & Security</b></summary>

LinkShield (phishing blacklist, spoofed links, lookalike domains, QR-login scam links, executable guard with VirusTotal check, link unshortener, tracker stripping, hover preview of the real destination, personal allow/block lists) · NoTrack · App lock (PIN / Windows Hello, idle lock) · Scam guard (scam DMs, new-account friend requests) · Plugin guard (static malware scan; BD plugins can never read your token) · Silent typing · Upload privacy (removes GPS/EXIF from photos, random file names) · Clean outgoing links · Streamer mode+ (blurs emails/phones/IPs, panic key)
</details>

<details><summary><b>💬 Chat</b></summary>

Translate (inline or automatic) · Message logger (persistent and searchable) · Bookmarks with notes · Scheduled messages (`!later 10m …`) · Text snippets (`;shrug`) · Keyword alerts · Better timestamps · Timezone converter · Account age · Image viewer (zoom, pan, rotate, gallery) · Better code blocks · Double-click to edit/reply · Local nicknames · Pinned DMs · Hide blocked users · Read all · Platform indicators · Who reacted · Relationship notifier · FakeNitro (opt-in, ToS risk)
</details>

<details><summary><b>🎧 Media & Voice</b></summary>

Volume booster (up to 800%) · Custom sounds · Picture-in-picture · Custom Rich Presence · Now playing from any player (Windows media session) · Full-resolution downloads and "download all media in channel" · Emoji cloner
</details>

<details><summary><b>⚡ Performance · 🔧 Utilities · 🎉 Fun</b></summary>

Low-RAM optimizer · Declutter (hide Nitro, Shop, Quests, gift buttons…) · Lite mode · Data saver · Command palette · Copy tools (text, quote, link, IDs, raw JSON) · ShowHiddenChannels · Crash guard · Fancy text · Discord Wrapped (local stats) · Friend online notifications
</details>

---

## Building

Requires Node.js ≥ 20.12. Node 22 LTS is recommended, because the installer exe embeds the same Node version you build with.

```bash
npm install
npm run build            # dist/injector.js, preload.js, renderer.js (~80 ms)
npm run typecheck
npm run build:installer  # dist/NexusCord-Installer.exe (also cross-builds from Linux/macOS)
npm test                 # unit + injector + browser smoke tests (Playwright)
npm run test:installer   # installer UI end to end
npm run test:real        # verifies every hook against the REAL Discord web client
```

Releases: push a tag like `v2.0.1`. `.github/workflows/release.yml` builds on Windows and publishes the exe plus `checksums.txt`. The in-app updater installs a release only after verifying those checksums.

## How it works

- **Injection.** Discord's Electron only loads `resources/app.asar`, so the installer renames Discord's archive to `_app.asar` and puts a two-file loader *folder* named `app.asar` in its place (the same technique Vencord uses). That loader loads `%APPDATA%\NexusCord\dist\injector.js`, which applies the Chromium flags, swaps in NexusCord's preload while keeping Discord's own (so voice, Krisp and screen share are unaffected), hooks `webRequest` (CSP, telemetry, phishing guard) and then boots Discord's real `app.asar`.
- **Settings inside Discord.** Discord's 2025+ settings are a layout tree (`ROOT → SECTION → SIDEBAR_ITEM → PANEL → CATEGORY → CUSTOM`). NexusCord patches the layout resolver to add its own section. If Discord ever refactors that, a DOM fallback still places NexusCord in the settings sidebar.
- **Resilience.** Every finder, patch and plugin is isolated. Code patches handle Discord's method-shorthand module factories, and NexusCord tracks *all* of Discord's webpack runtimes (there are 4). If something moves after an update, only that one feature turns off.
- **Security.** The renderer gets a narrow, validated bridge with no generic file or network access. Network calls go only to allowlisted hosts. The GitHub token is encrypted with the OS keychain. BD plugins get no Node.js access and cannot read your token.

### Verified against the real Discord client

`test/real/` loads Discord's actual web client (discord.com, about 7,000 JS chunks cached in `.cache/`), injects NexusCord exactly like the preload does, and runs 63 checks. These cover every store and module the features rely on, the settings injection through Discord's real layout resolver, the token guard and all 52 plugins starting. Logged-in UI and native Windows parts (installer window, Windows Hello, media session) can't be exercised in CI.
