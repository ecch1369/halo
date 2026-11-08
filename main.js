// HALO - made by hworks (ecchworks@gmail.com)
// A Dynamic Island for Windows: music, browser/podcast media, notifications, timer.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, shell, dialog, clipboard, Notification } = require('electron');
const os = require('os');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { readTags } = require('./tags');

// ---------- auto-update (GitHub Releases) ----------
// The feed is set explicitly, so updates work for ANY installed copy (also ones built locally with build.bat).
const UPDATE_OWNER = 'ecch1369', UPDATE_REPO = 'halo';
let autoUpdater = null, updaterLoadError = '', lastUpdateError = '', manualUpdateCheck = false;
try { ({ autoUpdater } = require('electron-updater')); } catch (e) { updaterLoadError = String(e && e.message || e).slice(0, 160); }
const note = (title, body, extra) => send('notif:new', Object.assign({ system: true, app: 'HALO', title, body: body || '' }, extra || {}));
function initUpdater() {
  if (!app.isPackaged || !autoUpdater) { log('updater not active | packaged=' + app.isPackaged + ' | loadError=' + updaterLoadError); return; }
  try { autoUpdater.setFeedURL({ provider: 'github', owner: UPDATE_OWNER, repo: UPDATE_REPO }); } catch (e) { log('setFeedURL failed:', e && e.message); }
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => log('update: checking'));
  autoUpdater.on('error', (e) => {
    lastUpdateError = String(e && e.message || e).split('\n')[0].slice(0, 200);
    log('update error:', lastUpdateError);
    if (manualUpdateCheck) { manualUpdateCheck = false; note('Update check failed', lastUpdateError.slice(0, 90)); }
  });
  autoUpdater.on('update-available', (i) => {
    log('update available', i.version);
    if (manualUpdateCheck) { manualUpdateCheck = false; note('Update found \u2013 v' + i.version, 'Downloading in the background\u2026'); }
  });
  autoUpdater.on('update-not-available', () => {
    log('update: up to date');
    if (manualUpdateCheck) { manualUpdateCheck = false; note('HALO is up to date', 'Version ' + app.getVersion()); }
  });
  autoUpdater.on('update-downloaded', (i) => {
    log('update downloaded', i.version);
    note('Update ready \u2013 v' + i.version, 'Click to restart and install', { action: 'update-install' });
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => log('update check failed:', e && e.message));
  log('updater ready | feed ' + UPDATE_OWNER + '/' + UPDATE_REPO + ' | current v' + app.getVersion());
  setTimeout(check, 20000);
  setInterval(check, 6 * 60 * 60 * 1000);
}
function checkUpdatesNow() {
  if (!autoUpdater) { note('Updates unavailable', 'Updater could not load: ' + (updaterLoadError || 'unknown reason')); return; }
  if (!app.isPackaged) { note('Updates', 'Update checks only work in the installed version'); return; }
  manualUpdateCheck = true;
  note('Checking for updates\u2026', 'Version ' + app.getVersion());
  autoUpdater.checkForUpdates().catch((e) => { manualUpdateCheck = false; lastUpdateError = String(e && e.message || e).split('\n')[0].slice(0, 200); log('update check failed:', lastUpdateError); note('Update check failed', lastUpdateError.slice(0, 90)); });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.setAppUserModelId('com.hworks.halo');

let win, tray;
let cur = { w: 190, h: 38 };
let tween = null;
const PADX = 28, TOP = 18, PADB = 34; // room around the island for the glow
const ISLAND_GAP = 14;                // distance between the island and the top edge of the screen

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; } }
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch {} }

const stateFile = () => path.join(app.getPath('userData'), 'state.json');

function target(w, h) {
  const d = screen.getPrimaryDisplay().bounds;
  const W = w + 2 * PADX, H = h + TOP + PADB;
  return { x: Math.round(d.x + (d.width - W) / 2), y: d.y - (TOP - ISLAND_GAP), width: W, height: H };
}

