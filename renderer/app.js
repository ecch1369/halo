// HALO - made by hworks (ecchworks@gmail.com)
const api = window.island;
const $ = (id) => document.getElementById(id);
const isl = $('island');
const glowEl = $('glow');
let morphUntil = 0;
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.6l-3.1 4.4L8.9 15.8 7.3 14.6 10.2 10.5 7 6H3V4h5l3.6 5L13.3 7H17zM3 18v-2h4l2.4-3.3 1.6 1.2L8.5 18zM17 21v-3h-3.7l-2-2.8 1.3-1.9 1.9 2.7H17v-3l4 4z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zM17 17H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><path d="M9 2h6v2H9zM12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 4v5h-2v-5zM19.03 6.39l1.42 1.42-1.5 1.5-1.42-1.42z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 6 14 4.6 6.6 12 14 19.4 15.4 18 9.4 12z"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M11 2h2v10h-2zM17.6 5.4a8 8 0 1 1-11.2 0l1.4 1.4a6 6 0 1 0 8.4 0z"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7zM9 3h6l1 2h4v2H4V5h4z"/></svg>'
};
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|oga|m4a|aac|opus|wma|webm)$/i;
const DEFAULT_ACCENT = '#ff3b5c';

// ---------- state ----------
const audio = new Audio();
let tracks = [], idx = -1, shuffle = false, repeat = 0; // repeat: 0 off, 1 all, 2 one
let mode = 'idle', holdTimer = null, editing = false, dragDepth = 0, prevMode = 'idle', fitT = null;
let queue = [], notifTimer = null, curNotif = null, hintCount = 0;
let hovering = false, idleT = null, sleepT = null, sleeping = false, idleSeconds = 60;
let ext = null; // current system media session (browser, podcast, Spotify...)
let timer = { total: 300, left: 300, running: false, h: null, done: false };

const SIZE = {
  idle: [127, 26], idleBig: [190, 38], mini: [230, 38], miniTimer: [140, 38],
  player: [420, 172], playlist: [420, 350], timer: [330, 190], drop: [320, 90], notif: [360, 62]
};

