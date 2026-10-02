/**
 * Tester round 2 (2026-10-02): the report model. Inputs table with units
 * and sources (WTA-R2-001, -002), partial penetration and the skin split
 * (WTA-R2-003), identification (WTA-R2-004), flow and shut-in summary
 * (WTA-R2-005). Every number asserted here comes out of the engine through
 * the studio's own builders; the engine's physics is gated in
 * packages/engines/__tests__/welltest.partialPenetration.test.js.
 */
import {
  buildReservoirInputs, buildTestConfig, prepareTestData, generateSampleBuildup,
  DEFAULT_RESERVOIR, DEFAULT_TEST_CONFIG,
} from '@/contexts/WellTestStudioContext';
import {
  buildInputsTable, buildSkinBreakdown, skinBreakdownRows, buildFlowSummary, flowSummaryHead, flowSummaryBody,
  buildIdentificationRows, buildCompletion, resolveTotalCompressibility, sourceText, gasPvtSourceText,
  testTypeText, testDatesText, plain, periodKey, DEFAULT_KVKH, DEFAULT_COMPLETION, DEFAULT_IDENTIFICATION,
} from '@/utils/welltest/reportModel';
import { papatzacosPseudoSkin } from '@/utils/welltest/partialPenetration';
import { GAS_PVT_CORRELATIONS } from '@/utils/welltest/gas';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));
const table = (inputs, extra = {}) => buildInputsTable({
  reservoirInputs: inputs, reservoirSpec: buildReservoirInputs(inputs), completion: DEFAULT_COMPLETION, ...extra,
});