// The island morphs with a CSS spring (GPU-smooth). The window only grows right away and shrinks after the animation.
let resizeToken = 0;
const hit = { w: 190, h: 38, pw: 190, ph: 38, until: 0 }; // island size (target + previous) for mouse hit-testing
function setWin(w, h) { cur = { w, h }; if (win) win.setBounds(target(w, h), false); }
function resizeTo(w, h) {
  if (!win) return;
  hit.pw = hit.w; hit.ph = hit.h; hit.w = w; hit.h = h; hit.until = Date.now() + 650;
  const token = ++resizeToken;
  setWin(Math.max(w, cur.w), Math.max(h, cur.h));
  if (w < cur.w || h < cur.h) setTimeout(() => { if (token === resizeToken) setWin(w, h); }, 600);
}

// The transparent window must NOT swallow clicks meant for other apps (After Effects, Photoshop...).
// Only the island's own rectangle (+1px) takes the mouse; everywhere else the click goes through.
function islandRect() {
  const d = screen.getPrimaryDisplay().bounds;
  const morph = Date.now() < hit.until;                  // while it morphs, cover old + new size (spring overshoot)
  const w = morph ? Math.max(hit.w, hit.pw) + 14 : hit.w;
  const h = morph ? Math.max(hit.h, hit.ph) + 8 : hit.h;
  const m = 1;
  return { x: d.x + (d.width - w) / 2 - m, y: d.y + ISLAND_GAP - (morph ? 4 : 0) - m, w: w + 2 * m, h: h + 2 * m };
}
let overIsland = false;
function pollCursor() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint(), r = islandRect();
  const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (inside === overIsland) return;
  overIsland = inside;
  win.setIgnoreMouseEvents(!inside, { forward: true });
  win.webContents.send('island:hover', inside);
}

function createWindow() {
  win = new BrowserWindow({
    ...target(cur.w, cur.h),
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, backgroundColor: '#00000000', title: 'HALO',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setIgnoreMouseEvents(true, { forward: true });
  setInterval(pollCursor, 30);
  win.once('ready-to-show', () => win.show());
  screen.on('display-metrics-changed', () => win && win.setBounds(target(cur.w, cur.h), false));
}

// ---------- logging (so problems can be diagnosed) ----------
const LOG_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'HALO', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'halo.log');
function log(...a) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + a.join(' ') + '\n');
  } catch {}
}
try { if (fs.statSync(LOG_FILE).size > 400 * 1024) fs.writeFileSync(LOG_FILE, ''); } catch {}

// ---------- helper processes (PowerShell / WinRT) ----------
const PS = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const NOTIFY_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'HALO', 'Notify');
const helpersSrc = () => (app.isPackaged ? path.join(process.resourcesPath, 'helpers') : path.join(__dirname, 'helpers'));
const notifyReady = () =>
  fs.existsSync(path.join(NOTIFY_DIR, 'registered.txt')) && fs.existsSync(path.join(NOTIFY_DIR, 'NotifyHost.exe'));

function readLines(proc, onMsg) {
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/^\uFEFF/, '').trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onMsg(JSON.parse(line)); } catch {}
    }
  });
}
const send = (ch, m) => { if (win && !win.isDestroyed()) win.webContents.send(ch, m); };

function spawnHelper(tag, exe, script, wantStdin, onMsg, onExit) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)];
  log('start', tag, exe, args.join(' '));
  let p;
  try { p = spawn(exe, args, { windowsHide: true, stdio: [wantStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] }); }
  catch (e) { log(tag, 'spawn failed:', e.message); return null; }
  readLines(p, (m) => onMsg(m));
  p.stderr.on('data', (d) => log(tag, 'stderr:', String(d).slice(0, 600).replace(/\s+/g, ' ')));
  p.on('error', (e) => log(tag, 'error:', e.message));
  p.on('exit', (code) => { log(tag, 'exit code', code); onExit(code); });
  return p;
}

