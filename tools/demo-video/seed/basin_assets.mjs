// The Basin & Charge Modeling videos' data: what a basin modeller needs on
// the Ekene field that kit v4 does not carry, made deterministically and
// consistent with the kit's geology (tools/demo-dataset/spine.mjs: the dated
// surfaces, the Oboro Unconformity hiatus 16.4 to 20.5 Ma, a 77 F seabed and
// the temperature gradient that puts 180 F at the 1560 m contact and 226.3 F
// at Ekene-1's TD).
//
//   ekene-1-basin-column.csv     ages, hiatus, lithology and the eroded
//                                thickness by surface name, for Ekene-1's
//                                registry tops (the Registry well door)
//   ekene-1-temperatures.csv     log BHTs from three logging runs (time
//                                since circulation stopped, 4 h circulation)
//                                and one DST temperature, MD below KB in ft
//   ekene-1-vitrinite.csv        vitrinite reflectance on cuttings, MD ft
//   ekene-1-rock-eval.csv        Rock-Eval pyrolysis on cuttings, MD ft
//   ekene-east-kitchen-column.csv  a pseudo-well in the basin east of the
//                                field, depths in ft below the seabed, with
//                                the two Akata source intervals
//   ekene-traps.csv              the Ekene and Oboro traps: when they formed,
//                                their fetch areas, the source each takes
//                                and the volume in place they hold
//   basin-truth.json             the numbers the engine gives on these files
//
// The temperatures are the kit's linear gradient (the Horner lines
// extrapolate to it). The vitrinite is the Easy%Ro the engine computes on
// Ekene-1 at the truth heat flow (58.5 mW/m2, continuous deposition, 0.25 Ma
// step, 492 ft eroded at the unconformity) plus a fixed-seed scatter of
// 0.02 %Ro. A kit or engine change that moves them stops the script
// (CHECKS below).
//   node tools/demo-video/seed/basin_assets.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { SimulationEngine } from '../../../packages/engines/engines/basin/SimulationEngine.js';

const out = process.argv[2] || '/root/demo-video-work/bf-assets';
fs.mkdirSync(out, { recursive: true });
const FT = 0.3048;
const ft = (m) => m / FT;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// fixed-seed scatter (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(20261109);
const noise = (amp) => (rand() * 2 - 1) * amp;

// ---------------------------------------------------------------- Ekene-1 --
// The kit's surfaces at Ekene-1 (MD below KB, vertical well; seabed at 60 m).
const KB = 25; const SEABED_MD = 60; const TD = 2250;
const SURFACES = [
  // name, MD m, age Ma, type, hiatus end, lithology of the layer below, sand %, shale %
  ['Seabed', 60, 0.0, 'seabed', null, 'sandstone'],
  ['Benin Formation', 350, 2.6, 'formation', null, 'sandstone'],
  ['Agbada Formation', 1150, 5.3, 'formation', null, 'mixed', 50, 50],
  ['Ogbia Shale', 1290, 12.5, 'mfs', null, 'shale'],
  ['Ekene Sand', 1548, 14.8, 'sb', null, 'sandstone'],
  ['Ekene Sand Base', 1580, 15.4, 'base', null, 'mixed', 40, 60],
  ['Oboro Unconformity', 1790, 16.4, 'unconformity', 20.5, 'shale'],
  ['Oboro Sand', 1845, 21.0, 'sb', null, 'sandstone'],
  ['Oboro Sand Base', 1912, 22.2, 'base', null, 'mixed', 30, 70],
  ['Akata Formation', 2080, 28.0, 'formation', null, 'shale'],
];
const TD_AGE = 30.0;
const ERODED_FT = 492; // 150 m removed at the Oboro Unconformity (regional restoration)
const SURFACE_C = 25; // 77 F seabed
const HF_TRUTH = 58.5;
const AKATA_EK1 = { toc: 1.6, hi: 250, kerogen: 'pc-B' }; // Ekene-1's Akata: fair, marine

const kitTempF = (md) => 77 + ((226.3 - 77) * (md - KB)) / (2249.9 - KB);

