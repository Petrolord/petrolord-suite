/**
 * FLUID-U2-003: PVTO, PVDG and PVTW keywords for the simulator.
 *
 * Three readers:
 *   - the Simulation Studio deck builder: for the same fluid the exported
 *     PVTO and PVDG blocks are the builder's own blocks, character for
 *     character (both go through the same emitters on the same rows);
 *   - the keyword reader of this module: the export read back gives the
 *     table rows in deck units;
 *   - the simulator: the worker gate runs FLUID_EXPORT.DATA, the builder's
 *     fixture deck with its three PVT keywords replaced by this export,
 *     through OPM Flow (worker/sim-worker/tests/integration/test_fluid_export_deck.py).
 *     The fixture is regenerated here: GEN_SIM_FIXTURE=1 npx jest <this file>.
 */
import fs from 'fs';
import path from 'path';
import { defaultBuilderForm, buildPvtFromFluid, buildDeckFromForm } from '@/utils/simDeckBuilder';
import { emitPVTO, emitPVDG } from '@/utils/simDeckGeneration';
import { bwAt, muWaterAt } from '@/utils/fluidStudioCalculations';
import { buildSimKeywords, readSimKeywords, simRowsFromContract, relativeSlopeAt } from '@/utils/fluidstudio/simKeywords';
import { sampleWorkspace, goodOilBlackOil, matched, eosWithLab, run } from './fluidTestKit';

const FIXTURE = path.join(process.cwd(), 'worker', 'sim-worker', 'tests', 'integration', 'fixtures', 'generated', 'FLUID_EXPORT.DATA');

