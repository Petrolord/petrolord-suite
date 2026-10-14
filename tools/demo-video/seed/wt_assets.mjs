// The Well Test Analysis Studio videos' extra kit files (Well Test video
// round, 2026-10-14). The kit's one test, Ekene-1's February 2025 buildup
// (11-production-engineering), recovers k and skin but shows neither
// wellbore storage nor a boundary nor a clean-up. Two more tests, forward
// modelled with the Well Test engine on the same earth model, so the
// studio can be shown to recover a known truth:
//
//   Ekene-5 buildup, May 2024: a week shut in after the April 2024 rate.
//     The gauge record holds the last day of flow, so the shut-in is set on
//     the gauge clock. Truth: k 250 md x kro 0.9 = 225 md, wellbore storage
//     C 0.0025 bbl/psi, the Ekene Growth Fault 162.5 m (533 ft) away, a
//     partial-penetration pseudo-skin from perforating only the top 4 m of
//     the 8 m oil column, and a mechanical skin of 2.0.
//     The fault distance is measured on the kit v4 structure: the Ekene Sand
//     top and base meet the fault 168.5 m and 156.5 m from Ekene-5
//     (structureTruth.cutoffsOnLine at 0.5 m steps, nearest along strike
//     168.5 m), mean 162.5 m; the throw there is 90 m, so the sand is thrown
//     against shale and the fault seals. Between the well and the fault the
//     sand dips into the water leg; the test treats the sand as one medium,
//     as the kit does everywhere.
//
//   Ekene-11 initial test, March 2027: a clean-up with a one-hour shut-in,
//     the main flow, four hours choked back for bottomhole samples, then a
//     two-day buildup. Truth: k 225 md, C 0.006
//     bbl/psi, infinite acting (the growth fault is 1.7 km away), a slant
//     pseudo-skin (22.5 degrees through the sand), partial penetration
//     (perforated 1635.1 to 1639.0 m MD of an oil column to 1642.0 m MD),
//     and drilling damage, mechanical skin 3.0. The rates keep the flowing
//     pressure above the 2000 psia bubble point, so the oil stays single
//     phase. Read on one rate for tp, Horner gets k and skin wrong; read on
//     the rate history (superposition) it gets them right.
//
// Every number not chosen here comes from the spine (tools/demo-dataset),
// the dynamic fixture (packages/engines/test-data/ekene-dynamic) or the
// engines. Deterministic: reruns are byte-identical.
//   node tools/demo-video/seed/wt_assets.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCKED } from '../../demo-dataset/spine.mjs';
import { getModel, evaluateRateHistory, evaluateBuildupFromHistory, toDimensionlessGroups } from '../../../packages/engines/engines/welltest/models/modelCatalog.js';
import { rateStepsFromHistory, equivalentProducingTime } from '../../../packages/engines/engines/welltest/superposition.js';
import { partialPenetrationSkin, slantPseudoSkin } from '../../../packages/engines/engines/welltest/partialPenetration.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const out = process.argv[2] || '/root/demo-video-work/wt-assets';
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/test-data/ekene-dynamic', f), 'utf8'));
const rates = fx('rates.json');
const flood = fx('waterflood.json');
const mbal = fx('mbal.json');

const FT = 3.280839895013123;
const KVKH = 0.1; // the studio's default kv/kh, stated in the inputs file
const K = LOCKED.k_md * LOCKED.kr.kroMax; // permeability to oil at Swi, 225 md
const RW = 12.25 / 24; // 12-1/4 in hole across the Ekene Sand