function ekene1Layers({ source = true } = {}) {
  return SURFACES.map((s, i) => {
    const next = SURFACES[i + 1];
    const base = next ? next[1] : TD;
    const ageStart = next ? next[2] : TD_AGE;
    const ageEnd = s[4] != null ? s[4] : s[2];
    const l = { id: `e${i}`, name: s[0], thickness: base - s[1], ageStart, ageEnd, lithology: s[5] };
    if (s[5] === 'mixed') l.lithologyMix = { sandstone: s[6], shale: s[7], limestone: 0 };
    if (s[0] === 'Akata Formation' && source) l.sourceRock = { isSource: true, ...AKATA_EK1 };
    return l;
  });
}
const ekene1Project = (hf) => ({
  stratigraphy: ekene1Layers(),
  heatFlow: { type: 'constant', value: hf },
  erosionEvents: [{ age: 16.4, amount: ERODED_FT * FT }],
  settings: { surfaceTemp: SURFACE_C, deposition: 'continuous', timeStepMa: 0.25 },
});
const atDepth = (column, zBelowSeabed, key) => {
  let best = column[0];
  for (const c of column) if (Math.abs(c.depth - zBelowSeabed) < Math.abs(best.depth - zBelowSeabed)) best = c;
  // linear between the two nearest slice centres
  const i = column.indexOf(best);
  const j = zBelowSeabed > best.depth ? Math.min(column.length - 1, i + 1) : Math.max(0, i - 1);
  const o = column[j];
  if (o === best || o.depth === best.depth) return best[key];
  return best[key] + ((zBelowSeabed - best.depth) * (o[key] - best[key])) / (o.depth - best.depth);
};

const ek1 = await SimulationEngine.run(ekene1Project(HF_TRUTH));

// 1. the column file for the registry door
const colRows = [['surface', 'age_ma', 'hiatus_end_ma', 'surface_type', 'lithology', 'sand_pct', 'shale_pct', 'eroded_ft', 'note']];
SURFACES.forEach((s) => colRows.push([s[0], s[2].toFixed(1), s[4] != null ? s[4].toFixed(1) : '', s[3], s[5], s[6] ?? '', s[7] ?? '', s[3] === 'unconformity' ? ERODED_FT : '',
  s[3] === 'unconformity' ? 'subaerial; 492 ft removed (regional restoration)' : s[0] === 'Akata Formation' ? 'deep marine shale; continues below TD' : '']));
colRows.push(['TD', TD_AGE.toFixed(1), '', '', '', '', '', '', 'age of the Akata at Ekene-1 TD (biostratigraphy)']);

// 2. temperatures: three logging runs (Horner lines through the kit gradient) and a DST
const CIRC_H = 4;
const runs = [
  { md: 1450, label: 'run 1 (13-3/8 in casing point)', m: 30, ts: [6, 11, 17] },
  { md: 1800, label: 'run 2 (9-5/8 in casing point)', m: 35, ts: [6, 12, 19] },
  { md: 2249.9, label: 'run 3 (TD)', m: 41, ts: [6, 12, 18] },
];
const tRows = [['depth_md_ft', 'temp_degf', 'shut_in_h', 'kind', 'note']];
for (const r of runs) {
  const tf = kitTempF(r.md);
  for (const ts of r.ts) tRows.push([r1(ft(r.md)), r1(tf - r.m * Math.log((CIRC_H + ts) / ts)), ts, 'BHT', `${r.label}, circulation ${CIRC_H} h`]);
}
const DST_MD = 1556;
tRows.push([r1(ft(DST_MD)), r1(kitTempF(DST_MD)), '', 'DST', 'DST 1, Ekene Sand, flowing temperature']);

// 3. vitrinite on cuttings (shale and mixed intervals, skip the sands)
const roRows = [['depth_md_ft', 'ro_pct', 'readings', 'sample']];
const roTruth = [];
const ROS = [520, 760, 980, 1200, 1330, 1450, 1620, 1720, 1860, 1960, 2040, 2120, 2200, 2245];
for (const md of ROS) {
  const ro = atDepth(ek1.data.column, md - SEABED_MD, 'ro');
  roTruth.push({ md, ro });
  roRows.push([r1(ft(md)), r2(ro + noise(0.02)), 18 + Math.floor(rand() * 20), 'cuttings']);
}

// 4. Rock-Eval on cuttings: lean terrestrial Agbada shales, fair marine Akata
const reRows = [['depth_md_ft', 'lithology', 'toc_wt_pct', 's1_mg_g', 's2_mg_g', 's3_mg_g', 'tmax_c', 'hi', 'oi', 'pi']];
const RE = [[1200, 'shale', 0.9, 110], [1320, 'shale', 1.1, 130], [1440, 'shale', 1.0, 120], [1650, 'shale', 0.8, 105], [1740, 'shale', 1.2, 140], [1980, 'shale', 1.1, 150],
  [2090, 'shale', 1.55, 245], [2120, 'shale', 1.62, 252], [2150, 'shale', 1.58, 248], [2180, 'shale', 1.66, 255], [2210, 'shale', 1.61, 250], [2240, 'shale', 1.64, 253]];