describe('WTA-R2-001 reservoir and fluid inputs table', () => {
  test('every value the analysis used is listed with its unit; what was not provided is n/a', () => {
    const rows = byKey(table(DEFAULT_RESERVOIR));
    expect(rows.h).toMatchObject({ label: 'Net pay h', value: '45', unit: 'ft' });
    expect(rows.phi).toMatchObject({ value: '0.18', unit: 'fraction' });
    expect(rows.rw).toMatchObject({ value: '0.354', unit: 'ft' });
    expect(rows.ct).toMatchObject({ value: '1.2e-5', unit: '1/psi' });
    expect(rows.mu).toMatchObject({ label: 'Oil viscosity mu_o', value: '0.9', unit: 'cp' });
    expect(rows.B).toMatchObject({ label: 'Oil formation volume factor Bo', value: '1.25', unit: 'RB/STB' });
    expect(rows.pi).toMatchObject({ value: '4800', unit: 'psia' });
    expect(rows.q).toMatchObject({ value: '450', unit: 'STB/D' });
    // never a blank and never a zero for what was not entered
    for (const key of ['sw', 'apiGravity', 'gor', 'gasGravity', 'temperature', 'perfMd', 'perfTvd', 'hp']) {
      expect(rows[key].value).toBe(EMPTY_VALUE);
      expect(rows[key].source).toBe('Not provided');
    }
    expect(Object.values(rows).every((r) => r.value !== '' && r.value !== '0')).toBe(true);
  });

  test('the oil defaults for gas gravity and temperature are not printed as if entered', () => {
    // DEFAULT_RESERVOIR carries gasGravity 0.65 and tempF 180 for the gas mode
    const rows = byKey(table(DEFAULT_RESERVOIR));
    expect(rows.gasGravity.value).toBe(EMPTY_VALUE);
    expect(rows.temperature.value).toBe(EMPTY_VALUE);
    const filled = byKey(table({ ...DEFAULT_RESERVOIR, solutionGasGravity: '0.72', reservoirTempF: '212', apiGravity: '34', gor: '650', sw: '0.22' }));
    expect(filled.gasGravity).toMatchObject({ value: '0.72', unit: 'air = 1' });
    expect(filled.temperature).toMatchObject({ value: '212', unit: 'degF' });
    expect(filled.apiGravity).toMatchObject({ value: '34', unit: 'degAPI' });
    expect(filled.gor).toMatchObject({ value: '650', unit: 'scf/STB' });
    expect(filled.sw).toMatchObject({ value: '0.22', unit: 'fraction' });
  });

  test('units follow the unit system: values convert, they are not relabelled', () => {
    const inputs = { ...DEFAULT_RESERVOIR, reservoirTempF: '212', gor: '650' };
    const si = byKey(table(inputs, { unitSystem: 'si' }));
    expect(si.h).toMatchObject({ value: '13.716', unit: 'm' });
    expect(si.pi.unit).toBe('kPa');
    expect(parseFloat(si.pi.value)).toBeCloseTo(4800 * 6.894757293168361, 0);
    expect(si.temperature).toMatchObject({ value: '100', unit: 'degC' });
    expect(parseFloat(si.gor.value)).toBeCloseTo(650 * 0.178107607, 2);
    expect(si.q.unit).toBe('m3/d');
  });

  test('ct entered as one number says so', () => {
    const rows = byKey(table(DEFAULT_RESERVOIR));
    expect(rows.ct.source).toMatch(/entered as total/);
    expect(Object.keys(rows).filter((k) => k.startsWith('ct.'))).toEqual([]);
  });

  test('ct from components: the engine sum, every term listed, and the analysis uses it', () => {
    const inputs = { ...DEFAULT_RESERVOIR, ct: '', ctMode: 'components', cf: '4e-6', so: '0.75', co: '1.2e-5', sw: '0.25', cw: '3e-6' };
    const spec = buildReservoirInputs(inputs);
    expect(spec.error).toBeNull();
    const expected = 4e-6 + 0.75 * 1.2e-5 + 0.25 * 3e-6;
    expect(spec.reservoir.ct).toBeCloseTo(expected, 18);
    const rows = byKey(buildInputsTable({ reservoirInputs: inputs, reservoirSpec: spec, completion: DEFAULT_COMPLETION }));
    expect(rows.ct.value).toBe(plain(expected));
    expect(rows.ct.source).toMatch(/Computed: ct = cf \+ So co \+ Sw cw \+ Sg cg/);
    expect(rows['ct.formation']).toMatchObject({ value: '4e-6', source: 'Formation compressibility' });
    expect(rows['ct.oil'].value).toBe('9e-6');
    expect(rows['ct.oil'].source).toBe('So 0.75 x 1.2e-5 1/psi');
    expect(rows['ct.water'].value).toBe('7.5e-7');
    expect(rows['ct.gas']).toBeUndefined();
    // the listed terms add up to the listed total
    const sum = ['formation', 'oil', 'water'].reduce((s, k) => s + parseFloat(rows[`ct.${k}`].value), 0);
    expect(sum).toBeCloseTo(parseFloat(rows.ct.value), 12);
  });

  test('ct components that cannot be summed stop the analysis with the reason', () => {
    const bad = buildReservoirInputs({ ...DEFAULT_RESERVOIR, ctMode: 'components', cf: '4e-6', so: '0.5', co: '1.2e-5', sw: '0.25', cw: '3e-6' });
    expect(bad.reservoir).toBeNull();
    expect(bad.error).toMatch(/saturations sum to 0.75; they must sum to 1/);
    const missing = buildReservoirInputs({ ...DEFAULT_RESERVOIR, ctMode: 'components', cf: '4e-6', so: '0.75', sw: '0.25', cw: '3e-6' });
    expect(missing.error).toMatch(/oil saturation is 0.75 but its compressibility is missing/);
  });

  test('a project saved before this round (no ctMode, no new fields) still builds, ct as total', () => {
    const old = { h: '45', phi: '0.18', rw: '0.354', B: '1.25', mu: '0.9', ct: '0.000012', q: '450', pi: '4800', fluid: 'oil', gasGravity: '0.65', tempF: '180' };
    const spec = buildReservoirInputs(old);
    expect(spec.error).toBeNull();
    expect(spec.reservoir.ct).toBeCloseTo(1.2e-5, 12);
    expect(spec.ctInfo.mode).toBe('total');
    expect(resolveTotalCompressibility(old)).toMatchObject({ mode: 'total', error: null });
    const rows = byKey(buildInputsTable({ reservoirInputs: old, reservoirSpec: spec, completion: undefined, inputMeta: undefined }));
    expect(rows.ct.source).toMatch(/entered as total/);
    expect(rows.kvkh).toMatchObject({ value: String(DEFAULT_KVKH) });
    expect(rows.sw.value).toBe(EMPTY_VALUE);
  });
});

