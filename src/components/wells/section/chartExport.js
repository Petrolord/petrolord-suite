// Stratigraphy chart export with a reviewer header (AppUpgrade STRAT-U1-014,
// PL7, 2026-09-30). The Wheeler chart, the age-depth plot and the graphic
// column had no export at all; a reviewer could not sign anything. The chart
// SVG on screen is wrapped in a white page with a header band: what the chart
// is, the wells, the terminology and timescale that drew it, the depth basis,
// who prepared it, the date and the build. SVG keeps the vector; PNG draws the
// same page at 2x and adds the Petrolord watermark (house chart standard).
// Pure string building except the two browser helpers at the end.

import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { CHART_LOGO_PATH } from '@/utils/chartTheme';

const HEADER_LINE_H = 16;
const HEADER_PAD = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The header lines of a stratigraphy chart export.
 * @param {{ title: string, wells?: string[], scheme?: string, timescale?: string, basis?: string, section?: ?string, field?: ?string, analyst?: ?string, date?: Date }} h
 * @returns {string[]}
 */
export function chartHeaderLines({ title, wells = [], scheme = null, timescale = null, basis = null, section = null, field = null, analyst = null, date = new Date() }) {
  const l2 = [
    `Wells: ${wells.length ? wells.join(', ') : EMPTY_VALUE}`,
    section ? `Section: ${section}` : null,
    `Field: ${field || EMPTY_VALUE}`,
  ].filter(Boolean).join(' | ');
  const l3 = [
    scheme ? `Terms: ${scheme === 'exxon' ? 'Exxon (display; stored Catuneanu)' : 'Catuneanu'}` : null,
    timescale ? `Timescale: ICS ${timescale}` : null,
    basis ? `Depths: ${basis}` : null,
  ].filter(Boolean).join(' | ');
  const l4 = `Prepared by: ${analyst || EMPTY_VALUE} | ${date.toISOString().slice(0, 10)} | ${buildLabel()}`;
  return [title, l2, l3, l4].filter(Boolean);
}

/**
 * The chart SVG (outerHTML of the on-screen <svg>) on a white page under the
 * header band. Returns the SVG document text and its size.
 * @param {string} chartSvg the <svg ...>...</svg> markup
 * @param {{width: number, height: number}} size the chart's own size
 * @param {string[]} lines header lines (first is the title)
 */
export function svgWithHeader(chartSvg, { width, height }, lines) {
  const headH = HEADER_PAD * 2 + lines.length * HEADER_LINE_H;
  const W = Math.max(width, 480); const H = headH + height;
  const text = lines.map((t, i) => `<text x="${HEADER_PAD}" y="${HEADER_PAD + (i + 1) * HEADER_LINE_H - 4}" font-family="sans-serif" font-size="${i === 0 ? 13 : 11}" ${i === 0 ? 'font-weight="bold" ' : ''}fill="${i === 0 ? '#0f172a' : '#334155'}" data-header-line="${i}">${esc(t)}</text>`).join('');
  // the chart keeps its own coordinates, moved under the header
  const inner = chartSvg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return {
    width: W,
    height: H,
    text: `<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
      + `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>${text}`
      + `<line x1="0" y1="${headH - 1}" x2="${W}" y2="${headH - 1}" stroke="#cbd5e1"/>`
      + `<g transform="translate(0 ${headH})">${inner}</g></svg>`,
  };
}

/** Save the page as .svg. */
export function downloadSvg(doc, fileName) {
  downloadBlobFile(new Blob([doc.text], { type: 'image/svg+xml' }), fileName);
}

/** Draw the page at 2x on a canvas, add the watermark bottom right, save as .png. */
export async function downloadPng(doc, fileName) {
  const scale = 2;
  const img = await loadImage(URL.createObjectURL(new Blob([doc.text], { type: 'image/svg+xml' })));
  const canvas = document.createElement('canvas');
  canvas.width = doc.width * scale; canvas.height = doc.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    const logo = await loadImage(CHART_LOGO_PATH);
    const h = 28 * scale; const w = (logo.width / logo.height) * h;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(logo, canvas.width - w - 8 * scale, canvas.height - h - 8 * scale, w, h);
    ctx.globalAlpha = 1;
  } catch { /* the watermark is decoration; the chart and header are the record */ }
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  downloadBlobFile(blob, fileName);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The chart image could not be drawn.'));
    img.src = src;
  });
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
