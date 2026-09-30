/**
 * AppUpgrade PETRO-U2 (PL7): the PDF read back through pdftotext, the tool a
 * reviewer's machine would use, not our own text-operator scrape.
 *
 * U2-003: a log plot (CPI) page per zone with the header block, the zone's
 * own row and the track picture (pdfimages lists it on that page).
 * Negative control (run 2026-09-29): with the cpi argument dropped the
 * "Log plot (CPI)" assertions and the image count fail.
 *
 * U2-005: the cutoff sensitivity table is in the report with the current
 * cutoff marked and the numbers of the zone card.
 * Negative control (run 2026-09-29): with the sensitivities argument dropped
 * from buildReport the "Cutoff sensitivity" assertions fail.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReports } from '../services/zoneAverages';
import { zoneSensitivities } from '../services/cutoffSensitivity';
import { buildReport } from '../services/petroReport';
import { cpiWindow, cpiImages, CPI_PAD_MIN_M } from '../services/cpiPages';
import zlib from 'zlib';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null }));

/** Write the jsPDF doc to disk and read it back with poppler's pdftotext. */
export function pdftotext(doc) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'petro-pdf-')), 'report.pdf');
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

const curvesOf = () => {
  const c = {};
  for (const [k, v] of Object.entries(typewell.curves)) c[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  return c;
};

test('U2-005: the cutoff sensitivity table reaches the PDF with the current cutoff marked', async () => {
  const curves = curvesOf();
  const [top, base] = typewell.params.zones.SAND_A;
  const zones = [{ id: 'zA', name: 'SAND A', top_md_m: top, base_md_m: base }];
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, []);
  const summaries = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones });
  const sensitivities = zoneSensitivities({ curves, outputs, params: DEFAULT_PARAMS, zones });
  const doc = await buildReport({
    wellName: 'TYPE-1', wellData: { curves, inventory: [] }, params: DEFAULT_PARAMS, zones, summaries,
    projectId: 'p', sensitivities, generatedAt: new Date('2026-09-29T10:00:00Z'),
  });
  const text = pdftotext(doc);
  expect(text).toContain('Cutoff sensitivity');
  expect(text).toContain('SPE 84387');
  expect(text).toMatch(/Porosity cutoff \(phie >=\)/);
  // the current porosity cutoff, marked, with the card's net pay beside it
  expect(text).toContain(`*0.08: ${Number(summaries.zA.net_m.toFixed(2))}`);
  expect(text).toMatch(/\*0\.5: /);
  expect(text).toMatch(/\*0\.6: /);
});

/** A real w x h RGB PNG (solid colour), so jsPDF embeds an image pdfimages can list. */
function solidPng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 37; raw[o + 1] = 99; raw[o + 2] = 235; }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

describe('U2-003: log plot (CPI) page per zone', () => {
  test('the window pads each zone and stays inside the log', () => {
    const depth = Float64Array.from({ length: 201 }, (_, i) => 2000 + i * 0.5); // 2000..2100
    expect(cpiWindow({ top_md_m: 2010, base_md_m: 2030 }, depth)).toEqual({ top: 2010 - CPI_PAD_MIN_M, base: 2030 + CPI_PAD_MIN_M });
    expect(cpiWindow({ top_md_m: 2020, base_md_m: 2080 }, depth)).toEqual({ top: 2014, base: 2086 });
    expect(cpiWindow({ top_md_m: 2001, base_md_m: 2099 }, depth)).toEqual({ top: 2000, base: 2100 });
    expect(cpiWindow({ top_md_m: 2200, base_md_m: 2300 }, depth)).toBeNull();
    const calls = [];
    const r = cpiImages([{ id: 'a', name: 'A', top_md_m: 2010, base_md_m: 2030 }, { id: 'b', name: 'B', top_md_m: 2200, base_md_m: 2300 }], depth,
      (win) => { calls.push(win); return { toDataURL: () => 'data:image/png;base64,xx' }; });
    expect(r.pages).toHaveLength(1);
    expect(r.skipped).toEqual(['B']);
    expect(calls[0]).toMatchObject({ top: 2007, base: 2033, width: 760, height: 1000, scale: 2 });
  });

  test('pdftotext and pdfimages read the page: title, header, the zone row, the picture', async () => {
    const curves = curvesOf();
    const [top, base] = typewell.params.zones.SAND_A;
    const zones = [{ id: 'zA', name: 'SAND A', top_md_m: top, base_md_m: base }];
    const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, []);
    const summaries = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones });
    const win = cpiWindow(zones[0], curves.DEPT);
    const cpi = { pages: [{ zoneId: 'zA', ...win, dataUrl: solidPng(38, 50), width: 760, height: 1000 }], skipped: [] };
    const doc = await buildReport({
      wellName: 'KETA TYPE-1', well: { uwi: 'NG-KETA-0001', kb_m: 30 }, wellData: { curves, inventory: [] }, params: DEFAULT_PARAMS, zones, summaries,
      projectId: 'p', projectName: 'Base case', header: { company: 'Lordsway Energy', field: 'Keta', analyst: 'A. Analyst' }, cpi,
      generatedAt: new Date('2026-09-29T10:00:00Z'),
    });
    const text = pdftotext(doc);
    const pages = text.split('\f');
    const cpiPage = pages.find((p) => p.includes('Log plot (CPI): SAND A'));
    expect(cpiPage).toBeTruthy();
    for (const s of ['Lordsway Energy', 'Keta', 'NG-KETA-0001', 'A. Analyst', 'Base case', 'Net pay (m)', 'HCPV (m)']) expect(cpiPage).toContain(s);
    expect(cpiPage).toContain(String(Number(summaries.zA.net_m.toFixed(2))));
    expect(cpiPage).toContain(`window ${Number(win.top.toFixed(1))} to ${Number(win.base.toFixed(1))} m MD`);
    // the picture sits on the CPI page (pdfimages -list: page column)
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'petro-pdf-')), 'r.pdf');
    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    const list = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean);
    const cpiPageNo = pages.indexOf(cpiPage) + 1;
    expect(list.some((l) => Number(l.trim().split(/\s+/)[0]) === cpiPageNo && /\b38\s+50\b/.test(l))).toBe(true);
  });

  test('asked for but unavailable: the report says why instead of silently omitting it', async () => {
    const curves = { DEPT: Float64Array.from([2000, 2000.5]) };
    const doc = await buildReport({
      wellName: 'W', wellData: { curves, inventory: [] }, params: DEFAULT_PARAMS, zones: [], summaries: {}, projectId: null,
      cpi: { pages: [], skipped: [], reason: 'the Tracks view was not open; open Tracks or Split and export again' },
    });
    expect(pdftotext(doc)).toMatch(/Log plot pages: not included \(the Tracks view was not open/);
  });
});
