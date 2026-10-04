// VRR-U2-004: the bubble map. Coordinates come from the wells registry
// (geo_wells) through an explicit match table the user confirms (owner
// default); nothing is placed by guess. The values are the engine's
// voidage by well (buildWellVoidage); the report draws the map as a figure
// and prints the table behind it.
import {
  proposeWellMatches, draftMatches, confirmWellMatches, buildBubbleMap, registryChanges, looseWellKey,
} from '../wellMap';
import { deriveVrr } from '../workspace';
import { buildWellVoidage } from '@/utils/vrrCalculations';
import { sampleWells, pdfOf } from './vrrTestKit';
import { readPdf, flat, listCaptions, expectFigureDrawn, pointCounts, expectFigureStatement } from '@/lib/reportKit/testKit';

export const REGISTRY = [
  { id: 'g1', name: 'P-1', uwi: 'NG-0001', surface_x: 500000, surface_y: 120000, crs: 'EPSG:26332', xy_unit: 'm' },
  { id: 'g2', name: 'P2', uwi: 'NG-0002', surface_x: 501200, surface_y: 120400, crs: 'EPSG:26332', xy_unit: 'm' },
  { id: 'g3', name: 'Injector 1', uwi: 'I-1', surface_x: 500600, surface_y: 119500, crs: 'EPSG:26332', xy_unit: 'm' },
  { id: 'g4', name: 'X-9', uwi: null, surface_x: 499000, surface_y: 118000, crs: 'EPSG:26332', xy_unit: 'm' },
];
const LEDGER_WELLS = ['I-1', 'I-2', 'P-1', 'P-2'];