// ---------- helpers ----------
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map((x, i) => (i === 0 && /^[a-zA-Z]:$/.test(x)) ? x : encodeURIComponent(x)).join('/');
const hue = (s) => { let h = 0; for (const c of (s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function artStyle(t, el) {
  const key = t ? (t.art || ('t:' + t.title)) : '';
  if (el._k === key) return; // same cover as before: skip (assigning big data URLs every render caused hiccups)
  el._k = key;
  if (t && t.art) { el.style.backgroundImage = `url(${t.art})`; el.textContent = ''; }
  else if (t) { el.style.backgroundImage = `linear-gradient(135deg,hsl(${hue(t.title)},70%,45%),hsl(${(hue(t.title) + 60) % 360},70%,30%))`; el.textContent = ((t.title || '\u266a').trim()[0]) || '\u266a'; }
  else { el.style.backgroundImage = 'none'; el.textContent = ''; }
}
const APPS = { chrome: 'Chrome', msedge: 'Edge', edge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi',
  telegram: 'Telegram', whatsapp: 'WhatsApp', discord: 'Discord', soundcloud: 'SoundCloud', spotify: 'Spotify', applemusic: 'Apple Music', vlc: 'VLC', tidal: 'TIDAL', zunemusic: 'Media Player', 'media.player': 'Media Player' };
function friendly(a) {
  const raw = (a || '').replace(/\.exe$/i, ''), l = raw.toLowerCase(), k = Object.keys(APPS).find((x) => l.includes(x));
  if (k) return APPS[k];
  const last = raw.split(/[.!_\\/]/).filter(Boolean).pop() || raw;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// ---------- sources: local playlist vs. system media ----------
const cur = () => tracks[idx];
const localPlaying = () => !audio.paused && !audio.ended && idx >= 0;
const src = () => (localPlaying() ? 'local' : (ext && (ext.status === 'Playing' || !cur())) ? 'ext' : 'local');
const nowTrack = () => (src() === 'ext' ? ext : cur());
const playing = () => (src() === 'ext' ? ext.status === 'Playing' : localPlaying());
const nowPos = () => (src() === 'ext'
  ? Math.min(ext.dur || Infinity, ext.pos + (ext.status === 'Playing' ? (Date.now() - ext.at) / 1000 : 0))
  : (audio.currentTime || 0));
const nowDur = () => (src() === 'ext' ? (ext.dur || 0) : (audio.duration || 0));

// ---------- marquee (looping scroll for long text) ----------
function setMarq(el, text) {
  text = text || '';
  if (el._text === text) return;
  el._text = text;
  el.classList.remove('run');
  el.textContent = '';
  const inner = document.createElement('div'); inner.className = 'mi';
  const s = document.createElement('span'); s.textContent = text; s.dir = 'auto';
  inner.appendChild(s); el.appendChild(inner);
  scheduleFit(120);
}
function fitMarq(el) {
  const inner = el.firstChild; if (!inner) return;
  while (inner.childNodes.length > 1) inner.removeChild(inner.lastChild);
  el.classList.remove('run');
  const s = inner.firstChild, w = s.getBoundingClientRect().width, cw = el.clientWidth;
  if (cw > 0 && w > cw + 1) {
    const gap = 40, clone = s.cloneNode(true);
    clone.style.marginLeft = gap + 'px';
    inner.appendChild(clone);
    el.style.setProperty('--shift', (w + gap) + 'px');
    el.style.setProperty('--dur', ((w + gap) / 36).toFixed(2) + 's');
    el.classList.add('run');
  }
}
function fitAll() { ['title', 'artist', 'miniTime', 'nTitle', 'nBody'].forEach((id) => fitMarq($(id))); }
function scheduleFit(ms = 380) { clearTimeout(fitT); fitT = setTimeout(fitAll, ms); }

// ---------- cover colour + glow ----------
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [Math.round(h), s * 100, l * 100];
}
function accentFrom(t) {
  return new Promise((res) => {
    if (!t) return res(DEFAULT_ACCENT);
    if (t.accent) return res(t.accent);
    const done = (c) => { t.accent = c; res(c); };
    if (!t.art) return done(`hsl(${hue(t.title)} 75% 60%)`);
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(im, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = mx ? (mx - mn) / mx : 0, wt = sat * sat * (mx / 255) + 0.005;
          r += R * wt; g += G * wt; b += B * wt; w += wt;
        }
        const [h, s, l] = rgb2hsl(r / w, g / w, b / w);
        done(`hsl(${h} ${Math.min(95, Math.max(s, 65))}% ${Math.min(68, Math.max(l, 56))}%)`);
      } catch { done(DEFAULT_ACCENT); }
    };
    im.onerror = () => done(DEFAULT_ACCENT);
    im.src = t.art;
  });
}
function applyAccent(t) {
  accentFrom(t).then((c) => { if (mode !== 'notif' && (!t || nowTrack() === t)) document.documentElement.style.setProperty('--accent', c); });
}
function restoreAccent() {
  const t = nowTrack();
  if (t) applyAccent(t); else document.documentElement.style.setProperty('--accent', DEFAULT_ACCENT);
}
function decorate() {
  const on = mode !== 'drop' && (mode === 'notif' || playing() || timer.running || (['player', 'playlist', 'timer'].includes(mode) && !!nowTrack()));
  isl.classList.toggle('playing', playing());
  isl.classList.toggle('timer-run', timer.running);
  isl.classList.toggle('glow', on);
  isl.classList.toggle('tinted', on);
  isl.classList.toggle('hot', hovering);
  // the outer glow is a separate layer that only appears once the morph has finished (keeps the animation light)
  glowEl.classList.toggle('on', on && Date.now() >= morphUntil);
  glowEl.classList.toggle('playing', playing());
  glowEl.classList.toggle('timer-run', timer.running);
}

// ---------- view / size ----------
function baseMode() {
  if (playing()) return 'mini';
  if (timer.running || timer.done) return 'miniTimer';
  return 'idle';
}
function setMode(m) {
  mode = m;
  const key = m === 'miniTimer' ? 'mini' : m;
  isl.className = 's-' + key;
  decorate();
  const s = (m === 'idle' && hovering) ? SIZE.idleBig : (SIZE[m] || SIZE.idle); // idle = 2/3 size, grows back on hover
  const root = document.documentElement.style;
  root.setProperty('--w', s[0] + 'px'); root.setProperty('--h', s[1] + 'px');
  root.setProperty('--r', (['idle', 'mini', 'miniTimer'].includes(m) ? s[1] / 2 : 24) + 'px');
  morphUntil = Date.now() + 620; glowEl.classList.remove('on'); setTimeout(decorate, 650);
  api.resize(s[0], s[1]);
  render();
  scheduleFit(620);
  armSleep();
}
// Auto-hide: after a while with nothing playing and no interaction, the island fades away (like power-off).
// It comes back when something happens (notification, music/video starts) or when you rest the cursor at the top-centre.
function armSleep() {
  clearTimeout(sleepT);
  if (!idleSeconds || sleeping || mode !== 'idle' || hovering) return;
  sleepT = setTimeout(() => {
    if (mode !== 'idle' || hovering || sleeping) return;
    sleeping = true; document.body.classList.add('sleep');
    setTimeout(() => { if (sleeping) api.hide(true); }, 520);
  }, idleSeconds * 1000);
}
function wakeUp() { sleeping = false; document.body.classList.remove('sleep'); armSleep(); }
function collapse() {
  clearTimeout(holdTimer); clearTimeout(notifTimer); curNotif = null; editing = false;
  restoreAccent(); setMode(baseMode()); pump();
}
function refreshBase() { if (['idle', 'mini', 'miniTimer'].includes(mode)) setMode(baseMode()); else render(); }

// ---------- notifications ----------
const BRANDS = { telegram: '#2AABEE', whatsapp: '#25D366', discord: '#5865F2', instagram: '#E1306C', gmail: '#EA4335',
  outlook: '#0A78D4', slack: '#4A154B', teams: '#6264A7', messenger: '#0A7CFF', signal: '#3A76F0', eitaa: '#F58220', bale: '#2BB673' };
function brandColor(app) {
  const k = Object.keys(BRANDS).find((b) => (app || '').toLowerCase().includes(b));
  return k ? BRANDS[k] : `hsl(${hue(app || 'app')} 70% 55%)`;
}
const busy = () => ['player', 'playlist', 'timer', 'drop'].includes(mode);
function pump() { if (mode === 'notif' || busy() || !queue.length) return; showNotif(queue.shift()); }
function showNotif(n) {
  curNotif = n;
  const c = brandColor(n.app);
  $('nIcon').style.background = c; $('nIcon').textContent = ((n.app || '\u2022').trim()[0]) || '\u2022';
  $('nApp').textContent = n.app || '';
  setMarq($('nTitle'), n.title || ''); setMarq($('nBody'), n.body || '');
  document.documentElement.style.setProperty('--accent', c);
  setMode('notif');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => {
    // long messages stay a bit longer so the marquee can run a full loop
    if ($('nBody').classList.contains('run') || $('nTitle').classList.contains('run')) {
      notifTimer = setTimeout(endNotif, 7000);
    } else endNotif();
  }, n.action ? 9000 : 5200);
}
function endNotif() {
  clearTimeout(notifTimer); curNotif = null;
  if (queue.length) { showNotif(queue.shift()); return; }
  restoreAccent(); setMode(baseMode());
}
api.onNotif((n) => {
  if (document.body.classList.contains('off')) return;
  queue.push(n); if (queue.length > 6) queue.shift();
  if (sleeping) { api.wake(); return; } // the banner is shown right after it wakes up
  pump();
});