describe('WTA-R2-002 source and quality of each input', () => {
  test('the selector and the free-text note print in the Source column', () => {
    const inputMeta = {
      mu: { source: 'lab', note: 'Bottomhole sample 2, OBM contamination 4 percent' },
      B: { source: 'correlation', correlation: 'Standing' },
      phi: { source: 'offset' },
      h: { source: 'assumed', note: 'log net pay pending' },
    };
    const rows = byKey(table(DEFAULT_RESERVOIR, { inputMeta }));
    expect(rows.mu.source).toBe('Measured (lab). Bottomhole sample 2, OBM contamination 4 percent');
    expect(rows.B.source).toBe('Correlation: Standing');
    expect(rows.phi.source).toBe('Offset well');
    expect(rows.h.source).toBe('Assumed. log net pay pending');
    expect(rows.rw.source).toBe('Entered, source not stated');
    expect(sourceText({ source: 'correlation' })).toBe('Correlation (not named)');
  });

  test("the gas path names the correlations the engine used, read from the engine's own return", () => {
    const inputs = { ...DEFAULT_RESERVOIR, fluid: 'gas', ct: '', q: '5000' };
    const spec = buildReservoirInputs(inputs);
    expect(spec.error).toBeNull();
    // the reservoir carries the engine's source object itself
    expect(spec.reservoir.pvtSource).toBe(GAS_PVT_CORRELATIONS);
    const rows = byKey(buildInputsTable({ reservoirInputs: inputs, reservoirSpec: spec, completion: DEFAULT_COMPLETION }));
    const expected = gasPvtSourceText(spec.reservoir.pvtSource);
    expect(rows.mu.source).toBe(expected);
    expect(rows.z.source).toBe(expected);
    for (const name of [GAS_PVT_CORRELATIONS.z, GAS_PVT_CORRELATIONS.viscosity, GAS_PVT_CORRELATIONS.pseudoCriticals]) {
      expect(rows.mu.source).toContain(name);
    }
    expect(rows.mu.label).toBe('Gas viscosity mu at pi');
    expect(parseFloat(rows.mu.value)).toBeCloseTo(spec.reservoir.mu, 4);
    expect(parseFloat(rows.z.value)).toBeCloseTo(spec.reservoir.pvt.zOf(4800), 4);
    // blank ct in gas mode is the computed gas compressibility, and says so
    expect(rows.ct.source).toMatch(/Computed: gas compressibility at pi/);
    expect(parseFloat(rows.ct.value)).toBeCloseTo(spec.reservoir.ct, 7); // printed to four figures
    // gas gravity and temperature ARE inputs of the gas analysis
    expect(rows.gasGravity.value).toBe('0.65');
    expect(rows.temperature.value).toBe('180');
  });

  test('negative control: a different engine source changes the printed correlation', () => {
    expect(gasPvtSourceText({ kind: 'correlation', z: 'Hall-Yarborough', viscosity: 'Carr-Kobayashi-Burrows', pseudoCriticals: null }))
      .toBe('Correlation: Hall-Yarborough z-factor, Carr-Kobayashi-Burrows viscosity (computed by the studio)');
    expect(gasPvtSourceText({ kind: 'table' })).toBe('Supplied PVT table');
    expect(gasPvtSourceText(null)).toBeNull();
  });

  test('a Fluid Systems Studio handoff is named until the user states a source', () => {
    const pvtIntake = { fields: ['B', 'mu'], text: 'Correlation: Standing (Rs, Bo), Beggs-Robinson (viscosity), from Fluid Systems Studio' };
    const rows = byKey(table(DEFAULT_RESERVOIR, { pvtIntake }));
    expect(rows.B.source).toBe(pvtIntake.text);
    expect(rows.mu.source).toBe(pvtIntake.text);
    const stated = byKey(table(DEFAULT_RESERVOIR, { pvtIntake, inputMeta: { B: { source: 'lab' } } }));
    expect(stated.B.source).toBe('Measured (lab)');
  });
});