describe('VRR-U2-004: the match table', () => {
  it('proposes by name, then UWI, then letters and digits; leaves the rest unmatched', () => {
    const p = proposeWellMatches(LEDGER_WELLS, REGISTRY);
    expect(p.map((x) => [x.well, x.wellId, x.how])).toEqual([
      ['I-1', 'g3', 'uwi'], ['I-2', null, null], ['P-1', 'g1', 'name'], ['P-2', 'g2', 'letters and digits'],
    ]);
    expect(p[3].note).toMatch(/check it is the same well/);
    expect(looseWellKey(' P - 2 ')).toBe('p2');
  });
  it('two registry wells that could be one ledger well: no proposal, both named', () => {
    const p = proposeWellMatches(['P1'], [...REGISTRY, { id: 'g5', name: 'P_1', surface_x: 1, surface_y: 1 }]);
    expect(p[0].wellId).toBeNull();
    expect(p[0].note).toMatch(/2 registry wells could be this one \(P-1, P_1\)/);
  });
  it('NEGATIVE CONTROL: proposals place nothing until the table is confirmed', () => {
    const inputs = sampleWells();
    const d = deriveVrr(inputs);
    const draft = { matches: draftMatches(proposeWellMatches(LEDGER_WELLS, REGISTRY)), confirmedAt: null };
    const m = buildBubbleMap(d, draft);
    expect(m.ok).toBe(false);
    expect(m.points).toEqual([]);
    expect(m.refusal).toMatch(/not confirmed/);
  });
  it('confirmed: each placed well carries the engine value at the registry coordinates; the unmatched one is listed', () => {
    const inputs = sampleWells();
    const d = deriveVrr(inputs);
    const { wellMap } = confirmWellMatches(draftMatches(proposeWellMatches(LEDGER_WELLS, REGISTRY)), REGISTRY, { at: '2026-10-04T10:00:00Z' });
    const m = buildBubbleMap(d, wellMap);
    expect(m.ok).toBe(true);
    const w = buildWellVoidage(inputs.wellRows, inputs.fvf);
    const engine = Object.fromEntries(w.wells.map((x) => [x.well, x.type === 'injector' ? x.injectedRB : x.producedRB]));
    expect(m.points.map((p) => [p.well, p.x, p.y])).toEqual([['I-1', 500600, 119500], ['P-1', 500000, 120000], ['P-2', 501200, 120400]]);
    m.points.forEach((p) => expect(p.value).toBeCloseTo(engine[p.well], 9));
    expect(m.unplaced).toEqual([{ well: 'I-2', type: 'injector', value: expect.closeTo(engine['I-2'], 9), reason: 'Not matched to a registry well' }]);
    expect(m.crs).toBe('EPSG:26332');
  });
  it('wells in two coordinate systems: no map, the reason named', () => {
    const reg2 = REGISTRY.map((w) => (w.id === 'g2' ? { ...w, crs: 'EPSG:32632' } : w));
    const { wellMap } = confirmWellMatches(draftMatches(proposeWellMatches(LEDGER_WELLS, reg2)), reg2);
    const m = buildBubbleMap(deriveVrr(sampleWells()), wellMap);
    expect(m.ok).toBe(false);
    expect(m.refusal).toMatch(/different coordinate systems \(EPSG:26332, EPSG:32632/);
  });
  it('a pattern sits at the centre of its placed producers with its cumulative VRR', () => {
    const inputs = { ...sampleWells(), patterns: [{ id: 'a', name: 'North', producers: ['P-1', 'P-2'] }], allocation: { 'I-1': { 'P-1': '0.5', 'P-2': '0.5' }, 'I-2': { 'P-1': '1' } } };
    const d = deriveVrr(inputs);
    const { wellMap } = confirmWellMatches(draftMatches(proposeWellMatches(LEDGER_WELLS, REGISTRY)), REGISTRY);
    const m = buildBubbleMap(d, wellMap);
    expect(m.patterns[0]).toMatchObject({ name: 'North', placed: true, x: 500600, y: 120200 });
    expect(m.patterns[0].cumulativeVRR).toBeCloseTo(d.patternAnalyses[0].summary.cumulativeVRR, 12);
  });
  it('the snapshot holds; a registry edit since is named', () => {
    const { wellMap } = confirmWellMatches(draftMatches(proposeWellMatches(LEDGER_WELLS, REGISTRY)), REGISTRY);
    const moved = REGISTRY.map((w) => (w.id === 'g1' ? { ...w, surface_x: 500050 } : w));
    expect(buildBubbleMap(deriveVrr(sampleWells()), wellMap).points.find((p) => p.well === 'P-1').x).toBe(500000);
    expect(registryChanges(wellMap, moved)).toEqual([{ well: 'P-1', text: 'P-1: "P-1" moved in the registry since the table was confirmed.' }]);
    expect(registryChanges(wellMap, REGISTRY.filter((w) => w.id !== 'g3'))[0].text).toMatch(/no longer readable/);
  });
});

describe('VRR-U2-004: the map in the report', () => {
  const mapped = () => {
    const base = sampleWells();
    const { wellMap } = confirmWellMatches(draftMatches(proposeWellMatches(LEDGER_WELLS, REGISTRY)), REGISTRY, { at: '2026-10-04T10:00:00Z' });
    return { ...base, wellMap };
  };
  it('a figure drawn from the map points (white plot, the mark), and the table behind it', () => {
    const inputs = mapped();
    const { built, args } = pdfOf(inputs);
    const pdf = readPdf(built.doc, { ink: true });
    const fig = built.figures.find((f) => f.id === 'map');
    expect(fig.plotted).toBe(true);
    expectFigureDrawn(pdf, fig, { logo: true });
    const counts = pointCounts(built.figures).map[0];
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    expect(total).toBe(3);
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Voidage by well on the well locations');
    const t = flat(pdf.text);
    expect(t).toMatch(/Voidage by well/);
    expect(t).toMatch(/P-1 producer P-1 500,000 120,000 41,895/);
    expect(t).toMatch(/I-2 injector not on the map/);
    expect(t).toMatch(/Coordinates from the wells registry \(EPSG:26332, m\), match table confirmed 2026-10-04/);
    expect(args.model.wellTable.rows).toHaveLength(4);
    pdf.close?.();
  });
  it('without a confirmed table the figure says why', () => {
    const { built } = pdfOf(sampleWells());
    const pdf = readPdf(built.doc);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'map'), 'Not plotted: The match table between the ledger wells and the wells registry is not confirmed');
    pdf.close?.();
  });
});