/** The Fluid Systems Studio project that holds the deck builder's default fluid. */
function builderFluid() {
  const f = defaultBuilderForm().fluid;
  const inputs = sampleWorkspace();
  inputs.streamA.blackOil = { api: Number(f.api), gor: Number(f.gor), gasSg: Number(f.gasSg), temp: Number(f.tempF), pb: null, salinity: Number(f.salinityPpm) };
  inputs.correlations = { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' };
  return inputs;
}

describe('the export is the deck builder\'s own blocks for the same fluid', () => {
  const ws = run(builderFluid(), { projectName: 'Builder default fluid' });
  const out = buildSimKeywords(ws.contract);
  const built = buildPvtFromFluid(defaultBuilderForm().fluid);

  it('PVTO and PVDG are character for character what the Simulation Studio builder emits', () => {
    expect(out.ok).toBe(true);
    expect(out.blocks.pvto).toBe(emitPVTO(built.pvtoRecords));
    expect(out.blocks.pvdg).toBe(emitPVDG(built.pvdg));
    // and they are in the deck the builder generates
    const deck = buildDeckFromForm(defaultBuilderForm()).deck;
    expect(deck).toContain(out.blocks.pvto);
    expect(deck).toContain(out.blocks.pvdg);
  });

  it('negative control: Rs left in scf/STB, or Bg in RB/scf, is not the builder\'s block', () => {
    const rows = simRowsFromContract(ws.contract);
    const wrongRs = emitPVTO(rows.pvtoRecords.map((r) => ({ ...r, rs: r.rs * 1000 })));
    expect(wrongRs).not.toBe(emitPVTO(built.pvtoRecords));
    const wrongBg = emitPVDG(rows.pvdg.map((r) => ({ ...r, bg: r.bg / 1000 })));
    expect(wrongBg).not.toBe(emitPVDG(built.pvdg));
  });

  it('the worker fixture is the builder deck with its PVT keywords replaced by the export (regen: GEN_SIM_FIXTURE=1)', () => {
    const deck = buildDeckFromForm(defaultBuilderForm()).deck;
    const start = deck.indexOf('PVTW\n');
    const end = deck.indexOf('ROCK\n');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    // the builder writes PVTW, PVDG, PVTO in that stretch and nothing else
    expect(deck.slice(start, end).match(/^[A-Z]+$/gm)).toEqual(['PVTW', 'PVDG', 'PVTO']);
    const withExport = `${deck.slice(0, start)}${out.text}\n${deck.slice(end)}`;
    if (process.env.GEN_SIM_FIXTURE === '1') fs.writeFileSync(FIXTURE, withExport);
    expect(fs.existsSync(FIXTURE)).toBe(true);
    expect(fs.readFileSync(FIXTURE, 'utf8')).toBe(withExport);
    // the deck still has each keyword once
    for (const kw of ['PVTO', 'PVDG', 'PVTW', 'ROCK', 'DENSITY']) expect(withExport.match(new RegExp(`^${kw}$`, 'gm'))).toHaveLength(1);
  });
});

describe('round trip: the export read back is the table in deck units', () => {
  const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
  const out = buildSimKeywords(ws.contract);
  const back = readSimKeywords(out.text);
  const table = [...ws.contract.table].sort((a, b) => a.pressure - b.pressure);
  const pb = ws.contract.at_saturation.pressure;

  it('PVTO: one node per saturated row, Rs in Mscf/STB, the undersaturated branch on the last node', () => {
    const sat = table.filter((r) => r.phase === 'saturated');
    expect(back.PVTO.length).toBeGreaterThan(20);
    expect(back.PVTO.length).toBeLessThanOrEqual(sat.length);
    for (const node of back.PVTO) {
      const row = sat.find((r) => r.pressure === node.p);
      expect(row).toBeDefined();
      expect(node.rs).toBeCloseTo(row.Rs / 1000, 4); // one known conversion: scf/STB over 1000
      expect(node.bo).toBeCloseTo(row.Bo, 4);
      expect(node.muo).toBeCloseTo(row.mu_o, 4);
    }
    const last = back.PVTO[back.PVTO.length - 1];
    expect(last.p).toBe(pb);
    expect(last.rs).toBeCloseTo(0.768, 4);
    const above = table.filter((r) => r.phase === 'undersaturated' && r.pressure > pb + 1);
    expect(last.undersat.map((u) => u.p)).toEqual(above.map((r) => r.pressure));
    last.undersat.forEach((u, i) => { expect(u.bo).toBeCloseTo(above[i].Bo, 4); expect(u.muo).toBeCloseTo(above[i].mu_o, 4); });
    back.PVTO.slice(0, -1).forEach((n) => expect(n.undersat).toEqual([]));
    // Rs strictly ascending, as the simulator requires
    for (let i = 1; i < back.PVTO.length; i += 1) expect(back.PVTO[i].rs).toBeGreaterThan(back.PVTO[i - 1].rs);
  });

  it('PVDG: every gas row, Bg in RB/Mscf', () => {
    expect(back.PVDG).toHaveLength(table.filter((r) => r.Bg > 0).length);
    for (const g of back.PVDG) {
      const row = table.find((r) => r.pressure === g.p);
      expect(g.bg).toBeCloseTo(row.Bg * 1000, 3); // one known conversion: RB/scf times 1000
      expect(g.mug).toBeCloseTo(row.mu_g, 5);
    }
    for (let i = 1; i < back.PVDG.length; i += 1) expect(back.PVDG[i].p).toBeGreaterThan(back.PVDG[i - 1].p);
  });

  it('PVTW at the bubble point: Bw and viscosity from the table', () => {
    expect(back.PVTW.pref).toBe(pb);
    expect(back.PVTW.bw).toBeCloseTo(ws.contract.at_saturation.Bw, 4);
    expect(back.PVTW.muw).toBeCloseTo(ws.contract.at_saturation.mu_w, 4);
  });

  it('GATE: the water compressibility and viscosibility are the slopes of the engine\'s own water functions', () => {
    const T = ws.contract.inputs.temperature;
    const S = ws.contract.inputs.salinity;
    const dp = 1;
    const cwEngine = -(bwAt(pb + dp, T, S) - bwAt(pb - dp, T, S)) / (2 * dp) / bwAt(pb, T, S);
    const cvEngine = (muWaterAt(pb + dp, T, S) - muWaterAt(pb - dp, T, S)) / (2 * dp) / muWaterAt(pb, T, S);
    const rows = simRowsFromContract(ws.contract);
    expect(cwEngine).toBeGreaterThan(2e-6);
    expect(cwEngine).toBeLessThan(5e-6);
    // the table prints Bw to four decimals over rows some 130 psi apart: within 5 percent of the exact slope
    expect(Math.abs(rows.pvtw.cw - cwEngine) / cwEngine).toBeLessThan(0.05);
    expect(Math.abs(rows.pvtw.viscosibility - cvEngine) / cvEngine).toBeLessThan(0.05);
    expect(back.PVTW.cw).toBeCloseTo(rows.pvtw.cw, 8);
    // negative control: the slope with the wrong sign is a negative compressibility
    expect(-rows.pvtw.cw).toBeLessThan(0);
    expect(relativeSlopeAt(ws.contract.table, 'Bw', pb)).toBeLessThan(0);
    expect(relativeSlopeAt([{ pressure: 1, Bw: 1 }], 'Bw', 1)).toBeNull();
  });

  it('the comment lines state the origin, every method, the units and the conventions, and hold no keyword', () => {
    const head = out.text.slice(0, out.text.indexOf('\nPVTO'));
    for (const line of head.split('\n')) expect(line === '' || line.startsWith('--')).toBe(true);
    const c = back.comments.join('\n');
    expect(c).toMatch(/PVT contract: pvt-1/);
    expect(c).toMatch(/Source: Fluid Systems Studio, project "Good Oil Well No\. 4 PVT"/);
    expect(c).toMatch(/Fluid model: Black-oil correlations/);
    expect(c).toMatch(/Lab tuning: correlations matched to lab data/);
    expect(c).toMatch(/Bubble point pressure: 2635 psia, measured \(lab\)/);
    expect(c).toMatch(/Table temperature: 220 degF/);
    expect(c).toMatch(/Method, Oil formation volume factor Bo: Standing, multiplied by 0\.\d{4} plus 0\.\d{4} RB\/STB \(laboratory match\) \(Standing \(1947\)\)/);
    expect(c).toMatch(/Method, Gas deviation factor Z:/);
    expect(c).toMatch(/Method, Water viscosity: McCain/);
    expect((c.match(/^Method, /gm) || []).length).toBe(12);
    expect(c).toMatch(/UNITS \(FIELD\), whatever the display units of the project:/);
    expect(c).toMatch(/Rs Mscf\/STB/);
    expect(c).toMatch(/Bg RB\/Mscf/);
    expect(c).toMatch(/standard conditions 14\.7 psia and 60 degF/);
    expect(c).toMatch(/PVTO: one record per saturated node, Rs ascending/);
    expect(c).toMatch(/PVDG: pressure, Bg, gas viscosity, pressure ascending\. Dry gas/);
    expect(c).toMatch(/PVTW: reference pressure, Bw, water compressibility, water viscosity, viscosibility, at the bubble point/);
    expect(out.fileName).toBe('Good_Oil_Well_No_4_PVT_PVT.INC');
    // plain ASCII: a deck reader takes nothing else
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(out.text)).toBe(true);
  });
});

