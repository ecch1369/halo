// HALO - made by hworks (ecchworks@gmail.com)
// Minimal ID3v2 reader (title, artist, cover art). Falls back to the file name.
const fs = require('fs');
const path = require('path');

function decodeText(b) {
  if (!b || b.length < 2) return '';
  const enc = b[0];
  let d = b.subarray(1);
  let s = '';
  if (enc === 0) s = d.toString('latin1');
  else if (enc === 3) s = d.toString('utf8');
  else {
    if (d[0] === 0xff && d[1] === 0xfe) s = d.subarray(2).toString('utf16le');
    else if (d[0] === 0xfe && d[1] === 0xff) s = Buffer.from(d.subarray(2)).swap16().toString('utf16le');
    else s = (enc === 2 ? Buffer.from(d).swap16() : d).toString('utf16le');
  }
  return s.replace(/\0+$/g, '').replace(/\0/g, ' ').trim();
}

function readApic(b) {
  const enc = b[0];
  const mEnd = b.indexOf(0, 1);
  if (mEnd < 0) return null;
  let mime = b.toString('latin1', 1, mEnd);
  if (!mime.includes('/')) mime = 'image/jpeg';
  let p = mEnd + 2; // skip picture type
  if (enc === 0 || enc === 3) {
    const q = b.indexOf(0, p);
    if (q < 0) return null;
    p = q + 1;
  } else {
    let q = p;
    while (q + 1 < b.length && !(b[q] === 0 && b[q + 1] === 0)) q += 2;
    p = q + 2;
  }
  const img = b.subarray(p);
  if (img.length < 100 || img.length > 5 * 1024 * 1024) return null;
  return 'data:' + mime + ';base64,' + img.toString('base64');
}

function readTags(file) {
  const out = { path: file, title: path.basename(file).replace(/\.[^.]+$/, ''), artist: '', art: null };
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(10);
    fs.readSync(fd, head, 0, 10, 0);
    if (head.toString('latin1', 0, 3) !== 'ID3') { fs.closeSync(fd); return out; }
    const ver = head[3];
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    const buf = Buffer.alloc(Math.min(size, 8 * 1024 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 10);
    fs.closeSync(fd);
    let o = 0;
    while (o + 10 <= buf.length) {
      const id = buf.toString('latin1', o, o + 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsz = ver === 4
        ? ((buf[o + 4] & 0x7f) << 21) | ((buf[o + 5] & 0x7f) << 14) | ((buf[o + 6] & 0x7f) << 7) | (buf[o + 7] & 0x7f)
        : buf.readUInt32BE(o + 4);
      const body = buf.subarray(o + 10, o + 10 + fsz);
      o += 10 + fsz;
      if (id === 'TIT2') { const t = decodeText(body); if (t) out.title = t; }
      else if (id === 'TPE1') { const t = decodeText(body); if (t) out.artist = t; }
      else if (id === 'APIC' && !out.art) out.art = readApic(body);
    }
  } catch (e) { /* ignore, keep fallback */ }
  return out;
}

module.exports = { readTags };
