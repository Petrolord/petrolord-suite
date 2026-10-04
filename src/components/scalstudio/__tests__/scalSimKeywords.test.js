/**
 * SCAL-U2-001: SWOF and SGOF keyword export with capillary pressure.
 *
 * Three readers:
 *   - the Simulation Studio deck builder: with Pc off, the export's blocks
 *     are the builder's own (buildSatFns + emitSWOF/emitSGOF) for the same
 *     Corey sets, character for character;
 *   - the keyword reader of this module: the export read back gives the
 *     engine's Corey rows and the engine's Pc (pcFromJ) at each Sw, in the
 *     deck units, to the printed digits;
 *   - the simulator: the worker fixture is the builder's default deck with
 *     its SWOF and SGOF replaced by this export (Pc on), and the worker gate
 *     runs it through OPM Flow (test_scal_export_deck.py).
 */
import fs from 'fs';
import path from 'path';
import { defaultBuilderForm, buildSatFns, buildDeckFromForm } from '@/utils/simDeckBuilder';
import { emitSWOF, emitSGOF } from '@/utils/simDeckGeneration';
import { buildCoreyOilWater, buildCoreyGasOil, pcFromJ } from '@/utils/scalCalculations';
import { buildSatKeywords, readSatKeywords, satFnRows, pcPsiAt } from '@/utils/scalstudio/simKeywords';
import { openingInputs, stateOf, identifiedFitted } from './scalTestKit';

const FIXTURE = path.join(process.cwd(), 'worker', 'sim-worker', 'tests', 'integration', 'fixtures', 'generated', 'SCAL_EXPORT.DATA');

/** The builder's default SCAL form as Corey sets in the studio's shape (one Swc for both). */
const builderSets = () => {
  const f = defaultBuilderForm().scal;
  const n = (v) => parseFloat(v);
  const ow = { Swc: n(f.ow.Swc), Sor: n(f.ow.Sor), krwMax: n(f.ow.krwMax), kroMax: n(f.ow.kroMax), nw: n(f.ow.nw), no: n(f.ow.no) };
  const go = { Swc: ow.Swc, Sgc: n(f.go.Sgc), Sorg: n(f.go.Sorg), krgMax: n(f.go.krgMax), krogMax: n(f.go.krogMax), ng: n(f.go.ng), nog: n(f.go.nog) };
  return { f, ow, go };
};

describe('the export is the deck builder\'s own blocks for the same curves', () => {
  it('without Pc, SWOF and SGOF are character for character what the Simulation Studio builder emits', () => {
    const { f, ow, go } = builderSets();
    const out = buildSatKeywords({ ow, go, withPc: false });
    expect(out.ok).toBe(true);
    const fromBuilder = buildSatFns(f);
    expect(out.text).toContain(emitSWOF(fromBuilder.swof));
    expect(out.text).toContain(emitSGOF(fromBuilder.sgof));
  });

  it('negative control: a set the builder did not get is not its block', () => {
    const { f, ow, go } = builderSets();
    const out = buildSatKeywords({ ow: { ...ow, nw: ow.nw + 0.1 }, go, withPc: false });
    expect(out.text).not.toContain(emitSWOF(buildSatFns(f).swof));
  });
});

