/**
 * FS5 gates — UI-facing EOS orchestrator.
 *
 * The physics is already gated in eos/__tests__; these tests cover the
 * seam: mol% parsing/normalization, error surfacing, agreement between
 * runEosFlash and a direct engine call, and the envelope worker request.
 */
import { parseComposition, runEosFlash, emptyComposition, envelopeRequest, buildMixture } from '../eosAnalysis';
import { flashPT } from '../eos/flash';
import { degFtoR } from '../eos/units';
import goldens from '../eos/__tests__/goldens.json';

const charOilComposition = () => ({
  ...emptyComposition(),
  zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
  plus: { mw: 190, sg: 0.84, tbF: null },
  pressure: 1000,
  temp: 200,
});

describe('parseComposition', () => {
  test('normalizes mol% and orders components canonically', () => {
    const parsed = parseComposition(charOilComposition());
    expect(parsed.valid).toBe(true);
    expect(parsed.keys).toEqual(['CO2', 'C1', 'C2', 'C3', 'nC4', 'nC6', 'C7+']);
    expect(parsed.z.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(parsed.z[1]).toBeCloseTo(0.40, 12);
  });

  test('renormalizes an off-100 total with a warning', () => {
    const comp = charOilComposition();
    comp.zPct = { ...comp.zPct, C1: 50 }; // sum 110
    const parsed = parseComposition(comp);
    expect(parsed.valid).toBe(true);
    expect(parsed.warnings.join(' ')).toMatch(/renormalized/);
    expect(parsed.z.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  test('rejects a missing C7+ description and missing conditions', () => {
    const comp = charOilComposition();
    comp.plus = { mw: null, sg: null };
    comp.pressure = null;
    const parsed = parseComposition(comp);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(' ')).toMatch(/molecular weight/);
    expect(parsed.errors.join(' ')).toMatch(/pressure/);
  });

  test('rejects fewer than two components', () => {
    const comp = emptyComposition();
    comp.zPct.C1 = 100;
    comp.pressure = 1000;
    comp.temp = 200;
    expect(parseComposition(comp).valid).toBe(false);
  });

  test('measured Tb is converted to degR and carried', () => {
    const comp = charOilComposition();
    comp.plus.tbF = 500;
    const parsed = parseComposition(comp);
    expect(parsed.plus.tbR).toBeCloseTo(degFtoR(500), 10);
  });
});

describe('runEosFlash', () => {
  test('matches a direct engine flash on the goldens char-oil fluid', () => {
    const comp = charOilComposition(); // 200F/1000psia is a goldens flashC7 state
    const out = runEosFlash(comp);
    expect(out.flash.phases).toBe(2);

    const direct = flashPT(buildMixture(out.parsed), out.parsed.z, degFtoR(200), 1000);
    expect(out.flash.beta).toBeCloseTo(direct.beta, 12);
    expect(out.flash.liquid.density).toBeCloseTo(direct.liquid.density, 10);

    const golden = goldens.flashC7.find((f) => f.name === 'char-oil')
      .states.find((s) => s.tF === 200 && s.pPsia === 1000);
    expect(out.flash.beta).toBeCloseTo(golden.beta, 8);
  });

  test('single-phase outcome labels the phase from the negative-flash side', () => {
    const comp = charOilComposition();
    comp.pressure = 6000; // far above the ~2900 psia bubble point
    const out = runEosFlash(comp);
    expect(out.flash.phases).toBe(1);
    expect(out.flash.feed.label).toMatch(/single phase/i);
    expect(out.flash.feed.moleFraction).toBe(1);
  });

  test('invalid composition returns parse errors and no flash', () => {
    const out = runEosFlash(emptyComposition());
    expect(out.flash).toBeNull();
    expect(out.parsed.errors.length).toBeGreaterThan(0);
  });

  test('characterization block carries the pseudo and its C1 BIP', () => {
    const out = runEosFlash(charOilComposition());
    expect(out.characterization.mw).toBe(190);
    expect(out.characterization.bipC1).toBeGreaterThan(0.02);
    expect(out.characterization.meta.tbSource).toBe('soreide');
  });
});

describe('envelopeRequest', () => {
  test('builds a plain-data worker payload with clamped point count', () => {
    const comp = charOilComposition();
    comp.envelope = { tMinF: 40, tMaxF: 400, nT: 999 };
    const req = envelopeRequest(comp);
    expect(req.keys[req.keys.length - 1]).toBe('C7+');
    expect(req.nT).toBe(40);
    expect(req.resTempF).toBe(200);
    expect(JSON.parse(JSON.stringify(req))).toEqual(req); // structured-clone safe
  });

  test('returns null while the composition is invalid', () => {
    expect(envelopeRequest(emptyComposition())).toBeNull();
  });
});
