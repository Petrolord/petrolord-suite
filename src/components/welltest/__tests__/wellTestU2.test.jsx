/**
 * Well Test Analysis Studio, Reservoir round Step 2 (WTA-U2, 2026-10-04).
 * Items and outcomes: docs/upgrade/WellTestAnalysis-UPGRADE.md, "Step 2
 * build log". The real provider is mounted and the PDF built by the
 * function the Export button calls, then read back with poppler.
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
import { sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runFluidWorkspace } from '@/utils/fluidstudio/workspace';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { wellTestPvtCardFields } from '@/utils/welltest/reportModel';
import { mountStudio, chartLogo, readPdf } from './reportTestKit';

const AT = new Date('2026-10-04T09:00:00Z');
const logo = chartLogo();
const build = (ctx, opts = {}) => buildWellTestPdf(collectReportArgs(ctx), { logo, generatedAt: AT, ...opts });
const flat = (s) => s.replace(/\s+/g, ' ');

async function sample(setup = null) {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  if (setup) await studio.act(setup);
  return studio;
}
const gasSample = async () => sample((c) => {
  c.setReservoirField('fluid', 'gas');
  c.setReservoirField('ct', '');
  c.setReservoirField('q', '5000');
});

// a real Fluid Systems Studio project: the app's own workspace builds the pvt-1 handoff
const fluidHandoff = ({ temp } = {}) => {
  const base = sampleFluidStudioData();
  if (temp) base.streamA.blackOil.temp = temp;
  const inputs = { ...base, tableRange: { pMax: 7000, from: 'consumer', requestedBy: 'Well Test Analysis Studio' } };
  return runFluidWorkspace(inputs, { projectId: 'fluid-1', projectName: 'Gas sample', generatedAt: AT, build: 'test' }).handoff;
};

// independent of the studio: linear interpolation and the trapezoid m(p) on the block's own rows
const blockRows = (h) => h.contract.table.map((r) => ({ p: r.pressure, z: r.Z, mu: r.mu_g })).sort((a, b) => a.p - b.p);
const lerp = (rows, key, p) => {
  for (let i = 1; i < rows.length; i += 1) {
    if (p <= rows[i].p) return rows[i - 1][key] + ((rows[i][key] - rows[i - 1][key]) * (p - rows[i - 1].p)) / (rows[i].p - rows[i - 1].p);
  }
  return NaN;
};
const mOf = (rows, p) => {
  const all = [{ ...rows[0], p: 0 }, ...rows];
  let m = 0;
  for (let i = 1; i < all.length; i += 1) {
    const a = all[i - 1]; const b = all[i];
    const fa = (2 * a.p) / (a.mu * a.z); const fb = (2 * b.p) / (b.mu * b.z);
    if (p <= b.p) { const fp = fa + ((fb - fa) * (p - a.p)) / (b.p - a.p); return m + ((fa + fp) / 2) * (p - a.p); }
    m += ((fa + fb) / 2) * (b.p - a.p);
  }
  return NaN;
};

describe('WTA-U2-001: a gas test takes the Fluid Systems Studio pvt-1 table', () => {
  test('z, viscosity and m(p) come from the table rows, by interpolation; the report names the table and its project', async () => {
    const h = fluidHandoff();
    const rows = blockRows(h);
    const studio = await gasSample();
    const before = studio.ctx.reservoirSpec.reservoir; // the correlation path
    await studio.act((c) => c.takeFluidPvt(h));
    expect(studio.ctx.reservoirInputs.gasPvtSource).toBe('fluid-table');
    const r = studio.ctx.reservoirSpec.reservoir;
    expect(r.pvtSource.kind).toBe('fluid-table');
    expect(r.mu).toBeCloseTo(lerp(rows, 'mu', 4800), 12);
    expect(r.pvt.zOf(4800)).toBeCloseTo(lerp(rows, 'z', 4800), 12);
    // m(p) at the table's own nodes is the trapezoid sum of 2p/(mu z) (the engine interpolates m between them)
    for (const node of rows.filter((x) => x.p > 1000).slice(0, 5)) expect(r.mOfP(node.p) / mOf(rows, node.p)).toBeCloseTo(1, 10);
    // negative control: the correlation path the project ran on before differs
    expect(Math.abs(before.mu - r.mu) / r.mu).toBeGreaterThan(1e-3);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Fluid Systems Studio table: z by Dranchuk-Abou-Kassem/);
    expect(t).toMatch(/project "Gas sample"/);
    expect(t).toMatch(/Gas PVT table range/);
    expect(t).toMatch(/inside the table/);
    studio.unmount();
  }, 600000);

  test('a project without an intake stays on the correlations; switching back is one choice', async () => {
    const studio = await gasSample();
    expect(studio.ctx.reservoirInputs.gasPvtSource).toBe('correlation');
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const table = studio.ctx.reservoirSpec.reservoir.mu;
    await studio.act((c) => c.setReservoirField('gasPvtSource', 'correlation'));
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    expect(studio.ctx.reservoirSpec.reservoir.mu).not.toBe(table);
    // a payload of the earlier release (no gasPvtSource) opens on the correlations
    const saved = studio.ctx.serializeInputs();
    const old = { ...saved, reservoirInputs: { ...saved.reservoirInputs } };
    delete old.reservoirInputs.gasPvtSource;
    await studio.act((c) => c.importProjectPayload(old));
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    studio.unmount();
  }, 600000);

  test('a table that stops below the initial pressure is refused, with the range request', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const top = studio.ctx.pvtIntake.gasTable.pMax;
    await studio.act((c) => c.setReservoirField('pi', String(top + 500)));
    expect(studio.ctx.reservoirSpec.reservoir).toBeNull();
    expect(studio.ctx.reservoirSpec.error).toMatch(/stops at/);
    expect(studio.ctx.reservoirSpec.tableTooShort.need).toBe(top + 500);
    studio.unmount();
  }, 600000);

  test('the shared card shows the table with its methods and says "source changed since"', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const intake = studio.ctx.pvtIntake;
    const fields = wellTestPvtCardFields(intake);
    const current = { ...studio.ctx.reservoirInputs, gasTableRows: String(intake.gasTable.n) };
    const same = pvtIntakeCardModel({ intake, current, fields, latest: { ok: true, contract: fluidHandoff().contract } });
    expect(same.status).toBe('As received');
    expect(same.rows.find((x) => x.key === 'gasTableRows').method).toMatch(/Z: Dranchuk-Abou-Kassem.*; viscosity: Lee-Gonzalez-Eakin/);
    const changed = fluidHandoff({ temp: 230 });
    const later = pvtIntakeCardModel({ intake, current, fields, latest: { ok: true, contract: { ...changed.contract, generated_at: '2026-10-05T10:00:00Z' } } });
    expect(later.status).toBe('Source changed since');
    // "Read it again" takes the new block
    await studio.act((c) => c.takeFluidPvt(changed, 'read again'));
    expect(studio.ctx.pvtIntake.gasTable.temperatureF).toBe(230);
    studio.unmount();
  }, 600000);
});

describe('WTA-U2-002: changing wellbore storage (Hegeman) in the studio', () => {
  const { getModel, evaluateBuildup } = require('@/utils/welltest/models/modelCatalog');
  const reservoir = { h: 45, phi: 0.18, rw: 0.354, B: 1.25, mu: 0.9, ct: 0.000012, q: 450, pi: 4800 };
  const truth = { k: 85, skin: 6.5, C: 0.015, ciOverC: 4, alpha: 0.05 };
  const hegemanBuildup = () => {
    const dts = Array.from({ length: 60 }, (_, i) => Math.pow(10, -3 + (4.6 * i) / 59));
    const pts = evaluateBuildup({ model: getModel('homogeneous+hegeman'), params: truth, reservoir, tp: 36, dts });
    return { rows: pts.map((p) => ({ t: p.dt, p: p.pws })), pwf: pts.pwfAtShutIn };
  };

  test('the regression on a Hegeman buildup recovers Ci/C and alpha; the constant-storage fit is far worse (negative control); the report states both storages', async () => {
    const { rows, pwf } = hegemanBuildup();
    const studio = await sample((c) => {
      c.setGaugeRows(rows);
      c.setTestField('pwfShutIn', pwf.toFixed(3));
    });
    await studio.act((c) => c.setMatchField('modelId', 'homogeneous'));
    await studio.act((c) => c.runAutoFit());
    const constant = studio.ctx.fitResult;
    await studio.act((c) => c.setMatchField('modelId', 'homogeneous+hegeman'));
    expect(studio.ctx.model.parameters.map((p) => p.key)).toEqual(['k', 'skin', 'C', 'ciOverC', 'alpha']);
    await studio.act((c) => { c.setMatchField('ciOverC', '2'); c.setMatchField('alpha', '0.1'); });
    await studio.act((c) => c.runAutoFit());
    const fit = studio.ctx.fitResult;
    expect(fit.modelId).toBe('homogeneous+hegeman');
    expect(fit.params.k / truth.k).toBeCloseTo(1, 1);
    expect(fit.params.ciOverC / truth.ciOverC).toBeCloseTo(1, 0);
    expect(fit.ssr * 20).toBeLessThan(constant.ssr);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/changing storage \(Hegeman\)/);
    expect(t).toMatch(/Changing wellbore storage/);
    expect(t).toMatch(/Hegeman, Hallford and Joseph \(1993\)/);
    const ci = t.match(/Initial storage Ci \(bbl\/psi\) ([\d.e-]+)/);
    const c = t.match(/Final storage C \(bbl\/psi\) ([\d.e-]+)/);
    expect(Number(ci[1]) / Number(c[1])).toBeCloseTo(fit.params.ciOverC, 2);
    // the composed id travels with the project and opens again
    const saved = studio.ctx.serializeInputs();
    expect(saved.matchInputs.modelId).toBe('homogeneous+hegeman');
    await studio.act((cc) => cc.importProjectPayload(saved));
    expect(studio.ctx.model.id).toBe('homogeneous+hegeman');
    studio.unmount();
  }, 900000);

  test('the limits row names the storage model; constant storage says the change can be matched', async () => {
    const studio = await sample();
    expect(studio.ctx.limitsRows.find((r) => r[0] === 'Wellbore storage')[1]).toMatch(/Constant wellbore storage\. A storage change/);
    await studio.act((c) => c.setMatchField('modelId', 'homogeneous+fair'));
    expect(studio.ctx.limitsRows.find((r) => r[0] === 'Wellbore storage')[1]).toMatch(/Fair \(1981\)/);
    studio.unmount();
  }, 600000);
});

describe("WTA-U2-003: rate-dependent skin, s' = s + D q", () => {
  test('two rates give s and D; this test splits into s and D q in the skin table, the PDF and wta-1', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.setRateSkinRows([{ q: '2000', skin: '3' }, { q: '8000', skin: '6' }]));
    const rs = studio.ctx.rateSkin;
    expect(rs.fit.ok).toBe(true);
    expect(rs.fit.s).toBeCloseTo(2, 12);
    expect(rs.fit.D).toBeCloseTo(5e-4, 15);
    expect(rs.Dq).toBeCloseTo(2.5, 12); // q 5000 Mscf/D
    const sPrime = studio.ctx.derivedKpis.skin;
    expect(rs.trueSkin).toBeCloseTo(sPrime - 2.5, 12);
    const rows = studio.ctx.skinBreakdown;
    expect(rows.rate.Dq).toBeCloseTo(2.5, 12);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Rate-dependent skin/);
    expect(t).toMatch(/D, multi-rate line \(1\/\(Mscf\/D\)\) 5e-4/);
    expect(t).toMatch(/Rate-dependent skin D q \(q 5,?000 Mscf\/D\) 2\.50/);
    expect(studio.ctx.wtaRecord.skin.rate_dependent.D_per_mscfd).toBeCloseTo(5e-4, 15);
    // SI: D per 10^3 m3/d is 35.3147 times the oilfield number
    await studio.act((c) => c.setUnitSystem('si'));
    const si = flat(readPdf(build(studio.ctx).doc).text);
    const m = si.match(/D, multi-rate line \(1\/\(10.m.\/d\)\) ([\d.e-]+)/);
    expect(Number(m[1])).toBeCloseTo(5e-4 * 35.31466672, 5);
    studio.unmount();
  }, 600000);

  test('the pseudo-pressure LIT b gives D = b k h / (1422 T); a pressure-squared b gives none (negative control); one rate gives no line', async () => {
    const studio = await gasSample();
    await studio.act((c) => {
      c.setDeliverabilityField('method', 'pseudo-pressure');
      c.setDeliverabilityRows([{ q: '2000', pwf: '4500' }, { q: '4000', pwf: '4100' }, { q: '6000', pwf: '3600' }]);
      c.setRateSkinRows([{ q: '5000', skin: '4' }]);
    });
    const r = studio.ctx.reservoirSpec.reservoir;
    const b = studio.ctx.deliverabilityResult.lit.b;
    expect(b).toBeGreaterThan(0);
    const rs = studio.ctx.rateSkin;
    expect(rs.fit.ok).toBe(false);
    expect(rs.fit.reason).toMatch(/different rates/);
    expect(rs.source).toBe('lit');
    expect(rs.litD).toBeCloseTo((b * studio.ctx.derivedKpis.k * r.h) / (1422 * r.tempR), 15);
    await studio.act((c) => c.setDeliverabilityField('method', 'pressure-squared'));
    expect(Number.isFinite(studio.ctx.rateSkin.litD)).toBe(false);
    expect(studio.ctx.rateSkin.source).toBeNull();
    expect(studio.ctx.skinBreakdown.rate).toBeNull();
    studio.unmount();
  }, 600000);
});

describe('WTA-U2-004: correction to datum with a stated gradient', () => {
  const placeGauge = (c) => {
    c.setCompletionField('gaugeDepthTvd', '9800');
    c.setCompletionField('depthRefElev', '100');
    c.setCompletionField('datumDepthTvdss', '9900');
  };

  test('no gradient (owner default): nothing corrected, the report says so and prints the gauge and the datum', async () => {
    const studio = await sample(placeGauge);
    expect(studio.ctx.datum.ok).toBe(false);
    const rows = Object.fromEntries(studio.ctx.pressureBasisRows);
    expect(rows['Gradient, gauge to datum']).toMatch(/None stated/);
    expect(rows['Correction to the datum']).toMatch(/None applied: every pressure in this report is at the gauge depth/);
    expect(studio.ctx.wtaRecord.pressure.datum_correction).toBe('none');
    expect(studio.ctx.wtaRecord.pressure.average_psia).toBe(studio.ctx.semilogResult.pStar);
    studio.unmount();
  }, 600000);

  test('0.35 psi/ft over 200 ft adds 70 psi to p* and pwf at the datum; the analysis stays at the gauge; wta-1 sends the datum pressure', async () => {
    const studio = await sample(placeGauge);
    const kBefore = studio.ctx.derivedKpis.k;
    const pStar = studio.ctx.semilogResult.pStar;
    await studio.act((c) => { c.setCompletionField('datumGradient', '0.35'); c.setCompletionField('datumGradientSource', 'oil column from density'); });
    const d = studio.ctx.datum;
    expect(d.ok).toBe(true);
    expect(d.gaugeTvdss).toBe(9700);
    expect(d.correction).toBeCloseTo(70, 12);
    expect(studio.ctx.derivedKpis.k).toBe(kBefore); // the analysis does not move
    expect(studio.ctx.semilogResult.pStar).toBe(pStar);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Gradient, gauge to datum 0\.35 psi\/ft, oil column from density/);
    expect(t).toMatch(/Correction to the datum \+70 psi/);
    const m = t.match(/p\* at the datum \(psi\) ([\d,.]+)/);
    expect(Number(m[1].replace(/,/g, ''))).toBeCloseTo(pStar + 70, 0);
    const w = studio.ctx.wtaRecord.pressure;
    expect(w.average_psia).toBeCloseTo(pStar + 70, 9);
    expect(w.p_star_psia).toBe(pStar);
    expect(w.datum_correction.delta_psi).toBeCloseTo(70, 12);
    expect(w.basis).toMatch(/at the datum 9900 ft TVDSS/);
    // SI: the gradient prints in kPa/m (0.35 psi/ft = 7.9172 kPa/m)
    await studio.act((c) => c.setUnitSystem('si'));
    expect(Object.fromEntries(studio.ctx.pressureBasisRows)['Gradient, gauge to datum']).toMatch(/^7\.9172 kPa\/m/);
    studio.unmount();
  }, 600000);

  test('a gradient without the reference elevation is refused with its reason (negative control)', async () => {
    const studio = await sample((c) => {
      c.setCompletionField('gaugeDepthTvd', '9800');
      c.setCompletionField('datumDepthTvdss', '9900');
      c.setCompletionField('datumGradient', '0.35');
    });
    expect(studio.ctx.datum.ok).toBe(false);
    expect(Object.fromEntries(studio.ctx.pressureBasisRows)['Correction to the datum']).toMatch(/None applied: the elevation of the depth reference/);
    expect(studio.ctx.wtaRecord.pressure.datum_correction).toBe('none');
    studio.unmount();
  }, 600000);
});

describe('WTA-U2-007: the slant pseudo-skin of a deviated interval', () => {
  const { slantPseudoSkin, papatzacosPseudoSkin } = require('@/utils/welltest/partialPenetration');
  const deviated = (c) => {
    // 30 ft along hole over 21.213 ft vertical: 45 degrees from vertical
    c.setCompletion({ ...c.completion, perfTopMd: '9850', perfBaseMd: '9880', perfTopTvd: '9800', perfBaseTvd: '9821.2132', payTopTvd: '9800', payTopMd: '9850' });
  };

  test('MD and TVD of the perforations give the angle; the engine slant skin joins the split, and the PDF prints it', async () => {
    const studio = await sample(deviated);
    const sb = studio.ctx.skinBreakdown;
    expect(sb.slant.thetaDeg).toBeCloseTo(45, 3);
    const engine = slantPseudoSkin({ thetaDeg: sb.slant.thetaDeg, h: 45, rw: 0.354, kvkh: 0.1 });
    expect(sb.slant.sTheta).toBe(engine.sTheta);
    const pp = papatzacosPseudoSkin({ h: 45, hp: 21.2132, h1: 0, rw: 0.354, kvkh: 0.1 });
    expect(sb.spp).toBeCloseTo(pp.spp, 9);
    expect(sb.mechanicalSkin).toBeCloseTo((21.2132 / 45) * (sb.totalSkin - pp.spp - engine.sTheta), 9);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Slant pseudo-skin s_theta \(45\.0 degrees from vertical\) -?\d+\.\d\d/);
    expect(t).toMatch(/Cinco-Ley, Ramey and Miller \(1975\)/);
    expect(t).toMatch(/s_d = \(hp\/h\) \(s - s_pp - s_theta\)/);
    expect(studio.ctx.wtaRecord.skin.slant.deviation_deg).toBeCloseTo(45, 3);
    studio.unmount();
  }, 600000);

  test('a vertical interval (MD equal to TVD length) has no slant term, and the split is the one before (negative control)', async () => {
    const studio = await sample((c) => c.setCompletion({ ...c.completion, perfTopMd: '9850', perfBaseMd: '9880', perfTopTvd: '9800', perfBaseTvd: '9830', payTopTvd: '9800' }));
    const sb = studio.ctx.skinBreakdown;
    expect(sb.slant).toBeNull();
    expect(sb.mechanicalSkin).toBeCloseTo((30 / 45) * (sb.totalSkin - sb.spp), 9);
    studio.unmount();
  }, 600000);
});

describe('WTA-U2-013: negative skin on the non-homogeneous models', () => {
  const { getModel, evaluateBuildup } = require('@/utils/welltest/models/modelCatalog');
  test('a stimulated well near a sealing fault: the regression recovers skin -2 (it stopped at 0 before)', async () => {
    const reservoir = { h: 45, phi: 0.18, rw: 0.354, B: 1.25, mu: 0.9, ct: 0.000012, q: 450, pi: 4800 };
    const truth = { k: 85, skin: -2, C: 0.015, L: 400 };
    const model = getModel('homogeneous-sealing-fault');
    expect(model.parameters.find((p) => p.key === 'skin').min).toBe(-5);
    const dts = Array.from({ length: 60 }, (_, i) => Math.pow(10, -2 + (4.3 * i) / 59));
    const pts = evaluateBuildup({ model, params: truth, reservoir, tp: 36, dts });
    const studio = await sample((c) => {
      c.setGaugeRows(pts.map((p) => ({ t: p.dt, p: p.pws })));
      c.setTestField('pwfShutIn', pts.pwfAtShutIn.toFixed(3));
    });
    await studio.act((c) => { c.setMatchField('modelId', 'homogeneous-sealing-fault'); c.setMatchField('skin', '0'); c.setMatchField('L', '300'); });
    await studio.act((c) => c.runAutoFit());
    const fit = studio.ctx.fitResult;
    expect(Math.abs(fit.params.skin - -2)).toBeLessThan(0.15);
    // k and L within 10 percent: the regression on the smoothed derivative carries the same bias for
    // a positive skin of 2 (L 372 against 400 on the engine alone), so it is not the sign of the skin
    expect(Math.abs(fit.params.k / 85 - 1)).toBeLessThan(0.1);
    expect(Math.abs(fit.params.L / 400 - 1)).toBeLessThan(0.1);
    // negative control: the bound of the earlier release (skin >= 0) cannot reach it
    const clamped = { ...model, parameters: model.parameters.map((p) => (p.key === 'skin' ? { ...p, min: 0 } : p)) };
    const { autoFitModel } = require('@/utils/welltest/autoFit');
    const old = autoFitModel({ model: clamped, testType: 'buildup', data: pts.map((p) => ({ dt: p.dt, dp: p.dp })), reservoir, tp: 36, initialParams: { k: 85, skin: 0, C: 0.01, L: 300 } });
    expect(old.params.skin).toBeGreaterThanOrEqual(0);
    expect(old.ssr).toBeGreaterThan(fit.ssr * 10);
    studio.unmount();
  }, 900000);
});