describe('WTA-R2-003 perforated interval, partial penetration and the skin split', () => {
  const reservoir = buildReservoirInputs(DEFAULT_RESERVOIR).reservoir; // h 45, rw 0.354
  const completion = { ...DEFAULT_COMPLETION, perfTopMd: '9850', perfBaseMd: '9865', payTopMd: '9850' };

  test('the split is the engine call, with the formula and method named', () => {
    const sb = buildSkinBreakdown({ totalSkin: 20, reservoir, completion, kvkhInput: '0.1' });
    const engine = papatzacosPseudoSkin({ h: 45, hp: 15, h1: 0, rw: 0.354, kvkh: 0.1 });
    expect(sb.status).toBe('ok');
    expect(sb.spp).toBe(engine.spp);
    expect(sb.mechanicalSkin).toBeCloseTo((15 / 45) * (20 - engine.spp), 12);
    // the identity s = (h/hp) s_d + s_pp closes on the reported numbers
    expect((45 / 15) * sb.mechanicalSkin + sb.spp).toBeCloseTo(20, 12);
    expect(sb.method).toBe('Papatzacos (1987)');
    expect(sb.formula).toMatch(/^s_pp = /);
    expect(sb.splitFormula).toBe('s_d = (hp/h) (s - s_pp)');
    expect(sb.kvkhDefaulted).toBe(false);
    const rows = skinBreakdownRows(sb);
    expect(rows[0]).toEqual(['Total skin s', '20.00', 'From the interpretation']);
    expect(rows[1]).toEqual(['Partial-penetration pseudo-skin s_pp', engine.spp.toFixed(2), 'Papatzacos (1987)']);
    expect(rows[2][0]).toBe('Mechanical (damage) skin s_d');
    expect(rows.find((r) => r[0] === 'kv/kh')).toEqual(['kv/kh', '0.1', 'Entered']);
  });

  test('kv/kh left blank uses the stated default and says it is assumed', () => {
    const sb = buildSkinBreakdown({ totalSkin: 20, reservoir, completion, kvkhInput: '' });
    expect(sb.kvkh).toBe(DEFAULT_KVKH);
    expect(sb.kvkhDefaulted).toBe(true);
    expect(sb.message).toMatch(/kv\/kh not entered: 0.1 is assumed/);
    expect(skinBreakdownRows(sb).find((r) => r[0] === 'kv/kh')[2]).toMatch(/Assumed default 0.1/);
    const row = byKey(buildInputsTable({ reservoirInputs: DEFAULT_RESERVOIR, reservoirSpec: buildReservoirInputs(DEFAULT_RESERVOIR), completion }));
    expect(row.kvkh.source).toMatch(/Assumed default 0.1/);
    expect(row.perfMd).toMatchObject({ value: '9850 to 9865', unit: 'ft', source: 'Entered' });
    expect(row.hp).toMatchObject({ value: '15', source: 'From the MD interval' });
  });

  test('hostile: no interval, perforation longer than h, zero kv/kh, missing h', () => {
    const none = buildSkinBreakdown({ totalSkin: 6.5, reservoir, completion: DEFAULT_COMPLETION, kvkhInput: '' });
    expect(none.status).toBe('not-entered');
    expect(none.message).toMatch(/Perforated interval not entered\. The skin is reported as a total and is not split\./);
    expect(skinBreakdownRows(none)).toEqual([
      ['Total skin s', '6.50', 'From the interpretation'],
      ['Partial-penetration pseudo-skin s_pp', EMPTY_VALUE, 'Not computed'],
      ['Mechanical (damage) skin s_d', EMPTY_VALUE, 'Not computed'],
    ]);

    const long = buildSkinBreakdown({ totalSkin: 6.5, reservoir, completion: { ...completion, perfBaseMd: '9920' }, kvkhInput: '0.1' });
    expect(long.status).toBe('refused');
    expect(long.code).toBe('interval-longer-than-pay');
    expect(long.message).toMatch(/perforated length is greater than net pay h\. The skin is not split\./);
    expect(Number.isNaN(long.spp)).toBe(true);
    expect(Number.isNaN(long.mechanicalSkin)).toBe(true);

    const zero = buildSkinBreakdown({ totalSkin: 6.5, reservoir, completion, kvkhInput: '0' });
    expect(zero.status).toBe('refused');
    expect(zero.code).toBe('no-anisotropy');
    expect(zero.kvkhDefaulted).toBe(false); // a typed zero is refused, never replaced by the default

    const noH = buildSkinBreakdown({ totalSkin: 6.5, reservoir: null, completion, kvkhInput: '0.1' });
    expect(noH.status).toBe('refused');

    const upside = buildSkinBreakdown({ totalSkin: 6.5, reservoir, completion: { ...completion, perfBaseMd: '9800' }, kvkhInput: '0.1' });
    expect(upside.status).toBe('refused');
    expect(upside.message).toMatch(/base of the perforated interval must be deeper than its top/);

    const half = buildCompletion({ ...DEFAULT_COMPLETION, perfTopMd: '9850' });
    expect(half).toMatchObject({ status: 'none', reason: 'Enter both the top and the base of the perforated interval.' });
  });

  test('perforations over the whole pay: no pseudo-skin and the mechanical skin is the total', () => {
    const sb = buildSkinBreakdown({ totalSkin: 6.5, reservoir, completion: { ...completion, perfBaseMd: '9895' }, kvkhInput: '' });
    expect(sb.status).toBe('full');
    expect(sb.spp).toBe(0);
    expect(sb.mechanicalSkin).toBeCloseTo(6.5, 12);
    expect(sb.message).toMatch(/cover the whole net pay/);
  });

  test('skin withheld: the geometric part is still given, the mechanical part is n/a', () => {
    const sb = buildSkinBreakdown({ totalSkin: null, reservoir, completion, kvkhInput: '0.1' });
    expect(sb.status).toBe('ok');
    expect(sb.spp).toBeGreaterThan(0);
    const rows = skinBreakdownRows(sb);
    expect(rows[0][1]).toBe(EMPTY_VALUE);
    expect(rows[2][1]).toBe(EMPTY_VALUE);
  });

  test('true vertical depths win over measured depths; the top of pay sets h1', () => {
    const tvd = buildCompletion({ perfTopMd: '10200', perfBaseMd: '10230', payTopMd: '10190', perfTopTvd: '9860', perfBaseTvd: '9880', payTopTvd: '9852', tvdSource: 'Survey of registry well W-7' });
    expect(tvd).toMatchObject({ status: 'ok', basis: 'TVD', hp: 20, h1: 8, h1Assumed: false });
    const md = buildCompletion({ ...DEFAULT_COMPLETION, perfTopMd: '9850', perfBaseMd: '9865' });
    expect(md).toMatchObject({ status: 'ok', basis: 'MD', hp: 15, h1: 0, h1Assumed: true });
    const sb = buildSkinBreakdown({ totalSkin: 10, reservoir, completion: { ...DEFAULT_COMPLETION, perfTopMd: '9850', perfBaseMd: '9865' }, kvkhInput: '0.1' });
    expect(sb.message).toMatch(/measured depths, which is exact for a vertical hole only/);
    expect(sb.message).toMatch(/Top of net pay not entered/);
  });

  test('gas: the total is the apparent skin and the remainder is named for what it holds', () => {
    const sb = buildSkinBreakdown({ totalSkin: 8, reservoir, completion, kvkhInput: '0.1', isGas: true });
    expect(sb.totalLabel).toBe("Apparent skin s'");
    expect(sb.mechanicalLabel).toBe('Mechanical and rate-dependent skin');
  });

  test('SI display converts the lengths in the table', () => {
    const sb = buildSkinBreakdown({ totalSkin: 20, reservoir, completion, kvkhInput: '0.1' });
    const rows = skinBreakdownRows(sb, 'si');
    expect(rows.find((r) => /^Net pay h/.test(r[0]))).toEqual(['Net pay h (m)', '13.716', 'Input']);
    expect(rows.find((r) => /^Perforated length/.test(r[0]))[1]).toBe('4.572');
  });
});