// --- notifications: BOTH sources run side by side (identity listener + Windows notification DB reader), de-duplicated ---
const nk = { identity: { proc: null, fails: 0 }, db: { proc: null, fails: 0 } };
let notifStop = false, notifOk = false, hintTimer = null, telegramSeen = false;
const stats = { browserSeen: 0, browserShown: 0, browserHidden: 0, otherHidden: 0 };
const recent = new Map();

// Only messenger / social apps are shown. Everything else (screenshots, system, email, ...) is dropped immediately.
const SOCIAL_RE = /telegram|whatsapp|instagram|discord|signal|messenger|facebook|twitter|slack|skype|viber|wechat|snapchat|threads|linkedin|reddit|tiktok|mastodon|bluesky|rubika|eitaa|soroush|igap|microsoft\.teams|msteams|(^|[^a-z])(x|bale|line|gap|teams)([^a-z]|$)|روبیکا|ایتا|سروش|بله|آیگپ|تلگرام|واتس|اینستاگرام|ایکس/i;
const BROWSER_RE = /chrome|edge|firefox|brave|opera|vivaldi/i;
const DOMAINS = ['web.telegram.org', 'telegram.org', 't.me', 'telegram.me', 'web.whatsapp.com', 'whatsapp.com', 'x.com', 'twitter.com',
  'instagram.com', 'discord.com', 'messenger.com', 'facebook.com', 'web.bale.ai', 'bale.ai', 'web.rubika.ir', 'rubika.ir', 'web.eitaa.com',
  'eitaa.com', 'linkedin.com', 'app.slack.com', 'slack.com', 'teams.microsoft.com', 'teams.live.com', 'web.skype.com', 'messages.google.com',
  'reddit.com', 'threads.net', 'tiktok.com'];
