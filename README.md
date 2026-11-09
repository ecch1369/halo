# HALO

A Dynamic Island for Windows.

**Made by hworks** - ecchworks@gmail.com

## Features
- Black pill at the top of the screen. Nothing playing = pure black, nothing inside.
- Plays your music files (drag & drop onto the pill), playlist saved between runs.
- Shows what's playing in **any browser or app** (YouTube, podcasts, Spotify, ...) with cover, progress and working
  play/pause/next/previous/seek - it reads the same Windows media controls as the volume flyout.
- Colours and a soft glow follow the cover art; black "liquid glass" look (100% opaque when active, 70% when idle, 2/3 size when idle).
- Auto-hide: fades away after 1 min of nothing happening (tray > Auto-hide when idle: off / 30 s / 1 min / 5 min). Comes back on a notification, when media starts, when the cursor rests at the top-centre of the screen, or with the shortcut.
- Click-through everywhere except the island itself (+1px), so it never blocks After Effects / Photoshop UI under it.
- Long titles scroll in a seamless loop.
- Windows notifications (Telegram, WhatsApp, ...) pop out as a banner - works out of the box (reads Windows' notification
  database); the one-time "identity" setup is an optional upgrade.
- Timer, power button (fades away; tray icon or Win+Alt+H (changeable in the tray menu) brings it back), starts with Windows.

## Build the installer (Windows)
1. Install Node.js LTS.
2. Double-click `build.bat`.
3. The installer is `dist\HALO-Setup-2.0.0.exe`. Run it: one click, one UAC prompt, done.
   The installer creates the desktop shortcut and sets up notification access automatically.

No Windows PC? Push the folder to GitHub and run the "Build Windows installer" action.

## Privacy
HALO asks once before reading anything. It only looks at notifications from messenger/social apps (Telegram, WhatsApp, X, Bale,
Rubika, Instagram, Discord, ...); everything else is ignored immediately. Message text is never saved to disk or sent anywhere.
Turn it off any time: tray icon > "Show messenger notifications".

## Troubleshooting
Logs (no message text) live in `%LOCALAPPDATA%\HALO\logs\halo.log` - attach that file when asking for help.

## Publishing (GitHub, free)
Easiest: double-click `publish-to-github.bat` - it does everything below for you (asks you to approve a GitHub login once).

By hand:
1. Create a **public** repo (e.g. `halo`) and push this folder to it.
2. Repo Settings > Pages > Source = **GitHub Actions** (then the download page in `docs/` goes live at `https://USERNAME.github.io/halo/`).
3. Releases > Draft a new release > tag `v2.2.0` > Publish. The *Release* workflow builds the installer and attaches
   `HALO-Setup.exe`; the download page always links to the latest one.
4. Installed copies check for updates automatically (tray icon > Check for updates) and offer to restart when one is ready.
5. Before announcing, scan `HALO-Setup.exe` on virustotal.com and link the result.

## Windows SmartScreen note
The installer is not code-signed yet, so Windows may show "Windows protected your PC".
Click **More info**, then **Run anyway**. HALO stays completely free.

## Notes
- Windows 10 (2004+) or Windows 11 required.
- If notification access ever stops working: tray icon > "Fix notifications (re-run setup)".
- Windows Settings > Privacy & security > Notifications must allow apps to read notifications (HALO tells you if not).

## Support
Using HALO stays completely free! To support the project: https://reymit.ir/hworks
(also available from the About dialog).

Copyright (c) hworks. All rights reserved.