describe('round trip: the export read back is the engine\'s curves and Pc in deck units', () => {
  const s = stateOf(openingInputs());
  const args = { contract: s.contract, ow: s.ow.params, go: s.go.params, jSpec: s.jResolved.jSpec, reservoir: s.reservoir.props };

  it('SWOF: the Corey rows from Swc, a terminal row at Sw = 1, Pcow = pcFromJ at each Sw (psi)', () => {
    const out = buildSatKeywords({ ...args, units: 'FIELD' });
    expect(out.ok).toBe(true);
    const back = readSatKeywords(out.text);
    const engine = buildCoreyOilWater(s.ow.params, { n: 20 }).rows;
    expect(back.SWOF).toHaveLength(22);
    engine.forEach((r, i) => {
      const [Sw, krw, krow, pc] = back.SWOF[i];
      expect(Math.abs(Sw - r.Sw)).toBeLessThan(5e-6);
      expect(Math.abs(krw - r.krw)).toBeLessThanOrEqual(5.000001e-7);
      expect(Math.abs(krow - r.kro)).toBeLessThanOrEqual(5.000001e-7);
      expect(Math.abs(pc - pcPsiAt(s.jResolved.jSpec, s.reservoir.props, r.Sw))).toBeLessThan(5e-6);
    });
    expect(back.SWOF[21]).toEqual([1, 0.35, 0, Number(pcPsiAt(s.jResolved.jSpec, s.reservoir.props, 1).toFixed(5))]);
    // Pcow is non-increasing in Sw (the simulator requires it)
    for (let i = 1; i < back.SWOF.length; i++) expect(back.SWOF[i][3]).toBeLessThanOrEqual(back.SWOF[i - 1][3]);
  });

  it('GATE: the Pc column is the engine\'s pcFromJ on its own uniform grid, not an interpolation', () => {
    const rows = satFnRows({ ...args, withPc: true });
    const grid = pcFromJ(s.jResolved.jSpec, s.reservoir.props, { n: 20, SwMin: s.ow.params.Swc, SwMax: 1 - s.ow.params.Sor });
    rows.swof.slice(0, 21).forEach((r, i) => {
      expect(r.Sw).toBe(grid.rows[i].Sw);
      expect(r.pcow).toBe(grid.rows[i].Pc_psi);
    });
  });

  it('SGOF: from Sg 0 to 1 - Swc, the engine\'s gas-oil rows between, Pcog zero', () => {
    const back = readSatKeywords(buildSatKeywords(args).text);
    const engine = buildCoreyGasOil(s.go.params, { n: 20 }).rows;
    expect(back.SGOF[0]).toEqual([0, 0, 0.85, 0]);
    engine.forEach((r, i) => {
      const [Sg, krg, krog, pc] = back.SGOF[i + 1];
      expect(Math.abs(Sg - r.Sg)).toBeLessThan(5e-6);
      expect(Math.abs(krg - r.krg)).toBeLessThanOrEqual(5.000001e-7);
      expect(Math.abs(krog - r.krog)).toBeLessThanOrEqual(5.000001e-7);
      expect(pc).toBe(0);
    });
    expect(back.SGOF[back.SGOF.length - 1]).toEqual([0.8, 0.6, 0, 0]);
  });

  it('METRIC: Pc in bar, 1 psi = 0.0689476 bar (pinned); negative control: the FIELD file read as bar is 14.5 times high', () => {
    const field = readSatKeywords(buildSatKeywords({ ...args, units: 'FIELD' }).text).SWOF;
    const metric = readSatKeywords(buildSatKeywords({ ...args, units: 'METRIC' }).text).SWOF;
    expect(metric[0][3] / field[0][3]).toBeCloseTo(0.0689476, 6);
    expect(field[0][3] / metric[0][3]).toBeCloseTo(14.5038, 3);
    expect(buildSatKeywords({ ...args, units: 'METRIC' }).text).toMatch(/-- Units: saturations and kr as fractions; Pc in bar \(METRIC deck units\)/);
  });

  it('the comment lines state the source, the units and the conventions, are plain ASCII and hold no keyword', () => {
    const t = stateOf(identifiedFitted());
    // the fitted oil-water set is at Swc 0.18; the export needs the gas-oil set at the same Swc
    expect(buildSatKeywords({ ow: t.ow.params, go: t.go.params, withPc: false }).errors[0]).toMatch(/one connate water/);
    const out = buildSatKeywords({ contract: t.contract, ow: t.ow.params, go: { ...t.go.params, Swc: t.ow.params.Swc }, jSpec: t.jResolved.jSpec, reservoir: t.reservoir.props, displayUnits: 'oilfield' });
    const head = out.text.slice(0, out.text.indexOf('SWOF\n'));
    for (const line of head.split('\n')) expect(line === '' || line.startsWith('-- ')).toBe(true);
    expect(head).toMatch(/-- Oil-water set: Corey fitted to sample "Demo core A \(synthetic\)"/);
    expect(head).toMatch(/-- Source: SCAL Studio, project "Ekene E-2000 SCAL"/);
    expect(head).toMatch(/Pcow = Po - Pw/);
    expect(head).toMatch(/Pcog = Pg - Po\. Zero in every row/);
    expect(head).toMatch(/Leverett J/);
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(out.text)).toBe(true);
    expect(out.text.match(/^SWOF$/gm)).toHaveLength(1);
    expect(out.text.match(/^SGOF$/gm)).toHaveLength(1);
  });
});

describe('what the export refuses, with the reason', () => {
  const s = stateOf(openingInputs());
  const base = { ow: s.ow.params, go: s.go.params, jSpec: s.jResolved.jSpec, reservoir: s.reservoir.props };

  it('two connate waters: SGOF would not close with SWOF', () => {
    const out = buildSatKeywords({ ...base, go: { ...base.go, Swc: 0.25 } });
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/one connate water/);
  });

  it('Swc at or below Swirr: Pc has no finite value; without Pc the export goes', () => {
    const jSpec = { ...base.jSpec, Swirr: 0.2 };
    const out = buildSatKeywords({ ...base, jSpec });
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/at or below Swirr 0\.2/);
    expect(buildSatKeywords({ ...base, jSpec, withPc: false }).ok).toBe(true);
  });

  it('a differing oil end point at connate water is a warning in the file', () => {
    const out = buildSatKeywords({ ...base, go: { ...base.go, krogMax: 0.8 } });
    expect(out.ok).toBe(true);
    expect(out.text).toMatch(/-- Warning: krog at Sg = 0 \(0\.8\) differs from krow at Swc \(0\.9\)/);
  });
});

describe('the worker fixture (regen: GEN_SIM_FIXTURE=1)', () => {
  it('is the builder deck with its SWOF and SGOF replaced by the export, Pc on', () => {
    const s = stateOf(openingInputs());
    const out = buildSatKeywords({ contract: s.contract, ow: s.ow.params, go: s.go.params, jSpec: s.jResolved.jSpec, reservoir: s.reservoir.props });
    const deck = buildDeckFromForm(defaultBuilderForm()).deck;
    const start = deck.indexOf('SWOF\n');
    const end = deck.indexOf('/\n', deck.indexOf('SGOF\n')) + 2;
    expect(start).toBeGreaterThan(0);
    expect(deck.slice(start, end).match(/^[A-Z]+$/gm)).toEqual(['SWOF', 'SGOF']);
    const withExport = `${deck.slice(0, start)}${out.text}${deck.slice(end)}`;
    if (process.env.GEN_SIM_FIXTURE === '1') fs.writeFileSync(FIXTURE, withExport);
    expect(fs.existsSync(FIXTURE)).toBe(true);
    expect(fs.readFileSync(FIXTURE, 'utf8')).toBe(withExport);
    for (const kw of ['SWOF', 'SGOF', 'PVTO', 'EQUIL']) expect(withExport.match(new RegExp(`^${kw}$`, 'gm'))).toHaveLength(1);
  });
});