function classify(m) {
  const hay = [m.app, m.aumid].join(' ');
  if (/^halo$/i.test((m.app || '').trim())) return { ok: true };
  if (SOCIAL_RE.test(hay)) return { ok: true };
  if (BROWSER_RE.test(hay)) { // websites (web.telegram.org, x.com, ...) notify through the browser: match on the site shown in the toast
    const lines = Array.isArray(m.lines) ? m.lines : (m.lines ? [m.lines] : []);
    const origin = String(m.origin || lines[lines.length - 1] || '').toLowerCase();
    const text = [m.title, m.body, origin, m.launch, ...lines].join(' ').toLowerCase();
    const d = DOMAINS.find((x) => text.includes(x));
    if (d) return { ok: true, domain: d };
    if (SOCIAL_RE.test(origin)) return { ok: true, domain: null }; // e.g. origin line "Telegram Web"
    const site = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(origin) ? origin : '?'; // only ever log a domain, never message text
    log('browser toast ignored |', m.app, '| site:', site);
  }
  return { ok: false };
}
function onNotifMsg(m, kind) {
  if (m.type === 'toast') {
    const isBrowser = BROWSER_RE.test([m.app, m.aumid].join(' '));
    if (kind === 'identity' && isBrowser && nk.db.proc) return;   // browser toasts are handled by the DB reader (has the site + launch info)
    if (kind === 'db' && nk.identity.proc && !isBrowser) return;  // everything else by the official listener
    if (isBrowser) stats.browserSeen++;
    const c = classify(m);
    if (!c.ok) { if (isBrowser) stats.browserHidden++; else stats.otherHidden++; return; } // not a messenger / social app: ignored, never shown
    if (isBrowser) stats.browserShown++;
    if (/telegram/i.test([m.app, m.aumid].join(' '))) telegramSeen = true;
    if (c.domain) m.url = 'https://' + c.domain;
    if (BROWSER_RE.test([m.app, m.aumid].join(' ')) && m.origin) { // hide the "site" line Chrome adds under the message
      const o = String(m.origin).trim().toLowerCase();
      m.body = String(m.body || '').split('\n').filter((l) => l.trim().toLowerCase() !== o).join('\n');
    }
    const first = String(m.body || '').split(/\r?\n/)[0].trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
    const key = String(m.title || '').trim().toLowerCase() + '|' + first, now = Date.now();
    for (const [k, t] of recent) if (now - t > 10000) recent.delete(k);
    notifOk = true;
    if (recent.has(key)) return;
    recent.set(key, now);
    send('notif:new', m); log('toast via', kind, '|', m.app); // message text is never written to the log
  } else if (m.type === 'status') { log('notif', kind, 'status', JSON.stringify(m)); if (m.access === 'Allowed') notifOk = true; }
  else log('notif', kind, JSON.stringify(m).slice(0, 300));
}
function startNotifKind(kind) {
  if (process.platform !== 'win32' || nk[kind].proc || settings.notifConsent !== 'yes') return;
  if (kind === 'identity' && !notifyReady()) return;
  notifStop = false;
  const id = kind === 'identity';
  const exe = id ? path.join(NOTIFY_DIR, 'NotifyHost.exe') : PS;
  const script = id ? path.join(NOTIFY_DIR, 'listener.ps1') : path.join(helpersSrc(), 'notify-db.ps1');
  nk[kind].proc = spawnHelper('notif-' + kind, exe, script, false, (m) => onNotifMsg(m, kind), (code) => {
    nk[kind].proc = null;
    if (notifStop) return;
    if (code === 2) return;
    if (++nk[kind].fails <= 5) setTimeout(() => startNotifKind(kind), 5000);
  });
}
function startNotif() {
  startNotifKind('identity');
  startNotifKind('db'); // always on: needed for websites (Telegram Web, WhatsApp Web, X ...) and as fallback
  if (!hintTimer) hintTimer = setTimeout(() => {
    if (!notifOk) send('notif:new', { system: true, app: 'HALO', title: 'Notifications are off',
      body: 'Click to run the one-time setup', action: 'setup' });
  }, 15000);
}
function stopNotif() {
  notifStop = true;
  for (const k of Object.keys(nk)) if (nk[k].proc) { try { nk[k].proc.kill(); } catch {} nk[k].proc = null; }
}

const APP_KEYS = /chrome|msedge|edge|firefox|brave|opera|vivaldi|telegram|whatsapp|discord|bale|rubika|eitaa|instagram|signal|slack|teams|messenger/i;
const runCmd = (file, args) => new Promise((res) => execFile(file, args, { windowsHide: true }, (e, out) => res({ e, out: String(out || '') })));
async function fixWindowsNotifSettings() {
  if (process.platform !== 'win32' || settings.notifConsent !== 'yes') return;
  const changed = [];
  const push = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';
  const g = await runCmd('reg', ['query', push, '/v', 'ToastEnabled']);
  if (!g.e && /ToastEnabled\s+REG_DWORD\s+0x0/i.test(g.out)) {
    const r = await runCmd('reg', ['add', push, '/v', 'ToastEnabled', '/t', 'REG_DWORD', '/d', '1', '/f']);
    if (!r.e) changed.push('Windows notifications');
  }
  const base = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings';
  const q = await runCmd('reg', ['query', base]);
  if (!q.e) {
    for (const line of q.out.split(/\r?\n/)) {
      const k = line.trim();
      if (!/^HKEY_CURRENT_USER/i.test(k)) continue;
      const name = k.split('\\').pop();
      if (!APP_KEYS.test(name)) continue;
      const v = await runCmd('reg', ['query', k, '/v', 'Enabled']);
      if (/Enabled\s+REG_DWORD\s+0x0/i.test(v.out)) {
        const r = await runCmd('reg', ['add', k, '/v', 'Enabled', '/t', 'REG_DWORD', '/d', '1', '/f']);
        if (!r.e) changed.push(name.replace(/\..*$/, ''));
      }
    }
  }
  if (changed.length) {
    log('switched on Windows notifications for:', changed.join(', '));
    send('notif:new', { system: true, app: 'HALO', title: 'Windows notifications switched on', body: 'Enabled for: ' + [...new Set(changed)].join(', ') });
  }
}
function showWebHelp() {
  dialog.showMessageBox({
    type: 'info', title: 'Web messengers in your browser', message: 'Telegram Web, WhatsApp Web, X \u2026 in Chrome or Edge',
    detail: 'HALO shows these through Windows notifications. Each website must be allowed to notify you (one click per site):\n\n' +
            '1. Open the site (e.g. web.telegram.org)\n2. Click the icon left of the address \u203a Notifications \u203a Allow\n' +
            '3. Switch to another tab or app \u2014 sites only notify while their tab is in the background\n\n' +
            'HALO already switches on the Windows-side notification settings for your browsers and messengers by itself.',
    buttons: ['Open Chrome settings', 'Open Edge settings', 'Close'], defaultId: 0, cancelId: 2, noLink: true
  }).then((r) => {
    if (r.response === 0) execFile('cmd', ['/c', 'start', '', 'chrome', 'chrome://settings/content/notifications'], { windowsHide: true }, () => {});
    if (r.response === 1) execFile('cmd', ['/c', 'start', '', 'msedge', 'edge://settings/content/notifications'], { windowsHide: true }, () => {});
  });
}