// ---------------------------------------------------------------- helpers --
const daysIn = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
function labPvtAt(p) {
  const tab = [...mbal.inputs.pvt_lab_table].sort((a, b) => a.pressure_psia - b.pressure_psia);
  let i = tab.findIndex((r) => r.pressure_psia >= p);
  if (i <= 0) i = 1;
  const a = tab[i - 1]; const b = tab[i];
  const f = (p - a.pressure_psia) / (b.pressure_psia - a.pressure_psia);
  const bo = a.bo_rb_stb + f * (b.bo_rb_stb - a.bo_rb_stb);
  return {
    bo,
    mu: a.oil_viscosity_cp + f * (b.oil_viscosity_cp - a.oil_viscosity_cp),
    co: -(b.bo_rb_stb - a.bo_rb_stb) / (b.pressure_psia - a.pressure_psia) / bo,
  };
}
const ctOf = (pvt) => (1 - LOCKED.swi) * pvt.co + LOCKED.swi * mbal.inputs.water_compressibility_psi + mbal.inputs.formation_compressibility_psi;
// quartz gauge: +-0.004 psi of deterministic scatter, read to 0.001 psi
const gauge = (p, i) => {
  const u = Math.sin(12.9898 * (i + 1) + 78.233) * 43758.5453;
  return (p + 0.008 * (u - Math.floor(u) - 0.5)).toFixed(3);
};
const logspace = (a, b, perDecade) => {
  const n = Math.round((Math.log10(b) - Math.log10(a)) * perDecade);
  return Array.from({ length: n + 1 }, (_, i) => a * (b / a) ** (i / n));
};
const r4 = (v) => Number(v.toFixed(4));
const r6 = (v) => Number(v.toFixed(6)); // buildup times: the first readings are seconds apart
const csvLine = (cells) => cells.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',');
const inputsCsv = (rows) => ['section,field,value,unit,source', ...rows.map(csvLine)].join('\n') + '\n';

/** total skin of a completion with the engine the studio splits it with */
function totalSkin({ h, hpFt, h1Ft = 0, mech, thetaDeg = 0 }) {
  const pp = partialPenetrationSkin({ h, hp: hpFt, h1: h1Ft, rw: RW, kvkh: KVKH });
  if (!pp.ok) throw new Error(`partial penetration: ${pp.reason}`);
  const sl = thetaDeg > 0 ? slantPseudoSkin({ thetaDeg, h, rw: RW, kvkh: KVKH }) : { ok: true, sTheta: 0 };
  if (!sl.ok) throw new Error(`slant: ${sl.reason}`);
  // the studio's split, s_d = (hp/h) (s - s_pp - s_theta), solved for s
  const s = mech / pp.hpD + pp.spp + sl.sTheta;
  return { s, spp: pp.spp, hpD: pp.hpD, sTheta: sl.sTheta };
}

fs.mkdirSync(out, { recursive: true });
const truth = {};