// ---------- rendering ----------
function render() {
  const t = nowTrack(), e = src() === 'ext';
  setMarq($('title'), t ? t.title : 'Nothing playing');
  setMarq($('artist'), t ? (t.artist || (e ? t.album : '') || ' ') : 'Drop audio files here');
  $('srcName').textContent = e ? friendly(t.app) : '';
  artStyle(t, $('art'));
  $('bPlay').innerHTML = playing() ? ICON.pause : ICON.play;
  $('bShuffle').classList.toggle('on', shuffle && !e);
  $('bRepeat').classList.toggle('on', repeat > 0 && !e);
  $('bShuffle').classList.toggle('dim', e);
  $('bRepeat').classList.toggle('dim', e);
  $('bRepeat').title = ['Repeat off', 'Repeat all', 'Repeat one'][repeat];
  decorate();

  // compact pill: art + (timer | title) + equalizer
  const showTimer = timer.running || timer.done;
  setMarq($('miniTime'), showTimer ? mmss(timer.left) : (t && playing() ? t.title : ''));
  $('miniTime').style.fontSize = showTimer ? '14px' : '12px';
  const showThumb = !!t && playing(); // small 1:1 cover on the left; no cover -> gradient + first letter
  $('mini').classList.toggle('no-art', !showThumb);
  if (showThumb) artStyle(t, $('miniArt'));

  // playlist
  $('plCount').textContent = tracks.length ? `Playlist \u00b7 ${tracks.length} song${tracks.length === 1 ? '' : 's'}` : 'Playlist';
  $('plEdit').textContent = editing ? 'Done' : 'Edit';
  $('plItems').parentElement.classList.toggle('editing', editing);
  const box = $('plItems');
  const plSig = editing + '|' + idx + '|' + tracks.map((x) => x.path).join('\n');
  if (box._sig === plSig) { updateProgress(); return; } // nothing changed: skip the rebuild
  box._sig = plSig; box.innerHTML = '';
  if (!tracks.length) { box.innerHTML = '<div class="empty">Drop music files here</div>'; }
  tracks.forEach((tr, i) => {
    const d = document.createElement('div'); d.className = 'item' + (i === idx ? ' cur' : '');
    const th = document.createElement('div'); th.className = 'thumb'; artStyle(tr, th);
    const tx = document.createElement('div'); tx.className = 't';
    const b = document.createElement('b'); b.textContent = tr.title; b.dir = 'auto';
    const sm = document.createElement('small'); sm.textContent = tr.artist || ''; sm.dir = 'auto';
    tx.append(b, sm);
    const del = document.createElement('button'); del.className = 'del'; del.innerHTML = ICON.del;
    del.onclick = (ev) => { ev.stopPropagation(); removeTrack(i); };
    d.append(th, tx, del);
    d.onclick = () => { if (!editing) playAt(i); };
    box.appendChild(d);
  });
  updateProgress();
}
function updateProgress() {
  const d = nowDur(), c = nowPos();
  $('tCur').textContent = fmt(c);
  $('tRem').textContent = d ? '-' + fmt(d - c) : '--:--';
  const p = d ? Math.min(1000, (c / d) * 1000) : 0;
  $('seek').value = p;
  $('seek').style.background = `linear-gradient(90deg,var(--accent) ${p / 10}%,#2a2a2e ${p / 10}%)`;
}
setInterval(() => { if (mode === 'player') updateProgress(); }, 250);