function openApp(aumid, url) {
  if (url) { if (/^https:\/\/[a-z0-9.\-]+$/.test(url) && DOMAINS.includes(url.slice(8))) shell.openExternal(url); return; }
  if (aumid && /^[A-Za-z0-9._!\-]+$/.test(aumid)) execFile('explorer.exe', ['shell:AppsFolder\\' + aumid], () => {});
}

// One clear permission, asked once (before HALO reads anything).
async function ensureConsent() {
  if (settings.notifConsent === 'yes') { startNotif(); scheduleTelegramHint(); fixWindowsNotifSettings(); return; }
  if (settings.notifConsent === 'no') return;
  const r = await dialog.showMessageBox({
    type: 'question', title: 'HALO \u2014 notification access',
    message: 'Show messages from your social & messenger apps on the island?',
    detail: 'HALO will only read notifications from messenger and social apps (Telegram, WhatsApp, X, Bale, Rubika, Instagram, Discord and similar).\n\n' +
            'Everything else \u2014 screenshots, system alerts, email, other apps \u2014 is ignored.\n\n' +
            'If Windows notifications for your browsers or messenger apps are switched off, HALO switches them back on.\n\n' +
            'Nothing is saved or sent anywhere. It all stays on your PC, and you can turn this off any time from the tray icon.',
    buttons: ['Allow', 'Not now'], defaultId: 0, cancelId: 1, noLink: true,
    icon: nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
  });
  settings.notifConsent = r.response === 0 ? 'yes' : 'no'; saveSettings();
  if (r.response === 0) { startNotif(); scheduleTelegramHint(); fixWindowsNotifSettings(); }
}
function setConsent(on) {
  settings.notifConsent = on ? 'yes' : 'no'; saveSettings();
  if (on) { startNotif(); scheduleTelegramHint(); fixWindowsNotifSettings(); } else stopNotif();
}