describe('WTA-R2-004 well and test identification', () => {
  const config = buildTestConfig(DEFAULT_TEST_CONFIG).config;

  test('everything asked for is a row; what is missing is n/a', () => {
    const rows = Object.fromEntries(buildIdentificationRows({
      projectName: 'Obodo-7 DST 2', wellName: 'Obodo-7', fieldName: 'Obodo', analyst: 'A. Analyst',
      identification: { ...DEFAULT_IDENTIFICATION, licence: 'OML 143', zone: 'D-3 sand', testDateStart: '2026-09-14', testDateEnd: '2026-09-17', operation: 'dst' },
      completion: { ...DEFAULT_COMPLETION, perfTopMd: '9850', perfBaseMd: '9865', perfTopTvd: '9601', perfBaseTvd: '9615.5' },
      config,
    }));
    expect(rows).toMatchObject({
      Project: 'Obodo-7 DST 2', Well: 'Obodo-7', Field: 'Obodo', Licence: 'OML 143', 'Zone or sand': 'D-3 sand',
      Analyst: 'A. Analyst', 'Test type': 'Pressure buildup, drill stem test (DST)', 'Test dates': '2026-09-14 to 2026-09-17',
      'Perforations, MD': '9850 to 9865 ft', 'Perforations, TVD': '9601 to 9615.5 ft',
    });
    const blank = Object.fromEntries(buildIdentificationRows({ config }));
    expect(blank.Project).toBe('Untitled interpretation');
    for (const k of ['Well', 'Field', 'Licence', 'Zone or sand', 'Analyst', 'Test dates', 'Perforations, MD', 'Perforations, TVD']) {
      expect(blank[k]).toBe(EMPTY_VALUE);
    }
    expect(blank['Test type']).toBe('Pressure buildup');
  });

  test('test type follows the four types the studio supports', () => {
    const t = (testType, operation) => testTypeText(buildTestConfig({ ...DEFAULT_TEST_CONFIG, testType }).config, { operation });
    expect(t('drawdown', '')).toBe('Pressure drawdown');
    expect(t('falloff', 'injectivity')).toBe('Injection falloff, injectivity test');
    expect(t('injection', 'production')).toBe('Injection test, production test');
    expect(testDatesText({ testDateStart: '2026-09-14' })).toBe('2026-09-14');
    expect(testDatesText({})).toBe(EMPTY_VALUE);
  });

  test('SI: the depths convert', () => {
    const rows = Object.fromEntries(buildIdentificationRows({
      completion: { ...DEFAULT_COMPLETION, perfTopMd: '10000', perfBaseMd: '10050' }, config, unitSystem: 'si',
    }));
    expect(rows['Perforations, MD']).toBe('3048 to 3063.2 m');
  });
});