describe('what the export refuses, and the compositional table', () => {
  it('no block, and a table with no undersaturated row', () => {
    expect(buildSimKeywords(null).reasons[0]).toMatch(/no PVT block/);
    const ws = run(sampleWorkspace());
    const onlySat = { ...ws.contract, table: ws.contract.table.filter((r) => r.phase === 'saturated') };
    expect(buildSimKeywords(onlySat).reasons.join(' ')).toMatch(/PVTO needs an undersaturated branch/);
  });

  it('a dew point fluid is refused: it needs PVTG', () => {
    const ws = run(sampleWorkspace());
    const dew = { ...ws.contract, model_detail: { ...ws.contract.model_detail, saturation_kind: 'dew' } };
    const out = buildSimKeywords(dew);
    expect(out.ok).toBe(false);
    expect(out.reasons[0]).toMatch(/gas condensate needs the wet gas keyword PVTG/);
  });

  it('the equation of state table exports too, and says what it is', () => {
    const ws = run(eosWithLab());
    const out = buildSimKeywords(ws.contract);
    expect(out.ok).toBe(true);
    const back = readSimKeywords(out.text);
    expect(back.comments.join('\n')).toMatch(/Fluid model: Equation of state/);
    expect(back.PVTO.length).toBeGreaterThan(5);
    for (let i = 1; i < back.PVTO.length; i += 1) expect(back.PVTO[i].rs).toBeGreaterThan(back.PVTO[i - 1].rs);
    expect(back.PVTO[back.PVTO.length - 1].undersat.length).toBeGreaterThan(0);
    expect(back.PVTW.bw).toBeGreaterThan(1);
  });
});
