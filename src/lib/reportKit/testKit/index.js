/**
 * Report Kit, test side (jest only: node fs and child_process, and the
 * poppler tools pdfinfo, pdftotext, pdfimages and pdftoppm, which CI
 * installs for the export read-back tests).
 *
 * A report test builds the PDF with the function the Export button calls,
 * then reads the FILE back, so what is asserted is what a reviewer opens:
 *
 *   import { readPdf, chartLogo, flat, listCaptions, expectFigureDrawn } from '@/lib/reportKit/testKit';
 *   const built = buildMyReport(args, { logo: chartLogo(), generatedAt: AT });
 *   const pdf = readPdf(built.doc, { ink: true });
 *   expect(pdf.pages).toBe(built.pages);
 *   expect(flat(pdf.text)).toMatch(/Net pay h 45 ft/);
 *   expect(listCaptions(pdf).map((c) => c.title)).toEqual(['Rate history', 'p/z plot']);
 *   for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f);
 *   expect(pointCounts(built.figures).rate[0]).toEqual({ Rate: screenSeries.length });
 *   pdf.close();
 *
 * Never import this from application code.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const tmp = (name) => path.join(os.tmpdir(), `report-kit-${process.pid}-${Date.now()}-${Math.round(Math.random() * 1e6)}-${name}`);

/** The Petrolord chart mark from public/, as lib/pdfBrand loadPetrolordLogo would hand it over. */
export function chartLogo() {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'petrolord-chart-watermark.png'));
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Whitespace collapsed, so a row of a table reads as one line of words. */
export const flat = (s) => String(s).replace(/\s+/g, ' ');

/**
 * Read a jsPDF document back: page count (pdfinfo), text (pdftotext
 * -layout, whole and per page), embedded images (pdfimages). With
 * `ink: true` the result also carries ink(page, box) and must be closed
 * with close() when the test is done.
 */
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

/**
 * The figure captions on the pages, in reading order: every line that
 * starts "Figure n. Title".
 * @returns {Array<{number: number, title: string, page: number}>}
 */
export function listCaptions(pdf) {
  const out = [];
  pdf.pageText.forEach((text, i) => {
    for (const line of text.split('\n')) {
      const m = /^\s*Figure (\d+)\.\s+(.*\S)\s*$/.exec(line);
      if (m) out.push({ number: Number(m[1]), title: m[2], page: i + 1 });
    }
  });
  return out;
}

/** Points drawn per series, per panel, by figure id: { loglog: [{ dp: 45, 'Model dp': 120 }] }. */
export const pointCounts = (figures) => Object.fromEntries((figures || []).map((f) => [f.id, f.panels.map((p) => p.drawn)]));

/**
 * Assert that a plotted figure is really on its page and is not a blank
 * frame: its caption line is on the page it reports, every panel drew
 * points, and there is ink inside each plot box (an empty frame with its
 * grid is a few hundred pixels at 60 dpi; data adds thousands). `pdf` must
 * come from readPdf(doc, { ink: true }). Throws with the reason; returns
 * the ink counts per panel.
 * @param {object} pdf
 * @param {{number: number, page: number, plotted: boolean, panels: Array}} figure
 * @param {{minPoints?: number, minColoured?: number, minDark?: number, logo?: boolean}} [o]
 *   `logo: true` also requires the embedded Petrolord mark in every panel
 */
export function expectFigureDrawn(pdf, figure, { minPoints = 2, minColoured = 1500, minDark = 150, logo = false } = {}) {
  const fail = (why) => { throw new Error(`Figure ${figure.number} (${figure.id}): ${why}`); };
  if (!pdf.ink) fail('read the PDF with readPdf(doc, { ink: true }) to check a figure');
  if (!figure.plotted || !figure.panels.length) fail('is a statement, with no plot to check');
  if (!listCaptions(pdf).some((c) => c.number === figure.number && c.page === figure.page)) fail(`no "Figure ${figure.number}." title on page ${figure.page}`);
  return figure.panels.map((p, i) => {
    if (!(p.total >= minPoints)) fail(`panel ${i + 1} drew ${p.total} points`);
    if (logo && !p.logo) fail(`panel ${i + 1} has no Petrolord mark`);
    const ink = pdf.ink(figure.page, p.box);
    if (!(ink.coloured >= minColoured && ink.dark >= minDark)) fail(`panel ${i + 1} looks blank: ${ink.coloured} coloured and ${ink.dark} dark pixels in its box`);
    return ink;
  });
}