describe('WTA-R2-005 flow and shut-in summary', () => {
  const sample = generateSampleBuildup();
  const spec = buildReservoirInputs(DEFAULT_RESERVOIR);
  const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, tp: '36', pwfShutIn: String(sample.pwfShutIn) }).config;
  const prepared = prepareTestData({ gaugeRows: sample.gaugeRows, reservoir: spec.reservoir, config });
  const lastDt = prepared.points[prepared.points.length - 1].time;

  test('one row per period from the rate history, with what the user added', () => {
    const fs = buildFlowSummary({
      rateRows: [{ t: '0', q: '450' }, { t: '36', q: '0' }], config, reservoir: spec.reservoir, prepared,
      periodMeta: { [periodKey(0)]: { choke: '32', recovered: '660', remark: 'clean-up complete at 4 hr' } },
    });
    expect(fs.derived).toBe(false);
    expect(fs.rows).toHaveLength(2);
    expect(fs.rows[0]).toMatchObject({ index: 1, typeLabel: 'Flow', start: '0', duration: '36', choke: '32', rate: '450.0', volume: '675.0', cumulative: '675.0', recovered: '660', remark: 'clean-up complete at 4 hr' });
    // the shut-in runs to the end of the gauge record; nothing was added to it
    expect(fs.rows[1]).toMatchObject({ index: 2, typeLabel: 'Shut-in', start: '36', duration: plain(lastDt), choke: EMPTY_VALUE, rate: '0.0', volume: '0', cumulative: '675.0', recovered: EMPTY_VALUE });
    expect(flowSummaryHead(fs)).toEqual(['Period', 'Type', 'Start (hr)', 'Duration (hr)', 'Choke (1/64 in)', 'Rate (STB/D)', 'Volume (STB)', 'Cumulative (STB)', 'Recovered (bbl)', 'Remark']);
    expect(flowSummaryBody(fs)[1][9]).toBe(EMPTY_VALUE);
  });

  test('hostile: no rate history, the periods come from the test setup and the table says so', () => {
    const fs = buildFlowSummary({ rateRows: [], config, reservoir: spec.reservoir, prepared });
    expect(fs.derived).toBe(true);
    expect(fs.note).toMatch(/No rate history was entered: the periods are taken from the test setup/);
    expect(fs.rows.map((r) => r.typeLabel)).toEqual(['Flow', 'Shut-in']);
    expect(fs.rows[0]).toMatchObject({ duration: '36', rate: '450.0', volume: '675.0', choke: EMPTY_VALUE, recovered: EMPTY_VALUE });
  });

  test('hostile: no rate history and no reservoir inputs gives an empty table with the reason', () => {
    const fs = buildFlowSummary({ rateRows: [], config, reservoir: null, prepared });
    expect(fs).toMatchObject({ empty: true, rows: [] });
    expect(fs.note).toMatch(/No rate history and no test setup/);
  });

  test('a multi-rate drawdown: each period with its volume, the last one ended by the gauge record', () => {
    const dd = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testType: 'drawdown' }).config;
    const fs = buildFlowSummary({
      rateRows: [{ t: '0', q: '200' }, { t: '12', q: '400' }, { t: '24', q: '600' }],
      config: dd, reservoir: spec.reservoir, prepared: { points: [{ time: 0.1 }, { time: 30 }] },
    });
    expect(fs.rows.map((r) => r.volume)).toEqual(['100.0', '200.0', '150.0']);
    expect(fs.rows.map((r) => r.cumulative)).toEqual(['100.0', '300.0', '450.0']);
    expect(fs.rows[2].duration).toBe('6');
  });

  test('a period with no known end is n/a, never zero', () => {
    const fs = buildFlowSummary({
      rateRows: [{ t: '0', q: '450' }, { t: '36', q: '0' }, { t: '60', q: '300' }], config, reservoir: spec.reservoir, prepared,
    });
    expect(fs.rows[2]).toMatchObject({ duration: EMPTY_VALUE, volume: EMPTY_VALUE, cumulative: EMPTY_VALUE });
  });

  test('injection tests are labelled as injection; SI and gas convert the columns', () => {
    const inj = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testType: 'falloff', tp: '48' }).config;
    const fs = buildFlowSummary({ rateRows: [], config: inj, reservoir: spec.reservoir, prepared, unitSystem: 'si' });
    expect(fs.rows.map((r) => r.typeLabel)).toEqual(['Injection', 'Shut-in']);
    expect(parseFloat(fs.rows[0].rate)).toBeCloseTo(450 * 0.158987294928, 1);
    expect(flowSummaryHead(fs, 'si')[5]).toBe('Rate (m3/d)');
    const gas = buildReservoirInputs({ ...DEFAULT_RESERVOIR, fluid: 'gas', ct: '', q: '5000' });
    const gfs = buildFlowSummary({ rateRows: [], config, reservoir: gas.reservoir, prepared });
    expect(flowSummaryHead(gfs)[6]).toBe('Volume (Mscf)');
    expect(gfs.rows[0].volume).toBe('7500.0');
  });
});

