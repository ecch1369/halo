// HALO - made by hworks (ecchworks@gmail.com)
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('island', {
  resize: (w, h) => ipcRenderer.send('island:resize', w, h),
  readTags: (p) => ipcRenderer.invoke('meta:read', p),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.send('state:save', s),
  exists: (p) => ipcRenderer.invoke('file:exists', p),
  hide: (auto) => ipcRenderer.send('power:hide', !!auto),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  onAutoHide: (cb) => ipcRenderer.on('island:autohide', (_e, v) => cb(v | 0)),
  wake: () => ipcRenderer.send('power:wake'),
  onShown: (cb) => ipcRenderer.on('island:shown', () => cb()),
  onRequestOff: (cb) => ipcRenderer.on('island:request-off', () => cb()),
  onHover: (cb) => ipcRenderer.on('island:hover', (_e, v) => cb(!!v)),
  onNotif: (cb) => ipcRenderer.on('notif:new', (_e, m) => cb(m)),
  onMedia: (cb) => ipcRenderer.on('media:update', (_e, m) => cb(m)),
  mediaCmd: (c) => ipcRenderer.send('media:cmd', c),
  notifAction: (a) => ipcRenderer.send('notif:action', a),
  openApp: (aumid, url) => ipcRenderer.send('notif:open', aumid, url),
  setupNotifications: () => ipcRenderer.send('notif:setup'),
  openSettings: () => ipcRenderer.send('notif:settings'),
  notifReady: () => ipcRenderer.invoke('notif:ready'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  dbg: (m) => ipcRenderer.send('dbg', String(m).slice(0, 300)),
  hb: () => ipcRenderer.send('hb'),
  mouseKick: () => ipcRenderer.send('mouse:kick')
});
