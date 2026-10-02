// Shared kit for the report tests (tester round 2): mounts the real studio
// provider, hands back its live context value, and reads a built PDF back
// with poppler. The PDF tests therefore run the same state the screen has.
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WellTestStudioProvider, useWellTestStudio } from '@/contexts/WellTestStudioContext';

// Mounted with createRoot, not Testing Library's render: the library unmounts
// everything it rendered after each test, and a studio shared by a describe
// block has to stay alive across its tests.
export function mountStudio() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = { current: null };
  const Probe = () => { ref.current = useWellTestStudio(); return null; };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<WellTestStudioProvider><Probe /></WellTestStudioProvider>); });
  return {
    get ctx() { return ref.current; },
    act: async (fn) => { await act(async () => { await fn(ref.current); }); },
    unmount: () => { act(() => root.unmount()); host.remove(); },
  };
}

/** The Petrolord chart mark from public/, as loadPetrolordLogo would hand it over. */
export function chartLogo() {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'petrolord-chart-watermark.png'));
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const tmp = (name) => path.join(os.tmpdir(), `wta-r2-${process.pid}-${Date.now()}-${Math.round(Math.random() * 1e6)}-${name}`);

/** Read a jsPDF document back: text per page, page count, embedded images, and ink per page. */
export function readPdf(doc, { ink = false } = {}) {
  const file = tmp('report.pdf');
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  try {
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    const pageText = text.split('\f');
    const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' })
      .split('\n').slice(2).filter((l) => l.trim())
      .map((l) => { const c = l.trim().split(/\s+/); return { page: Number(c[0]), type: c[2], width: Number(c[3]), height: Number(c[4]) }; });
    const out = { pages, text, pageText, images, file: null };
    if (ink) out.ink = (page, box) => pageInk(file, page, box);
    if (!ink) return out;
    // ink() needs the file: the caller cleans up through out.close()
    out.close = () => fs.existsSync(file) && fs.unlinkSync(file);
    return out;
  } finally {
    if (!ink && fs.existsSync(file)) fs.unlinkSync(file);
  }
}

/**
 * Rasterize one page to grey and count the pixels that are not white inside
 * a box given in mm. A plot that drew nothing leaves only its frame and
 * grid; a plot with data leaves far more. This is the "not a blank canvas"
 * check for a vector plot.
 */
export function pageInk(file, page, box) {
  const root = tmp('page');
  const dpi = 60;
  execFileSync('pdftoppm', ['-gray', '-r', String(dpi), '-f', String(page), '-l', String(page), file, root]);
  const made = fs.readdirSync(path.dirname(root)).filter((f) => f.startsWith(path.basename(root)) && f.endsWith('.pgm'));
  const pgm = path.join(path.dirname(root), made[0]);
  try {
    const buf = fs.readFileSync(pgm);
    // P5 header: magic, width, height, maxval, then the raster
    let pos = 0;
    const token = () => {
      while (buf[pos] === 0x20 || buf[pos] === 0x0a || buf[pos] === 0x0d || buf[pos] === 0x09) pos += 1;
      const start = pos;
      while (!(buf[pos] === 0x20 || buf[pos] === 0x0a || buf[pos] === 0x0d || buf[pos] === 0x09)) pos += 1;
      return buf.toString('ascii', start, pos);
    };
    token();
    const w = Number(token());
    const h = Number(token());
    token();
    pos += 1;
    const pxPerMm = dpi / 25.4;
    const x0 = Math.max(0, Math.floor(box.x * pxPerMm));
    const x1 = Math.min(w, Math.ceil((box.x + box.w) * pxPerMm));
    const y0 = Math.max(0, Math.floor(box.y * pxPerMm));
    const y1 = Math.min(h, Math.ceil((box.y + box.h) * pxPerMm));
    let dark = 0;
    let coloured = 0;
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        const v = buf[pos + yy * w + xx];
        if (v < 250) coloured += 1;
        if (v < 140) dark += 1;
      }
    }
    return { coloured, dark, area: (x1 - x0) * (y1 - y0) };
  } finally {
    fs.unlinkSync(pgm);
  }
}
