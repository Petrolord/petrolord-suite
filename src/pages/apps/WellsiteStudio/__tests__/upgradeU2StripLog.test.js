/**
 * @jest-environment node
 *
 * Wellsite Studio upgrade U2-001 (2026-10-01): the composite (strip) log.
 * The model is built by the shipped builder from the synthetic report day
 * of the engines repo (descriptions, shows, gas, bit depths) plus tops, a
 * casing shoe and an imported gas curve; the PDF is produced by the shipped
 * exporter with the real jsPDF and read back with pdftotext (PL7).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import g from '../../../../../packages/engines/test-data/wellsite/report-day.json';
import { buildStripLog, lithologyIntervals, gasSeries, ropFromBits, depthWindow } from '../services/stripLog';
import { buildStripLogPdf, pdfLayout } from '../services/stripLogPdf';
import { chromatographParams } from '../services/gas';
import { SEED_RIG_CONFIG } from '../services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: (doc, o) => { doc.setFontSize(9); doc.text(`Petrolord Suite - ${o.appTitle}`, 10, 12); doc.text(o.subtitle, 10, 20); doc.text(o.rightLines[1], 150, 16); return 30; }, loadPetrolordLogo: async () => null, fitText: (d, t) => t }));

const FT = 0.3048;
const recs = g.data.records;
const by = (s) => recs.filter((r) => r.subtype === s);
const descriptions = by('cuttings_description');
const shows = by('show');
const bitDepths = by('bit_depth').sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
const chroma = { id: 'gc1', kind: 'observation', subtype: 'gas_chromatograph', md_calc_m: 3070, occurred_at: '2026-09-07T09:30:00Z', payload: chromatographParams({ components: { c1: 52000, c2: 4100, c3: 1900, ic4: 310, nc4: 520, ic5: 150, nc5: 210 }, unit: 'ppm' }).payload };
const unitsGas = { id: 'tgu', kind: 'observation', subtype: 'total_gas', md_calc_m: 3065, occurred_at: '2026-09-07T09:20:00Z', payload: { value: 40, unit: 'units' } };
const observations = [...by('total_gas'), ...by('connection_gas'), chroma, unitsGas];
const topsBoard = { rows: [
  { key: 'top_agbada', name: 'Top Agbada', call: { md_calc_m: 3090, status: 'confirmed' }, prognosis: { md_m: 3100 } },
  { key: 'top_akata', name: 'Top Akata', call: null, prognosis: { md_m: 3125 } },
  { key: 'old', name: 'Withdrawn top', call: { md_calc_m: 3080, status: 'withdrawn' }, prognosis: null },
] };
const mudlog = { points: [3050, 3060, 3070, 3080, 3090, 3100].map((md, i) => ({ mdM: md, values: { total_gas: 0.3 + 0.1 * i, c1: 2000 + 500 * i } })) };
const well = { ...g.well, header: { ...g.well.header, kb_elev_m: 25 } };
const model = (unit = 'ft') => buildStripLog({ well, unit, mudlog, bitDepths, events: [], descriptions, shows, observations, topsBoard, rigConfig: { ...SEED_RIG_CONFIG, hole_sections: [{ ...SEED_RIG_CONFIG.hole_sections[0], to_md_m: 3055, description: '13.375 in casing' }, SEED_RIG_CONFIG.hole_sections[1]] }, dxc: null });

const pdfText = (doc) => {
  const f = path.join(os.tmpdir(), `ws-u2-strip-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try { return { text: execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }), pages: Number(execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1]) }; } finally { fs.unlinkSync(f); }
};

describe('the model: tracks from the record', () => {
  const m = model('ft');
  test('the tracks, in the order a mud log reads: depth, ROP, lithology, gas, descriptions', () => {
    expect(m.tracks.map((t) => t.id)).toEqual(['depth', 'rop', 'lith', 'gas', 'gasunits', 'tops', 'desc']);
    expect(m.win.topM).toBeLessThan(3048);
    expect(m.win.baseM).toBeGreaterThan(3100);
  });
  test('ROP comes from the bit depths over drilling time when no curve was imported, and the log says so', () => {
    const rop = m.tracks.find((t) => t.id === 'rop');
    expect(rop.series[0].label).toBe('bit depths');
    expect(rop.unit).toBe('ft/hr');
    const pts = ropFromBits(bitDepths);
    expect(pts.length).toBeGreaterThan(0);
    // each segment: depth made over hours between two records
    const a = bitDepths[0]; const b = bitDepths[1];
    expect(pts[0].v).toBeCloseTo((b.md_calc_m - a.md_calc_m) / ((Date.parse(b.occurred_at) - Date.parse(a.occurred_at)) / 3600000), 9);
    expect(m.notes.join(' ')).toMatch(/ROP is taken from the recorded bit depths/);
    // with an imported curve the curve wins and the note goes
    const withRop = buildStripLog({ well, unit: 'm', mudlog: { points: [{ mdM: 3050, values: { rop: 20 } }, { mdM: 3060, values: { rop: 25 } }] }, bitDepths, descriptions: [], shows: [], observations: [], topsBoard: null, rigConfig: null, dxc: null });
    expect(withRop.tracks.find((t) => t.id === 'rop').series[0]).toMatchObject({ label: 'imported', points: [{ mdM: 3050, v: 20 }, { mdM: 3060, v: 25 }] });
    expect(withRop.notes).toEqual([]);
  });
  test('the lithology column carries each description as its percentages in the Suite lithology colours', () => {
    const liths = lithologyIntervals(descriptions);
    expect(liths[0]).toMatchObject({ topM: 3048, code: 'sandstone', label: 'Sandstone 70%, Shale 30%' });
    expect(liths[0].parts.map((p) => [p.code, p.fraction, p.color])).toEqual([['sandstone', 0.7, '#f4d03f'], ['shale', 0.3, expect.stringMatching(/^#/)]]);
    expect(m.legend.map((l) => l.name)).toEqual(expect.arrayContaining(['Sandstone', 'Shale']));
    // an interval with no base, or upside down, is left out
    expect(lithologyIntervals([{ id: 'x', md_calc_m: 10, md2_calc_m: 5, payload: { components: [] } }])).toEqual([]);
  });
  test('gas is drawn in ppm on a log scale: percent times 10,000, chromatograph components, imported curves; units stay apart', () => {
    const s = gasSeries({ observations, points: mudlog.points });
    const typed = by('total_gas')[0];
    expect(s.total).toEqual(expect.arrayContaining([{ mdM: typed.md_calc_m, v: typed.payload.unit === '%' ? typed.payload.value * 10000 : typed.payload.value }]));
    expect(s.total).toEqual(expect.arrayContaining([{ mdM: 3050, v: 3000 }]));
    expect(s.c1).toEqual(expect.arrayContaining([{ mdM: 3070, v: 52000 }, { mdM: 3050, v: 2000 }]));
    expect(s.c4).toEqual([{ mdM: 3070, v: 830 }]);
    expect(s.units).toEqual([{ mdM: 3065, v: 40 }]);
    const gas = m.tracks.find((t) => t.id === 'gas');
    expect(gas.scale.log).toBe(true);
    expect(gas.series.map((x) => x.id)).toEqual(['total', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(m.notes.join(' ')).toMatch(/chromatograph units is drawn on its own track/);
  });
  test('tops as called are solid, the prognosis dashed, the casing shoe marked; a withdrawn call is not drawn', () => {
    expect(m.markers.map((x) => [x.id, x.kind, !!x.dashed])).toEqual([['shoe-3055', 'casing', false], ['call-top_agbada', 'top', false], ['prog-top_agbada', 'prognosis', true], ['prog-top_akata', 'prognosis', true]]);
    expect(m.markers[1].label).toBe('Top Agbada (confirmed)');
  });
  test('descriptions and shows sit at their depths as text', () => {
    const d = m.tracks.find((t) => t.id === 'desc');
    expect(d.items[0].text).toBe("70% SST: lt gy, f-m gr; 30% SH: dk gy, fis");
    expect(d.items.some((i) => /^SHOW /.test(i.text))).toBe(true);
    expect(d.items.map((i) => i.mdM)).toEqual([...d.items.map((i) => i.mdM)].sort((a, b) => a - b));
  });
  test('nothing recorded: no window and no tracks, never an empty chart', () => {
    expect(buildStripLog({ well, unit: 'm', mudlog: { points: [] } })).toMatchObject({ win: null, tracks: [] });
    expect(depthWindow({ points: [], bitMdM: 3000 })).toEqual({ topM: 2900, baseM: 3010 });
  });
});

describe('the PDF read back (PL7)', () => {
  const reviewer = { kbElevM: 25, preparedBy: 'R. Rigsite', build: 'Petrolord Suite 4.0.0 (abc1234), Wellsite Studio' };
  test('fitted to one page: identity lines, depth reference, KB, scale, track titles, tops, a description, depth labels', async () => {
    const m = model('ft');
    const { text, pages } = pdfText(await buildStripLogPdf(m, { well, unit: 'ft', toDisplay: (x) => x / FT, scale: 'fit', reviewer, logo: null }));
    expect(pages).toBe(1);
    expect(text).toMatch(/Strip log, KETA-2/);
    expect(text).toMatch(/Well KETA-2; field Keta; operator Petrolord E&P; rig Rig 12\./);
    expect(text).toMatch(/Depths in ft, measured depth \(MD\) below KB, increasing downward; KB 82\.0 ft above MSL\./);
    expect(text).toMatch(/Prepared by R\. Rigsite; Petrolord Suite 4\.0\.0 \(abc1234\), Wellsite Studio\./);
    expect(text).toMatch(/Interval \d+ to \d+ ft MD; this page \d+ to \d+ ft; vertical scale 1:\d+ \(fitted to one page\)\./);
    for (const title of ['Depth', 'ROP', 'Lithology', 'Gas', 'Tops and casing', 'Descriptions and shows']) expect(text).toContain(title);
    expect(text).toMatch(/ppm, log scale/);
    expect(text).toMatch(/Top Agbada \(confirmed\) 10138 ft/);
    expect(text).toMatch(/Top Agbada prognosis 10171 ft/);
    expect(text).toMatch(/13\.375 in casing shoe 10023 ft/);
    expect(text).toMatch(/Sandstone/);
    expect(text).toMatch(/Shale/);
    expect(text).toMatch(/SHOW /);
    expect(text).toMatch(/10100/); // a depth label
    expect(text).not.toMatch(/Withdrawn top/);
    expect(text).not.toMatch(/[^\x00-\xff]/);
  });
  test('at 1:200 in metres the interval runs over several pages, each with the header and its own depths', async () => {
    const m = model('m');
    const doc = await buildStripLogPdf(m, { well, unit: 'm', toDisplay: (x) => x, scale: '200', reviewer, logo: null });
    const { text, pages } = pdfText(doc);
    const lay = pdfLayout({ topM: m.win.topM, baseM: m.win.baseM, scale: '200', bodyMm: 200 });
    expect(lay.mmPerM).toBe(5);
    expect(pages).toBeGreaterThan(1);
    expect(text).toMatch(new RegExp(`Page 1 of ${pages}`));
    expect(text).toMatch(new RegExp(`Page ${pages} of ${pages}`));
    expect(text.match(/vertical scale 1:200\./g)).toHaveLength(pages);
    expect(text).toMatch(/KB 25\.0 m above MSL/);
    expect(text).toMatch(/Top Agbada \(confirmed\) 3090 m/);
  });
  test('the page layout: 1:500 is 2 mm per metre; a window too long for the scale is refused with what to do', () => {
    expect(pdfLayout({ topM: 3000, baseM: 3100, scale: '500', bodyMm: 200 })).toMatchObject({ n: 500, mmPerM: 2, mPerPage: 100, pages: 1, fitted: false });
    expect(pdfLayout({ topM: 3000, baseM: 3250, scale: '500', bodyMm: 200 }).pages).toBe(3);
    expect(pdfLayout({ topM: 0, baseM: 3000, scale: 'fit', bodyMm: 200 })).toMatchObject({ n: 15000, pages: 1, fitted: true });
    expect(() => pdfLayout({ topM: 0, baseM: 4000, scale: '200', bodyMm: 200 })).toThrow(/needs 100 pages\. Choose a smaller scale or a shorter depth window/);
    expect(() => pdfLayout({ topM: 10, baseM: 10, scale: 'fit', bodyMm: 200 })).toThrow('base below its top');
  });
  test('nothing to draw is refused, never an empty PDF', async () => {
    await expect(buildStripLogPdf({ win: null, tracks: [] }, { well })).rejects.toThrow('There is nothing to draw yet.');
  });
});