describe('WTA-R2-002 the Fluid Systems Studio handoff names how its PVT was computed', () => {
  const { pvtIntakeFromBackbone } = require('@/utils/welltest/reportModel');
  const { analyzeFluidSystem, DEFAULT_FLUID_INPUTS, correlationLabels, normalizeFluid } = require('@/utils/fluidStudioCalculations');

  test('the backbone the fluid app builds carries its own correlation names, and the report prints them', () => {
    const inputs = DEFAULT_FLUID_INPUTS || { streamA: { blackOil: { api: 35, gasSg: 0.75, temp: 200, gor: 600, salinity: 0, pb: '' } }, correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' }, feed: { oilRate: 1000 } };
    const withVb = { ...inputs, correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' } };
    const backbone = analyzeFluidSystem(withVb).backbone;
    expect(backbone.source).toBe('black-oil-correlations');
    expect(backbone.correlations).toEqual(correlationLabels(normalizeFluid(withVb)));
    expect(backbone.correlations).toEqual({ pb_rs_bo: 'Vasquez-Beggs', viscosity: 'Beggs-Robinson' });
    const intake = pvtIntakeFromBackbone(backbone);
    expect(intake.patch.B).toBe(String(backbone.bo_at_pb));
    expect(intake.patch.mu).toBe(String(backbone.mu_o_at_pb));
    expect(intake.intake.text).toBe('Correlation: Vasquez-Beggs (Rs, Bo), Beggs-Robinson (viscosity), at the bubble point, from Fluid Systems Studio');
    const inputsNow = { ...DEFAULT_RESERVOIR, ...intake.patch };
    const rows = byKey(buildInputsTable({ reservoirInputs: inputsNow, reservoirSpec: buildReservoirInputs(inputsNow), completion: DEFAULT_COMPLETION, pvtIntake: intake.intake }));
    expect(rows.B.source).toBe(intake.intake.text);
    expect(rows.mu.source).toBe(intake.intake.text);
    expect(rows.apiGravity.source).toBe('Input of the Fluid Systems Studio fluid model');
    expect(rows.gor.value).not.toBe(EMPTY_VALUE);
    // negative control: a different choice in the fluid app changes what is printed
    const standing = analyzeFluidSystem({ ...inputs, correlations: { pb_rs_bo: 'standing', viscosity: 'beal_cook_spillman' } }).backbone;
    expect(pvtIntakeFromBackbone(standing).intake.text).toMatch(/^Correlation: Standing \(Rs, Bo\), Beal-Cook-Spillman \(viscosity\)/);
  });

  test('an EOS backbone and a backbone that does not say are reported as what they are', () => {
    expect(pvtIntakeFromBackbone({ source: 'eos', bo_at_pb: 1.31, mu_o_at_pb: 0.6 }).intake.text)
      .toBe('Equation of state (compositional model), at the bubble point, from Fluid Systems Studio');
    expect(pvtIntakeFromBackbone({ bo_at_pb: 1.31 }).intake.text)
      .toBe('PVT model, method not stated by the handoff, at the bubble point, from Fluid Systems Studio');
    expect(pvtIntakeFromBackbone({})).toBeNull();
    expect(pvtIntakeFromBackbone(null)).toBeNull();
  });
});