// Telegram draws its own pop-ups unless "Native notifications" is on. That setting lives in Telegram's own
// protected storage, so HALO can't change it for you - it can only point you to it.
function scheduleTelegramHint() {
  if (settings.telegramHint) return;
  setTimeout(() => {
    if (telegramSeen || settings.telegramHint) return;
    execFile('tasklist', ['/FI', 'IMAGENAME eq Telegram.exe', '/NH'], { windowsHide: true }, (e, out) => {
      if (!/Telegram\.exe/i.test(out || '')) return;
      settings.telegramHint = true; saveSettings();
      send('notif:new', { system: true, app: 'Telegram', title: 'Turn on native notifications',
        body: 'Click for 3 quick steps so Telegram shows up here', action: 'telegram-hint' });
    });
  }, 25000);
}
function showTelegramHint() {
  dialog.showMessageBox({
    type: 'info', title: 'Telegram \u2192 HALO', message: 'Let Telegram notify through Windows',
    detail: 'By default Telegram draws its own pop-ups, which HALO can\u2019t see. To switch:\n\n' +
            '1. In Telegram open Settings \u203a Notifications\n2. Turn on \u201cNative notifications\u201d\n3. Keep \u201cDesktop notifications\u201d on\n\n' +
            'HALO can\u2019t change this for you \u2014 Telegram keeps the setting in its own protected storage.',
    buttons: ['Open Telegram', 'Close'], defaultId: 0, cancelId: 1, noLink: true
  }).then((r) => { if (r.response === 0) openApp('TelegramMessengerLLP.TelegramDesktop'); });
}

function runSetup() { // optional upgrade: official identity-based listener (needs admin once)
  stopNotif();
  try { fs.rmSync(path.join(NOTIFY_DIR, 'registered.txt'), { force: true }); } catch {}
  const script = path.join(helpersSrc(), 'setup-notifications.ps1');
  const argList = `-NoProfile -ExecutionPolicy Bypass -File "${script}" -Src "${helpersSrc()}" -Target "${NOTIFY_DIR}"`;
  log('runSetup', argList);
  execFile(PS, ['-NoProfile', '-Command',
    `Start-Process powershell.exe -Verb RunAs -ArgumentList '${argList.replace(/'/g, "''")}'`], { windowsHide: true }, (err) => { if (err) log('runSetup error', err.message); });
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (notifyReady()) {
      clearInterval(iv);
      setTimeout(() => { startNotif();
        send('notif:new', { system: true, app: 'HALO', title: 'Notifications enabled \u2713', body: 'Telegram and other app notifications will appear here' }); }, 1500);
    } else if (Date.now() - t0 > 3 * 60 * 1000) { clearInterval(iv); startNotif(); }
  }, 2000);
}

// --- browser / podcast / system media (Windows media controls) ---
let media = null, mediaFails = 0, mediaStop = false, lastMediaSig = '';
function startMedia() {
  if (process.platform !== 'win32' || media) return;
  mediaStop = false;
  media = spawnHelper('media', PS, path.join(helpersSrc(), 'media.ps1'), true, (m) => {
    if (m.type === 'media') {
      mediaFails = 0;
      if (m.sig !== lastMediaSig) { lastMediaSig = m.sig; log('media', m.app, '|', m.title, '|', m.status); }
      send('media:update', m);
    } else log('media', JSON.stringify(m).slice(0, 400));
  }, () => { media = null; if (!mediaStop && ++mediaFails <= 5) setTimeout(startMedia, 4000); });
  if (media && media.stdin) media.stdin.on('error', () => {});
}
function stopMedia() { mediaStop = true; if (media) { try { media.kill(); } catch {} media = null; } }

