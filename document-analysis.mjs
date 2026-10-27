import { Buffer } from 'node:buffer';
import { inflateRawSync, inflateSync } from 'node:zlib';

const LIMIT = 512 * 1024;
function entities(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
  }).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, s => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[s]);
}
function markup(text) {
  return entities(text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|h[1-6]|title|div|tr|si|row|w:p|a:p)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''));
}
function clean(text) {
  return text.normalize('NFC').replace(/[\x00-\x08\x0b-\x1f\ufffd]/g, ' ')
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 24000);
}

// Read only selected XML entries, with strict compressed and expanded size budgets.
// No archive paths are written to disk and macros or embedded objects are never run.
function officeText(bytes, ext) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) return '';
  const count = Math.min(bytes.readUInt16LE(end + 10), 2000);
  let pos = bytes.readUInt32LE(end + 16), expanded = 0, selected = [];
  const wanted = ext === 'docx' ? /^word\/document\.xml$/ : ext === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/ : /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/;
  for (let i = 0; i < count && pos + 46 <= bytes.length; i++) {
    if (bytes.readUInt32LE(pos) !== 0x02014b50) break;
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const packed = bytes.readUInt32LE(pos + 20), size = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28), extra = bytes.readUInt16LE(pos + 30), comment = bytes.readUInt16LE(pos + 32);
    const name = bytes.toString('utf8', pos + 46, pos + 46 + nameLength), offset = bytes.readUInt32LE(pos + 42);
    pos += 46 + nameLength + extra + comment;
    if (!wanted.test(name) || flags & 1 || size > LIMIT || packed > LIMIT || selected.length >= 24 || expanded + size > LIMIT * 2) continue;
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) continue;
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (start + packed > bytes.length) continue;
    const data = bytes.subarray(start, start + packed);
    const xml = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: LIMIT }) : null;
    if (!xml || xml.length !== size) continue;
    expanded += xml.length;
    selected.push({name, text: markup(xml.toString('utf8').replace(/<\/(?:t|v)>/g, ' '))});
  }
  return selected.sort((a,b) => a.name.localeCompare(b.name, 'en', {numeric:true})).map(entry => entry.text).join('\n');
}

// Basic PDF text only. Embedded font encodings, encrypted PDFs and scans fall back
// to the original filename rather than pretending that OCR was performed.
function pdfText(bytes) {
  const raw = bytes.subarray(0, 2 * LIMIT).toString('latin1');
  if (!raw.startsWith('%PDF-') || /\/Encrypt\b/.test(raw)) return '';
  const chunks = [], streams = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  let inspected = 0;
  for (const match of raw.matchAll(streams)) {
    if (inspected++ >= 24) break;
    try {
      const data = Buffer.from(match[2], 'latin1');
      if (data.length > LIMIT) continue;
      const stream = /\/FlateDecode\b/.test(match[1]) ? inflateSync(data, {maxOutputLength:LIMIT}).toString('latin1') : match[2];
      if (/\/Filter\b/.test(match[1]) && !/\/Filter\s*\/FlateDecode\b/.test(match[1])) continue;
      chunks.push(stream);
    } catch { /* Corrupt or oversized streams are not useful evidence. */ }
  }
  const lines = [];
  for (const chunk of chunks) for (const block of chunk.matchAll(/BT\b([\s\S]*?)\bET/g)) {
    const parts = [...block[1].matchAll(/\(((?:\\.|[^()\\])*)\)/g)].map(m => m[1].replace(/\\([()\\])/g,'$1').replace(/\\[nrt]/g,' ').replace(/\\[0-7]{1,3}/g,' '));
    const line = parts.join(' ').trim();
    if (/[a-z]{3}/i.test(line) && /^[\x20-\x7e\s]+$/.test(line)) lines.push(line);
  }
  return lines.join('\n');
}

export function extractDocumentText(name, bytes) {
  const ext = name.split('.').pop().toLowerCase();
  let text = '';
  try {
    if (['txt','md','html'].includes(ext)) {
      const sample = bytes.subarray(0, LIMIT);
      text = sample[0] === 0xff && sample[1] === 0xfe ? sample.subarray(2).toString('utf16le') : sample.toString('utf8');
      if (ext === 'html') text = markup(text);
      if (ext === 'md') text = text.replace(/^#{1,6}\s+/gm, '');
    } else if (['docx','pptx','xlsx'].includes(ext)) text = officeText(bytes, ext);
    else if (ext === 'pdf') text = pdfText(bytes);
  } catch { /* An unreadable file remains uploadable using filename suggestions. */ }
  text = clean(text);
  return {text:text.length >= 8 ? text : '', source:text.length >= 8 ? 'content' : 'filename'};
}