// ======================================================== Ekene-5, May 2024 --
{
  const well = 'Ekene-5';
  const flowMonth = '2024-04';
  const e5 = rates.wells.find((w) => w.name === well);
  const q = e5.monthly.find((m) => m.date === `${flowMonth}-01`).oil_bpd;
  const np = e5.monthly.filter((m) => m.date <= `${flowMonth}-01`).reduce((a, m) => a + m.oil_bpd * daysIn(m.date), 0);
  const tp = (np / q) * 24;
  const pi = flood.pressure.track.find((t) => t.label === flowMonth).p_end_psia;
  const pvt = labPvtAt(pi);
  const ct = ctOf(pvt);
  const topM = 1552; // Ekene-5 TOP_SAND (spine), vertical well
  const h = (LOCKED.owc_m - topM) * LOCKED.ntg * FT; // net oil pay, ft
  const perfTopM = 1552; const perfBaseM = 1556;
  const sk = totalSkin({ h, hpFt: (perfBaseM - perfTopM) * FT, mech: 2.0 });
  const params = { k: K, skin: sk.s, C: 0.0025, L: 162.5 * FT };
  const reservoir = { h, phi: LOCKED.phi, rw: RW, B: pvt.bo, mu: pvt.mu, ct, q, pi };
  const model = getModel('homogeneous-sealing-fault');
  const steps = [{ start: 0, q }];
  // gauge clock: hour 0 is 24 hr before the shut-in; flow readings every 0.5 hr
  const flowT = Array.from({ length: 49 }, (_, i) => i * 0.5); // to the shut-in instant, 24.0 hr
  const flow = evaluateRateHistory({ model, params, reservoir, steps, times: flowT.map((t) => tp - 24 + t) });
  const dts = logspace(10 / 3600, 168, 25);
  const bu = evaluateBuildupFromHistory({ model, params, reservoir, steps, shutInTime: tp, dts });
  const rows = [
    ...flowT.map((t, i) => [r4(t), flow[i].pw]),
    ...dts.map((dt, i) => [r6(24 + dt), bu[i].pws]),
  ];
  const csv = ['elapsed_hr,bhp_psia', ...rows.map(([t, p], i) => `${t},${gauge(p, i)}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'ekene-5-buildup-2024-05.csv'), csv);
  const g = toDimensionlessGroups({ ...reservoir, k: K });
  truth.ekene5 = {
    file: 'ekene-5-buildup-2024-05.csv', well, shut_in_gauge_hr: 24, shut_in_date: '2024-05-01', q, np, tp, pi, h, ct, pvt,
    k: K, skin_total: sk.s, skin_pp: sk.spp, hpD: sk.hpD, skin_mech: 2.0, C: params.C, CD: params.C * g.cdPerBblPsi,
    fault_ft: params.L, fault_m: 162.5, pwf_at_shut_in: bu.pwfAtShutIn, readings: rows.length, kvkh: KVKH,
  };
  const ftMd = (m) => (m * FT).toFixed(1);
  fs.writeFileSync(path.join(out, 'ekene-5-well-test-inputs.csv'), inputsCsv([
    ['Test setup', 'Well name', well, '', 'producer on the western flank, 169 m from the Ekene Growth Fault at the sand top'],
    ['Test setup', 'Field', 'Ekene', '', ''],
    ['Test setup', 'Unit system', 'Oilfield (psi, ft, STB/D)', '', 'field units throughout'],
    ['Test setup', 'Test type', 'Pressure buildup', '', 'shut in 2024-05-01 for a week'],
    ['Test setup', 'Producing time tp', tp.toFixed(0), 'hr', `Horner equivalent time: cumulative ${np.toFixed(0)} stb over ${q.toFixed(2)} stb/d, times 24`],
    ['Test setup', 'Shut-in time on the gauge clock', '24', 'hr', 'the file holds the last day of flow; the flowing pressure at shut-in is read from it'],
    ['Gauge data', 'Import CSV', 'ekene-5-buildup-2024-05.csv', '', `${rows.length} readings: 49 flowing (the last at the shut-in instant), then 168 hr (a week) of buildup from 10 s`],
    ['Reservoir and fluid', 'Fluid', 'Oil (slightly compressible)', '', ''],
    ['Reservoir and fluid', 'Net thickness h', h.toFixed(2), 'ft', 'Ekene-5 oil column 1552 to 1560 m times net to gross 0.8'],
    ['Reservoir and fluid', 'Porosity', String(LOCKED.phi), 'frac', 'LOCKED spine'],
    ['Reservoir and fluid', 'Wellbore radius rw', RW.toFixed(4), 'ft', '12-1/4 in hole'],
    ['Reservoir and fluid', 'Total ct', ct.toExponential(4), '1/psi', 'So co + Sw cw + cf at the April 2024 pressure'],
    ['Reservoir and fluid', 'Oil FVF B', pvt.bo.toFixed(4), 'rb/stb', 'PVT lab table at the test pressure'],
    ['Reservoir and fluid', 'Viscosity', pvt.mu.toFixed(4), 'cp', 'PVT lab table at the test pressure'],
    ['Reservoir and fluid', 'Rate q', q.toFixed(2), 'STB/D', 'Ekene-5 April 2024 rate (08-production)'],
    ['Reservoir and fluid', 'Initial pressure pi', pi.toFixed(2), 'psia', 'reservoir pressure at the end of April 2024, waterflood pressure track'],
    ['Completion', 'Perforations top MD', ftMd(perfTopM), 'ft', '1552 m: the sand top'],
    ['Completion', 'Perforations base MD', ftMd(perfBaseM), 'ft', '1556 m: the top half of the oil column, away from the water'],
    ['Completion', 'Top of net pay MD', ftMd(topM), 'ft', '1552 m'],
    ['Completion', 'kv/kh', String(KVKH), '', 'the studio default, stated'],
  ]));
}

// ================================================ Ekene-11, March 2027 -----
{
  const well = 'Ekene-11';
  // the kit's last surveyed pressure; the track stops at December 2025
  const pi = flood.pressure.track[flood.pressure.track.length - 1].p_end_psia;
  const pvt = labPvtAt(pi);
  const ct = ctOf(pvt);
  // the planned survey through the Ekene Sand: 22.5441 degrees, prognosis top 1635.13 m MD / 1553.65 m TVD
  const inc = 22.5441;
  const surveyTvd = (md) => 1553.65 + (md - 1635.13) * Math.cos((inc * Math.PI) / 180);
  // the Wellsite call: the sand top at 1635.1 m MD
  const topMd = 1635.1; const topTvd = surveyTvd(topMd);
  const tvdAt = surveyTvd;
  const owcMd = topMd + (LOCKED.owc_m - topTvd) / Math.cos((inc * Math.PI) / 180);
  const h = (LOCKED.owc_m - topTvd) * LOCKED.ntg * FT;
  const perfTopMd = 1635.1; const perfBaseMd = 1639.0;
  const hpTvdFt = (tvdAt(perfBaseMd) - tvdAt(perfTopMd)) * FT;
  const sk = totalSkin({ h, hpFt: hpTvdFt, h1Ft: (tvdAt(perfTopMd) - topTvd) * FT, mech: 3.0, thetaDeg: inc });
  const params = { k: K, skin: sk.s, C: 0.006 };
  const reservoir = { h, phi: LOCKED.phi, rw: RW, B: pvt.bo, mu: pvt.mu, ct, q: 40, pi };
  const model = getModel('homogeneous');
  // clean-up: 40 STB/D for 4 hr, shut in 1 hr, 100 STB/D for 12 hr, choked back to 40 STB/D for 4 hr of
  // bottomhole sampling, then 48 hr of buildup
  const history = [{ t: 0, q: 40 }, { t: 4, q: 0 }, { t: 5, q: 100 }, { t: 17, q: 40 }, { t: 21, q: 0 }];
  const steps = rateStepsFromHistory(history);
  const ts = 21;
  const pre = [-0.5, -0.25];
  const flowT = Array.from({ length: 250 }, (_, i) => r4(0.1 * (i + 1))).filter((t) => t <= ts); // to the shut-in instant
  const flow = evaluateRateHistory({ model, params, reservoir, steps, times: flowT });
  const dts = logspace(10 / 3600, 48, 25);
  const bu = evaluateBuildupFromHistory({ model, params, reservoir, steps: steps.filter((s) => s.start < ts), shutInTime: ts, dts });
  const rows = [
    ...pre.map((t) => [t + 0.5, pi]),
    ...flowT.map((t, i) => [r4(t + 0.5), flow[i].pw]),
    ...dts.map((dt, i) => [r6(ts + 0.5 + dt), bu[i].pws]),
  ];
  const pwfMin = Math.min(...flow.map((r) => r.pw), bu.pwfAtShutIn);
  if (!(pwfMin > mbal.inputs.bubble_point_psia)) throw new Error(`Ekene-11 flows below the bubble point (${pwfMin})`);
  const csv = ['elapsed_hr,bhp_psia', ...rows.map(([t, p], i) => `${t},${gauge(p, i)}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'ekene-11-initial-test-2027-03.csv'), csv);
  fs.writeFileSync(path.join(out, 'ekene-11-initial-test-rates.csv'),
    ['start_hr,oil_rate_stbd,note', '0,40,clean-up on 16/64 in', '4,0,shut in to change the choke', '5,100,24/64 in', '17,40,choked back to 16/64 in for bottomhole samples', '21,0,shut in for the buildup'].join('\n') + '\n');
  const g = toDimensionlessGroups({ ...reservoir, k: K });
  truth.ekene11 = {
    file: 'ekene-11-initial-test-2027-03.csv', well, gauge_offset_hr: 0.5, shut_in_rate_clock_hr: ts, shut_in_gauge_hr: ts + 0.5,
    history, pi, h, ct, pvt, k: K, skin_total: sk.s, skin_pp: sk.spp, hpD: sk.hpD, skin_slant: sk.sTheta, skin_mech: 3.0,
    C: params.C, CD: params.C * g.cdPerBblPsi, pwf_at_shut_in: bu.pwfAtShutIn, pwf_min: pwfMin,
    equivalent_tp: equivalentProducingTime(steps, ts), perf_md_m: [perfTopMd, perfBaseMd], perf_tvd_m: [tvdAt(perfTopMd), tvdAt(perfBaseMd)],
    owc_md_m: owcMd, readings: rows.length, kvkh: KVKH,
  };
  const f1 = (m) => (m * FT).toFixed(1);
  fs.writeFileSync(path.join(out, 'ekene-11-well-test-inputs.csv'), inputsCsv([
    ['Test setup', 'Well name', well, '', 'the new well from Ekene Alpha, initial test of the Ekene Sand'],
    ['Test setup', 'Field', 'Ekene', '', ''],
    ['Test setup', 'Unit system', 'Oilfield (psi, ft, STB/D)', '', 'field units throughout'],
    ['Test setup', 'Test type', 'Pressure buildup', '', 'clean-up, main flow, sampling rate, then 48 hr shut in'],
    ['Test setup', 'Shut-in time on the gauge clock', String(ts + 0.5), 'hr', 'the gauge started 0.5 hr before the well opened'],
    ['Gauge data', 'Import CSV', 'ekene-11-initial-test-2027-03.csv', '', `${rows.length} readings over the whole test`],
    ['Rate history', 'Rate steps', 'ekene-11-initial-test-rates.csv', 'hr, STB/D', 'start of each rate on the well clock (gauge clock minus 0.5 hr); type them on the Data tab'],
    ['Rate history', 'Buildup analysed after', 'The rate history above (superposition)', '', 'a clean-up is not one rate for tp'],
    ['Reservoir and fluid', 'Fluid', 'Oil (slightly compressible)', '', 'the flowing pressure stays above the 2000 psia bubble point'],
    ['Reservoir and fluid', 'Net thickness h', h.toFixed(2), 'ft', 'oil column 1553.65 to 1560 m TVD times net to gross 0.8'],
    ['Reservoir and fluid', 'Porosity', String(LOCKED.phi), 'frac', 'LOCKED spine'],
    ['Reservoir and fluid', 'Wellbore radius rw', RW.toFixed(4), 'ft', '12-1/4 in hole'],
    ['Reservoir and fluid', 'Total ct', ct.toExponential(4), '1/psi', 'So co + Sw cw + cf at the test pressure'],
    ['Reservoir and fluid', 'Oil FVF B', pvt.bo.toFixed(4), 'rb/stb', 'PVT lab table at the test pressure'],
    ['Reservoir and fluid', 'Viscosity', pvt.mu.toFixed(4), 'cp', 'PVT lab table at the test pressure'],
    ['Reservoir and fluid', 'Rate q', '40', 'STB/D', 'the last rate before the shut-in (the sampling rate)'],
    ['Reservoir and fluid', 'Initial pressure pi', pi.toFixed(2), 'psia', 'the last surveyed pressure (December 2025); the kit has no later survey'],
    ['Completion', 'Perforations top MD', f1(perfTopMd), 'ft', '1635.1 m: the sand top (Wellsite call)'],
    ['Completion', 'Perforations base MD', f1(perfBaseMd), 'ft', `1639.0 m; the contact is at ${owcMd.toFixed(1)} m MD`],
    ['Completion', 'Perforations top TVD', f1(tvdAt(perfTopMd)), 'ft', 'planned survey, 22.5 degrees'],
    ['Completion', 'Perforations base TVD', f1(tvdAt(perfBaseMd)), 'ft', 'planned survey'],
    ['Completion', 'Top of net pay MD', f1(topMd), 'ft', ''],
    ['Completion', 'Top of net pay TVD', f1(topTvd), 'ft', ''],
    ['Completion', 'kv/kh', String(KVKH), '', 'the studio default, stated'],
  ]));
}

fs.writeFileSync(path.join(out, 'wt-truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
for (const f of fs.readdirSync(out).sort()) console.log(path.join(out, f), fs.statSync(path.join(out, f)).size);
console.log(JSON.stringify({
  e5: { q: truth.ekene5.q, tp: truth.ekene5.tp, pi: truth.ekene5.pi, h: truth.ekene5.h, s: truth.ekene5.skin_total, spp: truth.ekene5.skin_pp, L: truth.ekene5.fault_ft, pwf: truth.ekene5.pwf_at_shut_in, CD: truth.ekene5.CD },
  e11: { pi: truth.ekene11.pi, h: truth.ekene11.h, s: truth.ekene11.skin_total, spp: truth.ekene11.skin_pp, sth: truth.ekene11.skin_slant, pwf: truth.ekene11.pwf_at_shut_in, pwfMin: truth.ekene11.pwf_min, tpe: truth.ekene11.equivalent_tp },
}, null, 1));