// ---------- diagnostics (one click: copies a report you can paste into chat) ----------
function tail(file, n) { try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-n).join('\n'); } catch { return '(none)'; } }
function runDiagnostics() {
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    "'PS ' + $PSVersionTable.PSVersion",
    "'DevMode reg: ' + (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock').AllowDevelopmentWithoutDevLicense",
    "'Package: ' + ((Get-AppxPackage -Name 'hworks.HALO.NotificationHost' | ForEach-Object { $_.Name + ' ' + $_.Status + ' ' + $_.InstallLocation }) -join ';')",
    "'WPN db: ' + (Test-Path (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Notifications\\wpndatabase.db'))",
    "'winsqlite3: ' + (Test-Path \"$env:WINDIR\\System32\\winsqlite3.dll\")"
  ].join('; ');
  execFile(PS, ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
    const r = [
      'HALO ' + app.getVersion() + ' | Windows ' + os.release() + ' ' + os.arch() + ' | packaged=' + app.isPackaged,
      'helpers dir: ' + helpersSrc() + ' exists=' + fs.existsSync(helpersSrc()),
      'consent=' + settings.notifConsent + ' | notif identity running=' + !!nk.identity.proc + ' | db running=' + !!nk.db.proc + ' | ok=' + notifOk + ' | identityReady=' + notifyReady(),
      'media running=' + !!media + ' fails=' + mediaFails,
      'toast stats: ' + JSON.stringify(stats),
      'updater: loaded=' + !!autoUpdater + (updaterLoadError ? ' (' + updaterLoadError + ')' : '') + ' | feed=' + UPDATE_OWNER + '/' + UPDATE_REPO + ' | lastError=' + (lastUpdateError || 'none'),
      String(stdout || (err && err.message) || '').trim(),
      '--- setup.log ---', tail(path.join(NOTIFY_DIR, 'setup.log'), 25),
      '--- halo.log (last 60) ---', tail(LOG_FILE, 60)
    ].join('\n');
    clipboard.writeText(r);
    dialog.showMessageBox({ type: 'info', title: 'HALO diagnostics', message: 'Diagnostic report copied to the clipboard',
      detail: 'Paste it (Ctrl+V) in the chat so the problem can be fixed.\n\nLog folder: ' + LOG_DIR, buttons: ['OK', 'Open log folder'], defaultId: 0, cancelId: 0 })
      .then((x) => { if (x.response === 1) shell.openPath(LOG_DIR); });
  });
}

// ---------- show / hide ----------
function showIsland() {
  if (!win) return;
  if (!win.isVisible()) win.showInactive();
  win.webContents.send('island:shown');
}
function toggleIsland() {
  if (!win) return;
  if (win.isVisible()) win.webContents.send('island:request-off'); else showIsland();
}

const DONATE_URL = 'https://reymit.ir/hworks';
function showAbout() {
  dialog.showMessageBox({
    type: 'info', title: 'About HALO', message: 'HALO ' + app.getVersion(),
    detail: 'A Dynamic Island for Windows.\n\n' +
            'Using HALO stays completely free!\n' +
            'To support us, you can click the link below.\n' +
            DONATE_URL + '\n\n' +
            'Made by hworks\necchworks@gmail.com',
    icon: nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')),
    buttons: ['Support HALO \u2665', 'Close'], defaultId: 0, cancelId: 1, noLink: true
  }).then((r) => { if (r.response === 0) shell.openExternal(DONATE_URL); });
}