for (const [md, lith, toc0, hi0] of RE) {
  const toc = r2(toc0 + noise(0.05)); const hi = Math.round(hi0 + noise(8));
  const s2 = r2((toc * hi) / 100); const s3 = r2(toc * (0.35 + rand() * 0.2)); const s1 = r2(s2 * (0.03 + rand() * 0.03));
  const ro = atDepth(ek1.data.column, md - SEABED_MD, 'ro');
  const tmax = Math.round(420 + (ro - 0.4) * 60 + noise(1.5)); // about 435 C at 0.6 %Ro
  reRows.push([r1(ft(md)), lith, toc, s1, s2, s3, tmax, hi, Math.round((100 * s3) / toc), r2(s1 / (s1 + s2))]);
}

// ---------------------------------------------------------------- kitchen --
// The basin east of the field: the same surfaces, thicker (growth), no
// subaerial hiatus, and the Akata carries two source intervals: an oil-prone
// marine shale (Pepper and Corvi B) and a deeper, gas-prone terrigenous one (F).
const KITCHEN = [
  // name, thickness ft, age top (end) Ma, age base (start) Ma, lithology, sand, shale, source
  ['Seabed', 1100, 0.0, 2.6, 'sandstone'],
  ['Benin Formation', 2760, 2.6, 5.3, 'sandstone'],
  ['Agbada Formation', 1100, 5.3, 12.5, 'mixed', 45, 55],
  ['Ogbia Shale', 1260, 12.5, 14.8, 'shale'],
  ['Ekene Sand', 230, 14.8, 15.4, 'sandstone'],
  ['Ekene Sand Base', 1360, 15.4, 21.0, 'mixed', 35, 65],
  ['Oboro Sand', 490, 21.0, 22.2, 'sandstone'],
  ['Oboro Sand Base', 1710, 22.2, 28.0, 'mixed', 25, 75],
  ['Akata Formation', 1310, 28.0, 33.0, 'shale'],
  ['Upper Akata source', 660, 33.0, 35.0, 'shale', null, null, { toc: 2.4, hi: 330, kerogen: 'pc-B' }],
  ['Akata middle', 1970, 35.0, 42.0, 'shale'],
  ['Lower Akata source', 660, 42.0, 45.0, 'shale', null, null, { toc: 2.2, hi: 220, kerogen: 'pc-F' }],
];
const KITCHEN_TD_AGE = 45.0;
const kitchenLayers = () => KITCHEN.map((k, i) => {
  const l = { id: `k${i}`, name: k[0], thickness: k[1] * FT, ageEnd: k[2], ageStart: k[3], lithology: k[4] };
  if (k[4] === 'mixed') l.lithologyMix = { sandstone: k[5], shale: k[6], limestone: 0 };
  if (k[7]) l.sourceRock = { isSource: true, ...k[7] };
  return l;
});
const kitchen = await SimulationEngine.run({
  stratigraphy: kitchenLayers(), heatFlow: { type: 'constant', value: HF_TRUTH }, erosionEvents: [],
  settings: { surfaceTemp: SURFACE_C, deposition: 'continuous', timeStepMa: 0.25 },
});
const kcRows = [['surface', 'depth_ft', 'age_ma', 'lithology', 'sand_pct', 'shale_pct', 'toc', 'hi', 'kerogen', 'note']];
let z = 0;
KITCHEN.forEach((k) => {
  kcRows.push([k[0], z, k[2].toFixed(1), k[4], k[5] ?? '', k[6] ?? '', k[7]?.toc ?? '', k[7]?.hi ?? '', k[7]?.kerogen ?? '', k[7] ? 'regional Rock-Eval (initial TOC and HI)' : '']);
  z += k[1];
});
kcRows.push(['TD', z, KITCHEN_TD_AGE.toFixed(1), '', '', '', '', '', '', 'base of the model']);

// ------------------------------------------------------------------ traps --
// Ekene: rollover drape over the growth structure, sealed by the Ogbia Shale,
// closed by 12 Ma, oil (12.14 MMstb in place). Oboro: fault-bounded against
// the growth fault, sealed above the unconformity by 16 Ma, gas (60 Bcf in
// place). Each takes one source: Ekene the oil-prone Upper Akata along the
// carrier beds, Oboro the Lower Akata up the growth fault.
const TRAPS = [
  { name: 'Ekene', formedMa: 12, fetchKm2: 25, efficiency: 0.1, source: 'Upper Akata source', inPlace: 12.14, unit: 'MMstb', note: 'oil; rollover sealed by the Ogbia Shale' },
  { name: 'Oboro', formedMa: 16, fetchKm2: 15, efficiency: 0.1, source: 'Lower Akata source', inPlace: 60, unit: 'Bcf', note: 'gas; fault-bounded against the growth fault' },
];
const trRows = [['trap', 'formed_ma', 'fetch_km2', 'migration_efficiency', 'charged_by', 'in_place', 'in_place_unit', 'note']];
TRAPS.forEach((t) => trRows.push([t.name, t.formedMa, t.fetchKm2, t.efficiency, t.source, t.inPlace, t.unit, t.note]));