// ---------- playlist / playback (local files) ----------
function persist() {
  api.saveState({ tracks: tracks.map(t => ({ path: t.path, title: t.title, artist: t.artist })), idx, shuffle, repeat, hint: hintCount });
}
async function addFiles(paths) {
  const wasEmpty = tracks.length === 0;
  const first = tracks.length;
  for (const p of paths) {
    if (!AUDIO_EXT.test(p) || tracks.some(t => t.path === p)) continue;
    tracks.push(await api.readTags(p));
  }
  if (tracks.length === first) return;
  persist();
  if (wasEmpty || !localPlaying()) playAt(first); else render();
}
function playAt(i) {
  if (i < 0 || i >= tracks.length) return;
  if (ext && ext.status === 'Playing') api.mediaCmd('pause'); // like iOS: starting one source pauses the other
  idx = i;
  audio.src = toUrl(tracks[i].path);
  audio.play().catch(() => {});
  navigator.mediaSession && (navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[i].title, artist: tracks[i].artist }));
  applyAccent(tracks[i]);
  persist(); render();
}
function toggle() {
  if (src() === 'ext') {
    api.mediaCmd('toggle');
    ext.pos = nowPos(); ext.at = Date.now(); ext.status = ext.status === 'Playing' ? 'Paused' : 'Playing';
    render(); refreshBase(); return;
  }
  if (idx < 0) { if (tracks.length) playAt(0); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}
function next(auto) {
  if (!auto && src() === 'ext') { api.mediaCmd('next'); return; }
  if (!tracks.length) return;
  if (auto && repeat === 2) { audio.currentTime = 0; audio.play(); return; }
  let n;
  if (shuffle && tracks.length > 1) { do { n = Math.floor(Math.random() * tracks.length); } while (n === idx); }
  else { n = idx + 1; if (n >= tracks.length) { if (auto && repeat === 0) { audio.pause(); render(); refreshBase(); return; } n = 0; } }
  playAt(n);
}
function prev() {
  if (src() === 'ext') { api.mediaCmd('prev'); return; }
  if (!tracks.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  playAt((idx - 1 + tracks.length) % tracks.length);
}
function removeTrack(i) {
  const wasCur = i === idx;
  tracks.splice(i, 1);
  if (wasCur) { audio.pause(); audio.removeAttribute('src'); idx = tracks.length ? Math.min(i, tracks.length - 1) : -1; if (idx >= 0) playAt(idx); }
  else if (i < idx) idx--;
  persist(); render(); refreshBase();
}
audio.addEventListener('timeupdate', () => { if (src() === 'local') updateProgress(); });
audio.addEventListener('loadedmetadata', updateProgress);
audio.addEventListener('play', () => { if (sleeping) api.wake(); render(); refreshBase(); });
audio.addEventListener('pause', () => { render(); refreshBase(); });
audio.addEventListener('ended', () => next(true));
audio.addEventListener('error', () => { if (tracks.length > 1) next(true); });

// ---------- system media (YouTube, podcasts, Spotify, any browser) ----------
api.onMedia((m) => {
  const wasSrc = src(), wasTrack = nowTrack(), wasPlaying = playing();
  if (m.none || !m.title || !['Playing', 'Paused', 'Changing'].includes(m.status)) {
    ext = null;
  } else if (!ext || ext.sig !== m.sig) {
    ext = { sig: m.sig, app: m.app, title: m.title, artist: m.artist, album: m.album, status: m.status,
            pos: m.pos, dur: m.dur, at: Date.now(), art: m.art || null, accent: null };
  } else {
    ext.status = m.status; ext.pos = m.pos; ext.dur = m.dur; ext.at = Date.now();
    if (m.artChanged && m.art) { ext.art = m.art; ext.accent = null; }
  }
  if (sleeping && playing()) api.wake();
  const changed = wasSrc !== src() || wasTrack !== nowTrack() || wasPlaying !== playing();
  if (!changed) return;
  if (nowTrack() !== wasTrack) applyAccent(nowTrack());
  render(); refreshBase();
});

// ---------- timer ----------
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.2, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}
function timerTick() {
  timer.left--;
  if (timer.left <= 0) {
    timer.left = 0; timer.running = false; timer.done = true; clearInterval(timer.h); beep();
    api.wake(); setMode(baseMode());
    setTimeout(() => { timer.done = false; timer.left = timer.total; if (['mini', 'miniTimer'].includes(mode)) collapse(); render(); }, 5000);
  }
  $('tBig').textContent = mmss(timer.left); render();
}
function timerShow() { $('tBig').textContent = mmss(timer.left); $('tStart').textContent = timer.running ? 'Pause' : 'Start'; }
document.querySelectorAll('#timerView [data-m]').forEach((b) => b.onclick = () => {
  if (timer.running) return;
  const v = b.dataset.m;
  const m = v === '+1' ? timer.total / 60 + 1 : v === '-1' ? timer.total / 60 - 1 : +v;
  timer.total = Math.max(1, m) * 60; timer.left = timer.total; timerShow();
});
$('tStart').onclick = () => {
  if (timer.running) { timer.running = false; clearInterval(timer.h); }
  else { if (timer.left <= 0) timer.left = timer.total; timer.running = true; timer.done = false; timer.h = setInterval(timerTick, 1000); }
  timerShow(); render();
};
$('tReset').onclick = () => { timer.running = false; clearInterval(timer.h); timer.left = timer.total; timerShow(); render(); };
$('tBack').onclick = () => setMode('player');

// ---------- UI events ----------
$('bPlay').innerHTML = ICON.play; $('bPrev').innerHTML = ICON.prev; $('bNext').innerHTML = ICON.next;
$('bShuffle').innerHTML = ICON.shuffle; $('bRepeat').innerHTML = ICON.repeat; $('bList').innerHTML = ICON.list;
$('bTimer').innerHTML = ICON.timer; $('bPower').innerHTML = ICON.power; $('plBack').innerHTML = ICON.back;
$('bPlay').onclick = toggle; $('bPrev').onclick = prev; $('bNext').onclick = () => next(false);
$('bShuffle').onclick = () => { shuffle = !shuffle; persist(); render(); };
$('bRepeat').onclick = () => { repeat = (repeat + 1) % 3; persist(); render(); };
$('bList').onclick = () => setMode('playlist');
$('bTimer').onclick = () => { timerShow(); setMode('timer'); };
$('plBack').onclick = () => setMode('player');
$('plEdit').onclick = () => { editing = !editing; render(); };
$('seek').oninput = (e) => {
  const d = nowDur(); if (!d) return;
  const t = (e.target.value / 1000) * d;
  if (src() === 'ext') { api.mediaCmd('seek ' + t.toFixed(1)); ext.pos = t; ext.at = Date.now(); }
  else audio.currentTime = t;
  updateProgress();
};

// tap to open, move away to close (like the iPhone island)
isl.addEventListener('click', () => {
  if (mode === 'notif') {
    const n = curNotif;
    endNotif();
    if (n) { if (n.action) api.notifAction(n.action); else if (n.aumid || n.url) api.openApp(n.aumid || '', n.url || ''); }
    return;
  }
  if (['idle', 'mini', 'miniTimer'].includes(mode)) setMode('player');
});
// hover comes from the main process (it knows where the cursor is even when the window is click-through) and from the DOM
function setHover(v) {
  if (hovering === v) return;
  hovering = v; isl.classList.toggle('hot', v); clearTimeout(idleT); armSleep();
  if (v) { clearTimeout(holdTimer); if (mode === 'idle') setMode('idle'); return; }
  if (mode === 'idle') idleT = setTimeout(() => { if (!hovering && mode === 'idle') setMode('idle'); }, 250);
  if (mode === 'drop' || mode === 'notif') return;
  clearTimeout(holdTimer); holdTimer = setTimeout(collapse, 900);
}
isl.addEventListener('mouseenter', () => setHover(true));
isl.addEventListener('mouseleave', () => setHover(false));
api.onHover(setHover);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') collapse(); });

// drag & drop (works on every state, including the idle black pill)
window.addEventListener('dragenter', (e) => { e.preventDefault(); if (dragDepth++ === 0) { prevMode = mode; setMode('drop'); } });
window.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; setMode(prevMode === 'drop' ? baseMode() : prevMode); } });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0;
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  await addFiles(paths);
  setMode('player');
  clearTimeout(holdTimer); holdTimer = setTimeout(collapse, 2500);
});