// Global shortcut. NOT Ctrl+Alt+I: that is Photoshop's "Image Size" (a global hotkey would steal it). Adobe apps don't use the Win key.
const SHORTCUTS = [['Win + Alt + H', 'Super+Alt+H'], ['Ctrl + Alt + Shift + H', 'CommandOrControl+Alt+Shift+H'], ['Ctrl + Shift + F12', 'CommandOrControl+Shift+F12']];
let activeShortcut = null;
function applyShortcut(acc) {
  globalShortcut.unregisterAll(); activeShortcut = null;
  if (!acc) return true;
  let ok = false;
  try { ok = globalShortcut.register(acc, toggleIsland); } catch {}
  if (ok) activeShortcut = acc;
  return ok;
}
function initShortcut() {
  if (settings.shortcut === 'off') return;
  const pref = settings.shortcut || SHORTCUTS[0][1];
  for (const acc of [pref, ...SHORTCUTS.map((x) => x[1]).filter((x) => x !== pref)]) {
    if (applyShortcut(acc)) { if (acc !== pref) log('shortcut fallback to', acc); return; }
  }
  log('no global shortcut could be registered');
}
const shortcutLabel = () => { const x = SHORTCUTS.find((y) => y[1] === activeShortcut); return x ? x[0] : ''; };

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Turn on / off' + (activeShortcut ? '   (' + shortcutLabel() + ')' : ''), click: toggleIsland },
    { label: 'Keyboard shortcut', submenu: [
      ...SHORTCUTS.map(([lbl, acc]) => ({ label: lbl, type: 'radio', checked: activeShortcut === acc, click: () => {
        settings.shortcut = acc; saveSettings();
        if (!applyShortcut(acc)) send('notif:new', { system: true, app: 'HALO', title: 'Shortcut not available', body: lbl + ' is used by another app' });
        refreshTray();
      } })),
      { label: 'Off', type: 'radio', checked: !activeShortcut, click: () => { settings.shortcut = 'off'; saveSettings(); applyShortcut(null); refreshTray(); } }
    ] },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Show messenger notifications', type: 'checkbox', checked: settings.notifConsent === 'yes', click: (i) => setConsent(i.checked) },
    { label: 'Web messengers help (Chrome / Edge)', click: showWebHelp },
    { label: 'Check for updates', click: checkUpdatesNow },
    { label: 'Fix notifications (re-run setup)', click: runSetup },
    { label: 'Send test notification', click: () => new Notification({ title: 'HALO test', body: 'If you can read this on the island, notifications work \u2713' }).show() },
    { label: 'Diagnostics (copy report)', click: runDiagnostics },
    { type: 'separator' },
    { label: 'Support HALO \u2665 (donate)', click: () => shell.openExternal(DONATE_URL) },
    { label: 'About HALO', click: showAbout },
    { label: 'Quit', click: () => app.quit() }
  ]);
}
const refreshTray = () => { if (tray) tray.setContextMenu(buildTrayMenu()); };

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('HALO');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', toggleIsland);
}

function firstRun() {
  const f = path.join(app.getPath('userData'), 'firstrun.flag');
  if (fs.existsSync(f)) return;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '1'); } catch {}
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true }); // start with Windows by default
}

if (gotLock) app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  firstRun();
  ipcMain.on('island:resize', (_e, w, h) => resizeTo(w, h));
  ipcMain.on('power:hide', () => win && win.hide());
  ipcMain.on('power:wake', () => showIsland());
  ipcMain.on('notif:setup', () => runSetup());
  ipcMain.on('notif:open', (_e, aumid, url) => openApp(String(aumid || ''), String(url || '')));
  ipcMain.on('notif:action', (_e, a) => { if (a === 'setup') runSetup(); else if (a === 'settings') shell.openExternal('ms-settings:privacy-notifications'); else if (a === 'telegram-hint') showTelegramHint(); else if (a === 'update-install' && autoUpdater) autoUpdater.quitAndInstall(true, true); });
  ipcMain.on('notif:settings', () => shell.openExternal('ms-settings:privacy-notifications'));
  ipcMain.handle('notif:ready', () => notifyReady());
  ipcMain.on('media:cmd', (_e, c) => { if (media && media.stdin.writable && /^(toggle|play|pause|next|prev|seek [0-9.]+)$/.test(c)) media.stdin.write(c + '\n'); });
  ipcMain.handle('meta:read', (_e, p) => readTags(p));
  ipcMain.handle('state:load', () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; } });
  ipcMain.on('state:save', (_e, s) => {
    try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {}
  });
  ipcMain.handle('file:exists', (_e, p) => fs.existsSync(p));
  initShortcut();
  refreshTray();
  log('HALO', app.getVersion(), 'starting; packaged=' + app.isPackaged);
  ensureConsent();
  startMedia();
  initUpdater();
});

app.on('second-instance', () => showIsland());
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopNotif(); stopMedia(); });
app.on('window-all-closed', () => app.quit());
