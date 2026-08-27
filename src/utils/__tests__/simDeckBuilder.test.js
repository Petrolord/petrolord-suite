/**
 * Model Builder adapter gates (S3): the default form must produce a valid,
 * deterministic deck through the real Fluid Studio + SCAL engines, with
 * the unit seams (Rs scf/STB -> Mscf/STB, Bg rb/scf -> RB/Mscf) explicit.
 *
 * The BUILT.DATA fixture consumed by the sim-worker's flow-acceptance
 * pytest is regenerated from here (jest owns the @/ alias):
 *   GEN_SIM_FIXTURE=1 npx jest src/utils/__tests__/simDeckBuilder.test.js
 */
import fs from 'fs';
import path from 'path';
import {
  defaultBuilderForm, buildPvtFromFluid, buildSatFns, specFromForm, buildDeckFromForm,
} from '../simDeckBuilder';
import { validateSpec } from '../simDeckGeneration';

const FIXTURE = path.join(__dirname, '..', '..', '..',
  'worker', 'sim-worker', 'tests', 'integration', 'fixtures', 'generated', 'BUILT.DATA');

describe('buildPvtFromFluid', () => {
  const { pvtoRecords, pvdg, pb } = buildPvtFromFluid(defaultBuilderForm().fluid);

  test('solves a plausible bubble point and closes the last PVTO node', () => {
    expect(pb).toBeGreaterThan(1000);
    expect(pb).toBeLessThan(8000);
    const last = pvtoRecords[pvtoRecords.length - 1];
    expect(last.undersat.length).toBeGreaterThan(0);
    expect(last.undersat[0].p).toBeGreaterThan(last.p);
    // Undersaturated Bo shrinks with pressure (compressibility).
    expect(last.undersat[last.undersat.length - 1].bo).toBeLessThan(last.bo);
  });

  test('unit seams: Rs in Mscf/STB, Bg in RB/Mscf', () => {
    const last = pvtoRecords[pvtoRecords.length - 1];
    expect(last.rs).toBeCloseTo(0.8, 5); // 800 scf/STB -> 0.8 Mscf/STB
    const nearAtm = pvdg[0];
    expect(nearAtm.p).toBeGreaterThanOrEqual(14.7);
    expect(nearAtm.bg).toBeGreaterThan(150); // ~200 RB/Mscf near atmospheric
    expect(nearAtm.bg).toBeLessThan(300);
  });

  test('PVTO Rs strictly increases; PVDG p strictly increases', () => {
    for (let i = 1; i < pvtoRecords.length; i += 1) {
      expect(pvtoRecords[i].rs).toBeGreaterThan(pvtoRecords[i - 1].rs);
    }
    for (let i = 1; i < pvdg.length; i += 1) {
      expect(pvdg[i].p).toBeGreaterThan(pvdg[i - 1].p);
    }
  });
});

describe('buildSatFns', () => {
  const { swof, sgof } = buildSatFns(defaultBuilderForm().scal);

  test('SWOF starts at Swc (connate initialization) and ends at Sw = 1', () => {
    expect(swof[0].Sw).toBeCloseTo(0.15, 6);
    expect(swof[0].krw).toBe(0);
    expect(swof[swof.length - 1].Sw).toBe(1);
    expect(swof[swof.length - 1].krow).toBe(0);
  });

  test('SGOF spans 0 to 1 - Swc so the tables close exactly (SPE1 lesson)', () => {
    expect(sgof[0].Sg).toBe(0);
    expect(sgof[sgof.length - 1].Sg).toBeCloseTo(1 - 0.15, 6);
    expect(sgof[sgof.length - 1].krog).toBe(0);
  });

  test('optional Leverett-J Pc fills SWOF column 4', () => {
    const form = defaultBuilderForm().scal;
    form.pc.enabled = true;
    const { swof: withPc } = buildSatFns(form);
    const midPc = withPc[Math.floor(withPc.length / 2)].pcow;
    expect(midPc).toBeGreaterThan(0);
    // Pc decreases with Sw.
    expect(withPc[1].pcow).toBeGreaterThan(withPc[withPc.length - 2].pcow);
  });
});

describe('buildDeckFromForm', () => {
  test('the default form composes a valid deck deterministically', () => {
    const a = buildDeckFromForm(defaultBuilderForm());
    const b = buildDeckFromForm(defaultBuilderForm());
    expect(a.ok).toBe(true);
    expect(a.deck).toBe(b.deck);
    expect(validateSpec(a.spec).ok).toBe(true);
    ['RUNSPEC', 'DISGAS', 'PVTO', 'PVDG', 'SWOF', 'SGOF', 'EQUIL', 'RSVD',
      'WELSPECS', 'WCONPROD', 'WCONINJE', 'TSTEP', 'END'].forEach((kw) => {
      expect(a.deck).toContain(kw);
    });
    expect(a.deck).toContain("'PROD1'");
    expect(a.deck).toContain("'INJ1' 'WATER'");
  });

  test('actionable errors for a broken form', () => {
    const form = defaultBuilderForm();
    form.wells[0].i = '99'; // outside the 10x10 grid
    const out = buildDeckFromForm(form);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/outside the grid/i);
  });

  test('matches the checked-in flow-acceptance fixture (regen: GEN_SIM_FIXTURE=1)', () => {
    const { deck } = buildDeckFromForm(defaultBuilderForm());
    if (process.env.GEN_SIM_FIXTURE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, deck);
    }
    expect(fs.existsSync(FIXTURE)).toBe(true);
    expect(fs.readFileSync(FIXTURE, 'utf8')).toBe(deck);
  });
});