// power off: fade away, pause local music, hide (tray icon / Win+Alt+H turns it back on)
function powerOff() {
  clearTimeout(holdTimer);
  audio.pause();
  document.body.classList.add('off');
  setTimeout(() => api.hide(), 480);
}
$('bPower').onclick = powerOff;
api.onRequestOff(powerOff);
api.onShown(() => { wakeUp(); collapse(); document.body.classList.remove('off'); });
api.onAutoHide((sec) => { idleSeconds = sec; if (!sec) wakeUp(); else armSleep(); });

// media keys
if (navigator.mediaSession) {
  navigator.mediaSession.setActionHandler('play', toggle);
  navigator.mediaSession.setActionHandler('pause', toggle);
  navigator.mediaSession.setActionHandler('previoustrack', prev);
  navigator.mediaSession.setActionHandler('nexttrack', () => next(false));
}

// ---------- boot ----------
(async () => {
  const s = await api.loadState();
  if (s && Array.isArray(s.tracks)) {
    for (const t of s.tracks) { if (await api.exists(t.path)) { tracks.push(await api.readTags(t.path)); } }
    shuffle = !!s.shuffle; repeat = s.repeat | 0; hintCount = s.hint | 0;
    idx = tracks.length ? Math.min(Math.max(s.idx | 0, 0), tracks.length - 1) : -1;
    if (idx >= 0) { audio.src = toUrl(tracks[idx].path); applyAccent(tracks[idx]); }
  }
  try { const st = await api.getSettings(); idleSeconds = st.autoHideSec | 0; } catch {}
  setMode('idle');
})();