/** Assert that a figure is the one-line "does not apply" statement and that the line is on the page. */
export function expectFigureStatement(pdf, figure, pattern) {
  if (figure.plotted) throw new Error(`Figure ${figure.number} (${figure.id}): is plotted, a statement was expected`);
  const page = flat(pdf.pageText[figure.page - 1] || '');
  if (!page.includes(`Figure ${figure.number}. `)) throw new Error(`Figure ${figure.number} (${figure.id}): title not on page ${figure.page}`);
  if (pattern && !(pattern instanceof RegExp ? pattern.test(page) : page.includes(pattern))) throw new Error(`Figure ${figure.number} (${figure.id}): statement not found on page ${figure.page}`);
}

// ---- golden output ----------------------------------------------------------

/** The document bytes with the two fields that change on every build blanked. */
export const stableBytes = (doc) => Buffer.from(doc.output('arraybuffer')).toString('latin1')
  .replace(/\/CreationDate \(D:[^)]*\)/g, '/CreationDate (D:0)')
  .replace(/\/ID \[ <[0-9A-Fa-f]+> <[0-9A-Fa-f]+> \]/g, '/ID [ <0> <0> ]');

/** SHA-256 of the document, creation date and file id aside. */
export const pdfSha256 = (doc) => crypto.createHash('sha256').update(stableBytes(doc), 'latin1').digest('hex');

const round = (v) => Number(Number(v).toFixed(4));

/** What a golden keeps of the figures: number, page, plotted, each panel's box and points per series. */
export const figureRecords = (figures) => (figures || []).map((f) => ({
  id: f.id,
  number: f.number,
  page: f.page,
  plotted: f.plotted,
  panels: f.panels.map((p) => ({
    box: { x: round(p.box.x), y: round(p.box.y), w: round(p.box.w), h: round(p.box.h) },
    drawn: p.drawn,
    total: p.total,
    bands: p.bands,
    logo: p.logo,
  })),
}));

/**
 * Hold a built report against its golden fixtures, <dir>/<name>.txt (the
 * pdftotext output) and <dir>/<name>.json (page count, figure records and
 * the SHA-256 of the document). The text is compared line for line. With
 * `update: true` the fixtures are (re)written first; a report test passes
 * `process.env.UPDATE_REPORT_GOLDENS === '1'`. Throws on the first
 * difference; returns what was compared.
 * @param {{doc: object, figures: Array, pages: number}} built
 */
export function checkGolden(built, { dir, name, update = false }) {
  const pdf = readPdf(built.doc);
  const meta = { pages: pdf.pages, sha256: pdfSha256(built.doc), figures: figureRecords(built.figures) };
  const textFile = path.join(dir, `${name}.txt`);
  const metaFile = path.join(dir, `${name}.json`);
  if (update) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(textFile, pdf.text);
    fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  }
  const goldenLines = fs.readFileSync(textFile, 'utf8').split('\n');
  const golden = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const lines = pdf.text.split('\n');
  const fail = (why) => { throw new Error(`Report golden "${name}": ${why}`); };
  for (let i = 0; i < Math.max(lines.length, goldenLines.length); i += 1) {
    if (lines[i] !== goldenLines[i]) fail(`line ${i + 1} differs\n  golden: ${JSON.stringify(goldenLines[i])}\n  now:    ${JSON.stringify(lines[i])}`);
  }
  if (built.pages !== pdf.pages) fail(`the builder reports ${built.pages} pages, the file has ${pdf.pages}`);
  if (meta.pages !== golden.pages) fail(`${meta.pages} pages, the golden has ${golden.pages}`);
  const a = JSON.stringify(meta.figures);
  const b = JSON.stringify(golden.figures);
  if (a !== b) fail(`the figures differ (number, page, plot box or points per series)\n  golden: ${b}\n  now:    ${a}`);
  if (meta.sha256 !== golden.sha256) fail(`the text, pages and figures match but the document bytes differ (sha256 ${meta.sha256}, golden ${golden.sha256}): something in the drawing changed`);
  return { pdf, meta, golden };
}