// ------------------------------------------------------------------ truth --
const series = (r, name, key) => r.data[key][r.meta.layers.findIndex((l) => l.name === name)];
const last = (a) => a[a.length - 1];
const window = (r, name) => {
  // expulsion split by the source's Ro when it was expelled (oil below 1.3 %Ro)
  const ex = series(r, name, 'expulsion'); const ro = series(r, name, 'maturity');
  let prev = 0; let oil = 0; let gas = 0;
  ex.forEach((e, i) => { const d = e.value - prev; prev = e.value; if (ro[i].value < 1.3) oil += d; else gas += d; });
  const onset = ex.find((e) => e.value > 0)?.age ?? null;
  return { expelledKgM2: prev, oilKgM2: oil, gasKgM2: gas, onsetMa: onset, roNow: last(ro).value, trNow: last(series(r, name, 'transformation')).value };
};
const expelledAfter = (r, name, age) => {
  const ex = series(r, name, 'expulsion');
  let before = 0; for (const e of ex) { if (e.age >= age - 1e-9) before = e.value; else break; }
  return last(ex).value - before;
};
const truth = {
  generatedBy: 'tools/demo-video/seed/basin_assets.mjs',
  engine: 'SimulationEngine (continuous deposition, 0.25 Ma step)',
  ekene1: {
    heatFlowTruth: HF_TRUTH, surfaceC: SURFACE_C, erodedFt: ERODED_FT,
    roAtTd: atDepth(ek1.data.column, TD - SEABED_MD, 'ro'),
    tempAtTdC: atDepth(ek1.data.column, TD - SEABED_MD, 'temp'),
    akata: window(ek1, 'Akata Formation'),
    roTruth,
  },
  kitchen: {
    depthToUpperSourceFt: KITCHEN.slice(0, 9).reduce((a, k) => a + k[1], 0),
    upper: window(kitchen, 'Upper Akata source'),
    lower: window(kitchen, 'Lower Akata source'),
  },
  traps: TRAPS.map((t) => {
    const after = expelledAfter(kitchen, t.source, t.formedMa);
    const kg = after * t.fetchKm2 * 1e6 * t.efficiency;
    return { ...t, expelledAfterKgM2: after, chargeMMboe: kg / 850 / 0.158987294928 / 1e6 };
  }),
};

// CHECKS: the story the videos tell
const fail = (m) => { console.error(`basin_assets: ${m}`); process.exit(1); };
if (Math.abs(truth.ekene1.tempAtTdC - (226.3 - 32) / 1.8) > 1.5) fail(`Ekene-1 TD temperature ${truth.ekene1.tempAtTdC.toFixed(2)} C is off the kit's 226.3 F`);
if (!(truth.ekene1.roAtTd > 0.55 && truth.ekene1.roAtTd < 0.7)) fail(`Ekene-1 TD Ro ${truth.ekene1.roAtTd} is not early oil window`);
if (truth.ekene1.akata.expelledKgM2 > 0) fail('Ekene-1 Akata expels: the charge must come from the kitchen');
if (!(truth.kitchen.upper.gasKgM2 === 0 && truth.kitchen.upper.oilKgM2 > 1000)) fail('Upper Akata source must expel oil only');
if (!(truth.kitchen.lower.gasKgM2 > truth.kitchen.lower.oilKgM2)) fail('Lower Akata source must expel mostly in the gas window');

const csv = (rows) => `${rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n')}\n`;
fs.writeFileSync(path.join(out, 'ekene-1-basin-column.csv'), csv(colRows));
fs.writeFileSync(path.join(out, 'ekene-1-temperatures.csv'), csv(tRows));
fs.writeFileSync(path.join(out, 'ekene-1-vitrinite.csv'), csv(roRows));
fs.writeFileSync(path.join(out, 'ekene-1-rock-eval.csv'), csv(reRows));
fs.writeFileSync(path.join(out, 'ekene-east-kitchen-column.csv'), csv(kcRows));
fs.writeFileSync(path.join(out, 'ekene-traps.csv'), csv(trRows));
fs.writeFileSync(path.join(out, 'basin-truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
console.log(JSON.stringify({ ekene1: { roAtTd: truth.ekene1.roAtTd, tempAtTdF: truth.ekene1.tempAtTdC * 1.8 + 32 }, kitchen: { upper: truth.kitchen.upper, lower: truth.kitchen.lower }, traps: truth.traps.map((t) => [t.name, t.expelledAfterKgM2, t.chargeMMboe]) }, null, 1));
