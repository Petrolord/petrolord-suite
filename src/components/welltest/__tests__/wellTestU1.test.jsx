/**
 * Well Test Analysis Studio, Reservoir round Step 1 (WTA-U1, 2026-10-04).
 * Findings and outcomes: docs/upgrade/WellTestAnalysis-UPGRADE.md.
 *
 * The real provider is mounted, the sample loaded, and the PDF built by the
 * function the Export button calls, then read back with poppler. Every test
 * here was written to fail on the code as it stood at origin/main f32577679
 * and pass after its fix.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { buildWellTestPdf, collectReportArgs } from '@/utils/wellTestReportExport';
import wtGoldens from '@/utils/welltest/__tests__/goldens.json';
import { mountStudio, chartLogo, readPdf } from './reportTestKit';

const AT = new Date('2026-10-04T09:00:00Z');
const logo = chartLogo();
const build = (ctx, opts = {}) => buildWellTestPdf(collectReportArgs(ctx), { logo, generatedAt: AT, ...opts });
const flat = (s) => s.replace(/\s+/g, ' ');
const n = (s) => Number(String(s).replace(/,/g, ''));

async function sample(setup = null) {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  if (setup) await studio.act(setup);
  return studio;
}

describe('WTA-U1-001: kh in the SI report and on the screens', () => {
  test('the SI report prints kh in md-m with h in metres; oilfield keeps md-ft', async () => {
    const studio = await sample((c) => c.setMatchField('k', '85'));
    const kh = studio.ctx.derivedKpis.kh; // oilfield state, md-ft
    expect(kh).toBeCloseTo(85 * 45, 6);
    const field = readPdf(build(studio.ctx).doc);
    expect(flat(field.text)).toMatch(/kh \(md-ft\) 3,830/);
    field.close?.();
    await studio.act((c) => c.setUnitSystem('si'));
    const si = readPdf(build(studio.ctx).doc);
    const t = flat(si.text);
    expect(t).not.toMatch(/md-ft/);
    const m = t.match(/kh \(md-m\) ([\d,.]+)/);
    expect(m).not.toBeNull();
    expect(n(m[1])).toBeCloseTo(85 * 45 * 0.3048, -1); // 1,166 md-m
    si.close?.();
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-002: the RTA productivity index under SI', () => {
  test('J is converted with the SI unit it is printed with (oil)', async () => {
    const studio = await sample((c) => {
      c.setRtaRows(wtGoldens.fixtures.rtaOilDecline.rows.map((r) => ({ t: String(r.t), q: String(r.q), pwf: String(r.pwf) })));
    });
    const J = studio.ctx.rtaResult.fmb.J; // STB/D/psi
    expect(J).toBeGreaterThan(0);
    await studio.act((c) => c.setUnitSystem('si'));
    const pdf = readPdf(build(studio.ctx).doc);
    const t = flat(pdf.text);
    const m = t.match(/Productivity index J \(m3\/d per kPa\) ([\d.e+-]+)/);
    expect(m).not.toBeNull();
    // 1 STB/D/psi = 0.158987294928 / 6.894757293168 m3/d/kPa
    expect(Number(m[1]) / (J * 0.0230591576)).toBeCloseTo(1, 2);
    pdf.close?.();
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-003: gas z-factor on Dranchuk-Abou-Kassem from the engines', () => {
  const gasSample = async () => sample((c) => {
    c.setReservoirField('fluid', 'gas');
    c.setReservoirField('ct', '');
    c.setReservoirField('q', '5000');
  });

  test('a new gas test runs on the canonical Dranchuk-Abou-Kassem z, and the report names it', async () => {
    const { buildGasPvtTable, makePseudoPressure } = require('@/utils/welltest/gas');
    const { gasZFactor } = require('../../../../packages/engines/engines/fluid/blackOil.ts');
    const studio = await gasSample();
    const r = studio.ctx.reservoirSpec.reservoir;
    expect(studio.ctx.reservoirInputs.gasZMethod).toBe('dranchuk_abou_kassem');
    expect(r.pvtSource.z).toBe('Dranchuk-Abou-Kassem');
    // the studio's table IS the engine's, at the pressure grid it builds
    const ref = makePseudoPressure(buildGasPvtTable({ gasGravity: 0.65, tempF: 180, pMax: Math.max(4800 * 1.5, 2000), zMethod: 'dranchuk_abou_kassem' }));
    expect(r.mu).toBe(ref.muOf(4800));
    expect(r.pvt.table.find((x) => x.p > 4000).z).toBe(gasZFactor(r.pvt.table.find((x) => x.p > 4000).p, 180, 0.65, 'dranchuk_abou_kassem'));
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Dranchuk-Abou-Kassem z-factor/);
    expect(t).not.toMatch(/Papay/);
    studio.unmount();
  }, 600000);

  test('a gas project saved before this change opens on Papay with its numbers unchanged, and says so', async () => {
    const studio = await gasSample();
    const saved = studio.ctx.serializeInputs();
    const old = { ...saved, reservoirInputs: { ...saved.reservoirInputs } };
    delete old.reservoirInputs.gasZMethod; // a payload of the earlier release
    await studio.act((c) => c.importProjectPayload(old));
    expect(studio.ctx.reservoirInputs.gasZMethod).toBe('papay');
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.z).toBe('Papay');
    const { buildGasPvtTable, makePseudoPressure } = require('@/utils/welltest/gas');
    const before = makePseudoPressure(buildGasPvtTable({ gasGravity: 0.65, tempF: 180, pMax: Math.max(4800 * 1.5, 2000) }));
    expect(studio.ctx.reservoirSpec.reservoir.mu).toBe(before.muOf(4800)); // the earlier release's table, unchanged
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Papay z-factor/);
    studio.unmount();
  }, 600000);

  test('changing the z method withdraws an earlier auto-fit (it changes m(p))', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.runAutoFit());
    expect(studio.ctx.fitStale).toBe(false);
    await studio.act((c) => c.setReservoirField('gasZMethod', 'hall_yarborough'));
    expect(studio.ctx.fitStale).toBe(true);
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-004: company and software build in the report header', () => {
  test('the typed company prints; without one the organisation name does; the build is stamped', async () => {
    const studio = await sample((c) => c.setIdentificationField('company', 'Ekene Energy Ltd'));
    let t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Company Ekene Energy Ltd/);
    expect(t).toMatch(/Software build Petrolord Suite \S+/);
    await studio.act((c) => c.setIdentificationField('company', ''));
    const args = { ...collectReportArgs(studio.ctx), organizationName: 'Lordsway Energy' };
    t = flat(readPdf(buildWellTestPdf(args, { logo, generatedAt: AT }).doc).text);
    expect(t).toMatch(/Company Lordsway Energy/);
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-005: gauge depth and the pressure datum, stated, with no correction applied', () => {
  test('the report prints the gauge depth, the datum, that no correction was applied, and how gauge pressures became absolute', async () => {
    const studio = await sample((c) => {
      c.setCompletionField('gaugeDepthMd', '9800');
      c.setCompletionField('gaugeDepthTvd', '9560');
      c.setCompletionField('datumDepthTvdss', '9500');
      c.setGaugeImport({ fileName: 'gauge-B12.csv', pressureUnit: 'psig', timeUnit: 'hr', temperatureUnit: null, count: 45, skipped: 2 });
    });
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Gauge, datum and pressure basis/);
    expect(t).toMatch(/Gauge depth 9800 ft MD, 9560 ft TVD/);
    expect(t).toMatch(/Pressure datum 9500 ft TVDSS/);
    expect(t).toMatch(/Correction to the datum None applied: every pressure in this report is at the gauge depth/);
    expect(t).toMatch(/read in psig; one standard atmosphere \(14\.696 psi\) was added to each reading/);
    expect(t).toMatch(/gauge-B12\.csv/);
    // the Report tab has the same rows
    expect(studio.ctx.pressureBasisRows.map((r) => r[0])).toEqual(expect.arrayContaining(['Gauge depth', 'Pressure datum', 'Correction to the datum', 'Absolute or gauge']));
    studio.unmount();
  }, 600000);

  test('not entered prints n/a and still says no correction was applied; the SI report converts the depths', async () => {
    const studio = await sample((c) => c.setUnitSystem('si'));
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Gauge depth n\/a/);
    expect(t).toMatch(/Pressure datum Not stated/);
    expect(t).toMatch(/Correction to the datum None applied/);
    expect(t).toMatch(/Absolute or gauge Absolute: the synthetic sample test/);
    await studio.act((c) => c.setCompletionField('gaugeDepthMd', '10000'));
    expect(flat(readPdf(build(studio.ctx).doc).text)).toMatch(/Gauge depth 3048 m MD/);
    studio.unmount();
  }, 600000);

  test('the gauge record of a project saved before this round says it was not recorded', async () => {
    const studio = await sample();
    const old = { ...studio.ctx.serializeInputs() };
    delete old.gaugeImport;
    await studio.act((c) => c.importProjectPayload(old));
    expect(flat(readPdf(build(studio.ctx).doc).text)).toMatch(/Absolute or gauge Not recorded with this project/);
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-006: the gauge readings left out of the analysis, each with its reason', () => {
  test('readings before the shut-in, spikes, the shut-in instant and thinning are listed and close on the record', async () => {
    const studio = await sample((c) => {
      // a gauge record with 6 readings of the flowing period before the
      // shut-in and two spikes in the buildup
      const rows = c.gaugeRows.map((r) => ({ ...r, t: r.t + 2 }));
      const before = [0.5, 0.8, 1.1, 1.4, 1.7, 1.95].map((t) => ({ t, p: 4531 - (2 - t) }));
      rows[20] = { ...rows[20], p: rows[20].p + 400 };
      rows[30] = { ...rows[30], p: rows[30].p - 350 };
      c.setGaugeRows([...before, { t: 2, p: 4530.8 }, ...rows]);
      c.setTestField('testStartTime', '2');
      c.setTestField('pointsPerDecade', '8');
    });
    const ex = studio.ctx.prepared.exclusions;
    expect(ex.before.count).toBe(6);
    expect(ex.atShutIn).toBe(1);
    expect(ex.spikes.length).toBe(2);
    expect(ex.thinned).toBeGreaterThan(0);
    // every reading is accounted for, once
    expect(ex.before.count + ex.atShutIn + ex.spikes.length + ex.thinned + ex.notAboveBase + studio.ctx.prepared.points.length).toBe(studio.ctx.gaugeRows.length - ex.unreadable);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Gauge data used and left out/);
    expect(t).toMatch(/Before the shut-in \(gauge clock 0\.5 to 1\.95 hr\) 6 Left out: the preceding flow period/);
    expect(t).toMatch(/Spike filter 2 Left out: more than 6 robust standard deviations from the five-point median/);
    expect(t).toMatch(/Spikes removed \(shut-in time dt, hr; psi\)/);
    expect(t).toMatch(/Analysis points \d+ Used/);
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-007: the limits of the method in the report, with out-of-range inputs flagged', () => {
  test('an oil report states the general limits', async () => {
    const studio = await sample();
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Method and its limits/);
    expect(t).toMatch(/Single-phase flow of a slightly compressible liquid/);
    expect(t).toMatch(/Constant wellbore storage/);
    expect(t).toMatch(/no limited-entry \(spherical flow\) model/);
    expect(t).toMatch(/at the gauge depth/);
    studio.unmount();
  }, 600000);

  test('a gas report gives the reduced state of the test against the window of its z method, and flags it outside', async () => {
    const studio = await sample((c) => {
      c.setReservoirField('fluid', 'gas');
      c.setReservoirField('ct', '');
      c.setReservoirField('q', '5000');
    });
    let t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Dranchuk-Abou-Kassem z-factor: Tpr 1\.\d+ and ppr [\d.]+ to [\d.]+ at this test, inside the window it was checked over against the Standing-Katz chart \(Tpr 1\.2 to 3, ppr 0\.2 to 15;/);
    // a cold, heavy gas takes Tpr below 1.2: flagged
    await studio.act((c) => { c.setReservoirField('tempF', '60'); c.setReservoirField('gasGravity', '1.0'); });
    t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/OUTSIDE the window/);
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-008: a rate history that disagrees with the test rate or tp is stated', () => {
  test('q changed after the rate history was entered: the report and the Data tab say the analysis uses q', async () => {
    const studio = await sample((c) => c.setReservoirField('q', '500'));
    expect(studio.ctx.flowSummary.mismatch).toEqual([expect.stringMatching(/test rate q \(500 STB\/D\) differs from the last rate of the rate history \(450 STB\/D\); the analysis uses q/)]);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/differs from the last rate of the rate history/);
    await studio.act((c) => { c.setReservoirField('q', '450'); c.setTestField('tp', '30'); });
    expect(studio.ctx.flowSummary.mismatch).toEqual([expect.stringMatching(/producing time tp \(30 hr\) differs from the shut-in time of the rate history \(36 hr\)/)]);
    await studio.act((c) => c.setTestField('tp', '36'));
    expect(studio.ctx.flowSummary.mismatch).toEqual([]);
    studio.unmount();
  }, 600000);
});
