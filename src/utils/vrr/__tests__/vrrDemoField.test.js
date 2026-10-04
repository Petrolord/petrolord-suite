// VRR-U2-005: the 24-month demo field, a second sample beside the template
// (owner default: the template stays the engine fixture the T1 test pins).
// Its volumes follow the rule in demoField.js; the gates call the engine.
import { demoFieldInputs, demoFieldRows, DEMO_LOCATIONS, DEMO_NOTE } from '../demoField';
import { deriveVrr } from '../workspace';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import { buildFieldPeriods, computeVRRSeries, buildWellVoidage } from '@/utils/vrrCalculations';
import { confirmWellMatches, draftMatches, proposeWellMatches } from '../wellMap';
import { pdfOf, sampleWells } from './vrrTestKit';
import { readPdf, flat, expectFigureDrawn } from '@/lib/reportKit/testKit';

export const demoRegistry = () => DEMO_LOCATIONS.map(([name, x, y], i) => ({ id: `dw-${i}`, name, uwi: null, surface_x: x, surface_y: y, crs: 'EPSG:26332', xy_unit: 'm' }));
export const demoInputs = ({ mapped = true } = {}) => {
  const inputs = { ...defaultInputs(), ...demoFieldInputs() };
  if (!mapped) return inputs;
  const reg = demoRegistry();
  const wells = [...new Set(inputs.wellRows.map((r) => r.well))];
  return { ...inputs, wellMap: confirmWellMatches(draftMatches(proposeWellMatches(wells, reg)), reg, { at: '2026-10-04T10:00:00Z' }).wellMap };
};

describe('VRR-U2-005: the demo field', () => {
  const inputs = demoInputs();
  const d = deriveVrr(inputs);
  it('24 months, 6 producers, 3 water injectors, 1 gas injector, quarterly surveys, two patterns', () => {
    expect(d.series.map((s) => s.label)).toHaveLength(24);
    expect(d.series[0].label).toBe('2024-01');
    expect(d.series[23].label).toBe('2025-12');
    expect(d.ledgerWells.producers).toHaveLength(6);
    expect([...d.ledgerWells.injectors].sort()).toEqual(['GI-1', 'WI-1', 'WI-2', 'WI-3']);
    expect(inputs.pressureSurveys).toHaveLength(9);
    expect(d.patternAnalyses.every((a) => !a.withheld)).toBe(true);
  });
  it('the volumes follow the stated rule', () => {
    const rows = demoFieldRows();
    expect(rows.find((r) => r.well === 'DP-1' && r.date === '2024-01').oil_stb).toBe(55800); // 1,800 BOPD x 31
    expect(rows.find((r) => r.well === 'GI-1' && r.date === '2024-09').ginj_mscf).toBe(60000); // 2,000 Mscf/d x 30
    expect(rows.find((r) => r.well === 'DP-5' && r.date === '2024-02').gas_mscf).toBe(Math.round(900 * Math.exp(-0.025) * 480 * 29 / 1000));
    expect(rows.some((r) => r.date === '2024-01' && r.well.startsWith('WI'))).toBe(false);
  });
  it('it shows free gas, gas injection, and a per-well free gas above the field figure', () => {
    expect(d.ledger.totals.freeGasRB).toBeGreaterThan(0);
    expect(d.ledger.totals.injGasRB).toBeGreaterThan(0);
    expect(d.wellVoidage.totals.freeGasRBByWell).toBeGreaterThan(d.ledger.totals.freeGasRB);
  });
  it('the numbers, through the engine: cumulative VRR 0.7793, the ledger closes', () => {
    const s = computeVRRSeries(buildFieldPeriods(inputs.wellRows), inputs.fvf);
    expect(d.summary.cumulativeVRR).toBeCloseTo(s[s.length - 1].cumulativeVRR, 12);
    expect(d.summary.cumulativeVRR).toBeCloseTo(0.779269, 6);
    expect(d.ledger.closure).toBeLessThan(1e-12);
    expect(buildWellVoidage(inputs.wellRows, inputs.fvf).totals.cumulativeVRRByWell).toBeCloseTo(d.wellVoidage.totals.cumulativeVRRByWell, 12);
  });
  it('the template stays the T1 oracle (62,865 RB, 59,460 RB, 0.9458)', () => {
    const t = deriveVrr(sampleWells());
    expect(t.ledger.totals.producedRB).toBeCloseTo(62865, 6);
    expect(t.ledger.totals.injectedRB).toBeCloseTo(59460, 6);
  });
  it('the report draws all seven figures, the map included, and names the sample', () => {
    const { built } = pdfOf(inputs);
    const pdf = readPdf(built.doc, { ink: true });
    for (const f of built.figures.filter((x) => x.id !== 'fvf')) {
      expect(f.plotted).toBe(true);
      expectFigureDrawn(pdf, f, { logo: true });
    }
    const t = flat(pdf.text);
    expect(t).toContain(DEMO_NOTE.slice(0, 60));
    expect(t).toMatch(/Free gas floored well by well/);
    expect(built.pages).toBeGreaterThanOrEqual(8);
    pdf.close?.();
  });
});
