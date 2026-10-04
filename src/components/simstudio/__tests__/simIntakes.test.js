/**
 * SIM-U1-003/004/006/013 and units: the deck builder's intakes, strict
 * inputs, the datum migration and one known value per unit conversion.
 * Every gate calls the shipped builder (buildDeckFromForm) and compares with
 * the producing app's own simulator export, so a drift on either side fails.
 */
import { buildDeckFromForm, defaultBuilderForm, migrateBuilderForm, specFromForm } from '@/utils/simDeckBuilder';
import { takePvtIntoForm, takeKrIntoForm, dropPvtIntake, krEditedKeys, provenanceNotes } from '@/utils/simstudio/builderIntakes';
import { buildSimKeywords } from '@/utils/fluidstudio/simKeywords';
import { buildSatKeywords } from '@/utils/scalstudio/simKeywords';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { simUnits, vectorView } from '@/utils/simstudio/simUnits';
import { blackOilMethods, computePvtTable } from '@/utils/fluidStudioCalculations';
import { identifiedFitted, stateOf as scalStateOf } from '@/components/scalstudio/__tests__/scalTestKit';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const AT = '2026-10-04T10:00:00.000Z';
const fluidBlock = () => ({ ...run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' }).contract, project_id: 'fluid-1', generated_at: AT });
// the demo's gas-oil set sits at Swc 0.2 and the fitted oil-water set at 0.18:
// the simulator takes one connate water, so the gas-oil set is put at 0.18 here
// (the unchanged block is refused, tested below)
const rawScal = () => ({ ...scalStateOf(identifiedFitted()).contract, generated_at: AT });
const scalBlock = () => {
  const b = rawScal();
  return { ...b, gas_oil: { ...b.gas_oil, params: { ...b.gas_oil.params, Swc: b.oil_water.params.Swc } } };
};

describe('SIM-U1-003 PVT from a Fluid Systems Studio block', () => {
  test('PVTO, PVDG and PVTW in the deck are Fluid Systems Studio\'s own export blocks, with provenance comments', () => {
    const res = takePvtIntoForm(defaultBuilderForm(), fluidBlock(), { at: AT });
    expect(res.ok).toBe(true);
    const out = buildDeckFromForm(res.form);
    expect(out.ok).toBe(true);
    const ex = buildSimKeywords(fluidBlock());
    expect(ex.ok).toBe(true);
    expect(out.deck).toContain(ex.blocks.pvto);
    expect(out.deck).toContain(ex.blocks.pvdg);
    expect(out.deck).toContain(ex.blocks.pvtw);
    expect(out.deck).toMatch(/-- PVT \(PVTO, PVDG, PVTW, DENSITY oil and gas\): pvt-1 from Fluid Systems Studio project "Good Oil Well No\. 4 PVT" \(id fluid-1\)/);
    expect(out.deck).toMatch(/-- PVT Lab tuning: /);
    // the solved bubble point is the block's
    expect(out.pb).toBeCloseTo(fluidBlock().at_saturation.pressure, 6);
    // negative control: dropping the block goes back to the typed correlations and the PVTO block differs
    const typed = buildDeckFromForm(dropPvtIntake(res.form));
    expect(typed.ok).toBe(true);
    expect(typed.deck).not.toContain(ex.blocks.pvto);
    expect(typed.deck).toMatch(/-- PVT \(PVTO, PVDG\): entered in the deck builder/);
  });

  test('the typed-correlation note names the methods the engine ran', () => {
    const f = defaultBuilderForm().fluid;
    const fluid = { api: 35, gasGravity: 0.75, temp: 190, rsb: 800, salinity: 30000, pb: null, correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' } };
    const { pbDetail } = computePvtTable(fluid);
    const methods = blackOilMethods(fluid, pbDetail || { route: 'solved' });
    const byKey = Object.fromEntries(methods.map((m) => [m.key, m.method]));
    const notes = provenanceNotes(defaultBuilderForm()).join('\n');
    expect(byKey.bo).toMatch(/Standing/);
    expect(byKey.mu_o).toMatch(/Beggs/);
    expect(notes).toMatch(/Standing Pb, Rs and Bo; Beggs-Robinson oil viscosity/);
    expect(f.api).toBe('35');
  });

  test('"source changed since" by content, after a re-save of a different fluid', () => {
    const res = takePvtIntoForm(defaultBuilderForm(), fluidBlock(), { at: AT });
    const intake = res.form.pvtSource.intake;
    const same = pvtIntakeCardModel({ intake, fields: [], latest: { ok: true, contract: { ...fluidBlock(), generated_at: '2026-10-05T00:00:00Z' } } });
    expect(same.changedSince).toBeNull();
    const changed = { ...fluidBlock(), inputs: { ...fluidBlock().inputs, oil_gravity: 40 } };
    const m = pvtIntakeCardModel({ intake, fields: [], latest: { ok: true, contract: changed } });
    expect(m.status).toBe('Source changed since');
  });

  test('a block with no water columns is refused with the reason', () => {
    const b = fluidBlock();
    b.table = b.table.map(({ Bw, mu_w, ...rest }) => rest);
    delete b.at_saturation.cw;
    const res = takePvtIntoForm(defaultBuilderForm(), b);
    expect(res.ok).toBe(false);
  });
});

describe('SIM-U1-004 kr and Pc from a SCAL Studio block', () => {
  test('SWOF and SGOF are SCAL Studio\'s own export rows, Pcow from the J with its own Swirr', () => {
    const res = takeKrIntoForm(defaultBuilderForm(), scalBlock(), { at: AT });
    expect(res.ok).toBe(true);
    const f = res.form;
    expect(f.krSource.mode).toBe('scal');
    const out = buildDeckFromForm(f);
    expect(out.ok).toBe(true);
    const b = scalBlock();
    const ex = buildSatKeywords({
      contract: b, ow: b.oil_water.params, go: { ...b.gas_oil.params, Swc: b.oil_water.params.Swc },
      jSpec: f.scal.pc.enabled ? { type: 'power', a: b.capillary.j.a, b: b.capillary.j.b, Swirr: b.capillary.j.Swirr } : null,
      reservoir: f.scal.pc.enabled ? b.capillary.reservoir : null, withPc: f.scal.pc.enabled,
    });
    expect(ex.ok).toBe(true);
    const swof = ex.text.slice(ex.text.indexOf('\nSWOF\n') + 1, ex.text.indexOf('\nSGOF\n'));
    const sgof = ex.text.slice(ex.text.indexOf('\nSGOF\n') + 1);
    expect(out.deck).toContain(swof.trim());
    expect(out.deck).toContain(sgof.trim());
    expect(out.deck).toMatch(/-- SWOF, SGOF: kr-1 from SCAL Studio project/);
    if (f.scal.pc.enabled) expect(out.deck).toMatch(/-- Pcow: Leverett J power law/);
  });

  test('an edit after intake is marked in the deck notes and the card', () => {
    const res = takeKrIntoForm(defaultBuilderForm(), scalBlock(), { at: AT });
    const f = structuredClone(res.form);
    f.scal.ow.nw = '3.1';
    expect(krEditedKeys(f)).toEqual(['nw']);
    expect(buildDeckFromForm(f).deck).toMatch(/-- Edited in the deck builder after intake: nw/);
  });

  test('two connate waters are refused with the reason (the SCAL demo as saved)', () => {
    const res = takeKrIntoForm(defaultBuilderForm(), rawScal());
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/gas-oil set is at Swc 0\.2 and the oil-water set at Swc 0\.18/);
  });

  test('a block with no gas-oil set is refused: the deck needs SGOF', () => {
    const b = scalBlock();
    delete b.gas_oil;
    const res = takeKrIntoForm(defaultBuilderForm(), b);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/no gas-oil set/);
  });
});

describe('SIM-U1-006 strict inputs: no hidden default reaches the deck', () => {
  test('a blank OWC is a contact outside the grid, stated; before it became 0 ft', () => {
    const f = defaultBuilderForm();
    f.equil.owc = '';
    const { spec } = specFromForm(f);
    expect(spec.equil.owc).toBeUndefined();
    const deck = buildDeckFromForm(f).deck;
    // composeDeck puts it 100 ft below the grid (8,000 + 100 ft of layers + 100)
    expect(deck).toMatch(/\n {2}8050 4200 8200 0 7900 0 1 0 0 \//);
  });
  test('blank required inputs are refused by name, all at once', () => {
    const f = defaultBuilderForm();
    f.grid.dx = '';
    f.fluid.api = '';
    f.wells[0].rate = 'abc';
    const out = buildDeckFromForm(f);
    expect(out.ok).toBe(false);
    expect(out.errors).toEqual(expect.arrayContaining(['DX: enter a value.', 'Oil API: enter a value.', 'Well PROD1 rate: "abc" is not a number.']));
  });
});

describe('SIM-U1-013 the depth reference of a deviated well', () => {
  const SURVEY = '0 0 0\n7850 0 90\n8150 85 90\n9500 88 90';
  const withSurvey = (traj) => {
    const f = defaultBuilderForm();
    f.wells[0] = { ...f.wells[0], trajectory: { enabled: true, text: SURVEY, mdUnit: 'ft', wellheadX: '1000', wellheadY: '2500', ...traj } };
    return f;
  };
  test('a saved version 1 form ("KB to datum" shift) builds the same deck after migration', () => {
    const old = withSurvey({ kbToDatum: '-50' });
    const migrated = migrateBuilderForm(old);
    expect(migrated.wells[0].trajectory.refElevFt).toBe('50');
    expect(migrated.wells[0].trajectory.kbToDatum).toBeUndefined();
    const a = buildDeckFromForm(old);
    const b = buildDeckFromForm(withSurvey({ refKind: 'KB', refElevFt: '50' }));
    expect(a.ok && b.ok).toBe(true);
    expect(a.deck).toBe(b.deck);
    // negative control: a different elevation moves the connections
    expect(buildDeckFromForm(withSurvey({ refKind: 'KB', refElevFt: '0' })).deck).not.toBe(a.deck);
  });
});

describe('units: one known value per conversion (PL3, RL7)', () => {
  const si = simUnits('si');
  test('builder fields: FIELD stored, SI shown', () => {
    expect(si.text('length', '500')).toBe('152.4');
    expect(si.text('pressure', '4200')).toBe('28957.98');
    expect(si.text('oilRate', '1000')).toBe('158.9873');
    expect(si.text('gasRate', '1000')).toBe('28.31685');
    expect(si.text('temperature', '212')).toBe('100');
    expect(si.text('compressibility', '1')).toBe('0.1450377');
    expect(si.text('density', '62.428')).toBe('1000.001');
    expect(si.toState('length', '152.4')).toBe('500');
    expect(si.toState('pressure', '-')).toBeNull();
    expect(simUnits('oilfield').toState('pressure', '-')).toBe('-');
  });
  test('result vectors: deck units to display units, METRIC decks labelled as METRIC', () => {
    expect(vectorView('FOPR', 'FIELD', 'si').convert(1000)).toBeCloseTo(158.987, 3);
    expect(vectorView('FPR', 'METRIC', 'oilfield').convert(100)).toBeCloseTo(1450.377, 3);
    expect(vectorView('FPR', 'METRIC', 'si').convert(100)).toBeCloseTo(10000, 6);
    expect(vectorView('FGOR', 'FIELD', 'si').convert(1)).toBeCloseTo(178.108, 3);
    expect(vectorView('FGPR', 'METRIC', 'oilfield').convert(28316.8466)).toBeCloseTo(1000, 3);
    expect(vectorView('FOPRH', 'FIELD', 'si').label).toBe('sm3/d');
    expect(vectorView('FPR', 'LAB', 'si').ok).toBe(false);
  });
});
