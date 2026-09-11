// Ekene demonstration dataset — generator.
// ============================================================================
// Run from the repo root:   npx tsx tools/demo-dataset/generate.mjs
// Output:                   dist-demo/ekene-demo-v1/   (git-ignored)
//
// Everything is deterministic: reruns are byte-identical. The LOCKED values in
// spine.mjs are asserted on the way through, so this refuses to write a kit
// that contradicts what the Academy teaches.
//
// Plan of record: docs/scope/DemoDataset-PLAN.md
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

import { topsToPoints, specForPoints } from '../../packages/engines/engines/mapping/surface.js';
import { gridSurface } from '../../packages/engines/lib/gridding/gridding.js';
import { isNull } from '../../packages/engines/lib/gridding/gridmath.js';
import { writeZMAP, writeCPS3, writeXYZ } from '../../packages/engines/lib/gridding/surfaceExport.js';
import { pickettFit } from '../../packages/engines/engines/petrophysics/rw.js';

import {
  LOCKED, LOCKED_WELLS, LOCKED_E7, ADDED_WELLS, GRID, FRAME, HORIZONS, OBORO,
  FAULT, PLATFORM, CURVES, PETRO, PRESSURE, SEISMIC, KIT, TEMP_GRAD_F_PER_M,
} from './spine.mjs';
import { buildSurvey, topsForWell, tvdAtMd } from './geology.mjs';
import { buildKit, lockedVolumetrics, volumetricsOf } from './build.mjs';
import {
  synthesiseWell, PRESSURE_MODEL, dtNormal, RW_75F, rwAt, tempF,
  OIL_CONTACT_TVDSS, GAS_CONTACT_TVDSS, OIL_SH, GAS_SH,
} from './rockmodel.mjs';
import { writeLas } from './writers/las.mjs';
import { writeSegy } from './writers/segy.mjs';
import { layerPropsFrom, makeGeometry, makeTraceBuilder, SEISMIC_NOTES } from './seismic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, KIT.out_dir, `${KIT.name}-${KIT.version}`);
const FT_PER_M = 3.280839895013123;

const report = [];
const say = (s) => { report.push(s); console.log(s); };
function assertClose(label, actual, expected, tol) {
  const d = Math.abs(actual - expected);
  if (!(d <= tol)) throw new Error(`ASSERT ${label}: ${actual} vs ${expected} (|d| ${d} > ${tol})`);
  return d;
}
const mk = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const write = (rel, content) => {
  const p = path.join(OUT, rel);
  mk(path.dirname(p));
  fs.writeFileSync(p, content);
  return p;
};
const csv = (headers, rows) =>
  `${[headers.join(','), ...rows.map((r) => r.join(','))].join('\n')}\n`;
const n = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d));

// --------------------------------------------------------------------------
say('=== Ekene demonstration dataset ===');
fs.rmSync(OUT, { recursive: true, force: true });
mk(OUT);

// 1-4. Structure, the locked volumetrics, the tuning solve and every well.
const { geo, tuning: TUNING, stats: sFinal, built } = buildKit();
{
  const v = lockedVolumetrics();
  if (v.oilCells !== LOCKED.oil_cells) throw new Error(`ASSERT oil cells: ${v.oilCells} vs ${LOCKED.oil_cells}`);
  assertClose('max oil column', v.maxColumn, LOCKED.max_oil_column_m, 1e-12);
  say(`  volumetrics: ${v.oilCells} oil cells, max column ${v.maxColumn} m  [LOCKED, reproduced]`);
}
assertClose('Ekene Sand NTG', sFinal.ntg, LOCKED.ntg, 0.002);
assertClose('Ekene Sand net porosity', sFinal.phiNet, LOCKED.phi, 1e-5);
say(`  Ekene Sand: NTG ${sFinal.ntg.toFixed(4)} (locked ${LOCKED.ntg}), net phi ${sFinal.phiNet.toFixed(5)} (locked ${LOCKED.phi})`);
say(`  tuning: shale-bed threshold ${TUNING.shaleBedThreshold}, phi scale ${TUNING.phiScale}`);
say(`  ${built.length} wells built, ${built.filter((b) => b.rows.length).length} logged`);

// 5. Gate: Pickett over Ekene-1's water leg recovers Rw ----------------------
{
  const b = built.find((x) => x.well.name === 'Ekene-1');
  const top = b.tops.find((t) => t.key === 'TOP_SAND').md;
  const base = b.tops.find((t) => t.key === 'BASE_SAND').md;
  // A clean water-leg window, which is what the crossplot's zone filter gives
  // a presenter who types the water zone into the two depth fields.
  const pts = b.rows
    .filter((r) => r.md > LOCKED.owc_m + 2 && r.md < base - 0.5 && r.md > top && r.vsh < 0.12)
    .map((r) => [r.phie, r.rt]);
  const fit = pickettFit(pts);
  const tMid = tempF((LOCKED.owc_m + base) / 2 - FRAME.kb_m);
  const rwTrue = rwAt(tMid);
  say(`  Pickett on Ekene-1 water leg: m ${fit.m.toFixed(4)} (true ${PETRO.archie.m}), `
    + `a*Rw ${fit.aRw.toFixed(5)} (true ${rwTrue.toFixed(5)} at ${tMid.toFixed(1)} degF), `
    + `${pts.length} points`);
  // Clay conductivity biases a*Rw slightly high even in clean sand. That is
  // real petrophysics, not a generation defect, so the gate allows it and the
  // episode note states the number a presenter will actually read.
  assertClose('Pickett m', fit.m, PETRO.archie.m, 0.3);
  assertClose('Pickett a*Rw', fit.aRw, rwTrue, rwTrue * 0.25);
}

// 6. Gate: Eaton at exponent 3 recovers the designed pore pressure ----------
{
  const b = built.find((x) => x.well.name === 'Ekene-1');
  let worst = 0;
  for (const r of b.rows) {
    if (r.vsh < 0.75) continue;
    const dtn = dtNormal(r.belowMudline);
    const pp = r.obPsi - (r.obPsi - r.pnPsi) * (dtn / r.dtShale) ** PRESSURE.eaton_exponent;
    worst = Math.max(worst, Math.abs(pp - r.ppPsi));
  }
  assertClose('Eaton recovery', worst, 0, 1e-6);
  const atDatum = PRESSURE_MODEL.ppPsi(PRESSURE.datum_md);
  assertClose('pore pressure at the contact = locked Pi', atDatum, LOCKED.pi_psia, 1e-6);
  say(`  Eaton (n=3) reproduces the designed pressure to ${worst.toExponential(2)} psi; `
    + `at the contact ${atDatum.toFixed(1)} psia = locked Pi, ${PRESSURE_MODEL.emwAtDatum.toFixed(3)} ppg EMW`);
}

// 7. Volumetric effect of the added wells ------------------------------------
{
  const added = ['Ekene-7', 'Ekene-8', 'Ekene-9', 'Ekene-10'];
  const v = volumetricsOf([...LOCKED_WELLS, ...built.filter((b) => added.includes(b.well.name)).map((b) => b.well)]);
  say(`  with the four added picks: ${v.oilCells} oil cells (locked six-well grid ${LOCKED.oil_cells}), `
    + `max column ${v.maxColumn.toFixed(6)} m — Ekene-7 found the sand 5.67 m deeper than the six-well map `
    + `predicts, so the Ekene Sand map in Episode 4 is gridded from the six development wells`);
}

// ===========================================================================
// 8. Wells: headers, surveys, tops, checkshots, logs
// ===========================================================================

const utmE = (x) => FRAME.origin_e + x;
const utmN = (y) => FRAME.origin_n + y;
const uwiOf = (name) => `NG-EK11-${name.replace('Ekene-', '').padStart(3, '0')}`;

const headerRows = [];
for (const b of built) {
  const w = b.well;
  const last = b.survey.stations[b.survey.stations.length - 1];
  headerRows.push([
    w.name, uwiOf(w.name),
    n(utmE(b.survey.surface.x), 2), n(utmN(b.survey.surface.y), 2),
    FRAME.crs, n(FRAME.kb_m, 2), n(FRAME.water_depth_m, 1),
    n(last.md, 1), n(last.tvd, 2),
    n(utmE(last.x), 2), n(utmN(last.y), 2),
    w.kind, w.purpose ?? '', w.curves === 'none' ? 'no' : 'yes',
    geo.faultSide(w.x, w.y),
  ]);
}
write('01-wells/well-headers.csv', csv(
  ['well', 'uwi', 'surface_easting_m', 'surface_northing_m', 'crs', 'kb_m', 'water_depth_m',
    'td_md_m', 'td_tvd_m', 'bottomhole_easting_m', 'bottomhole_northing_m',
    'well_type', 'purpose', 'has_logs', 'fault_block'],
  headerRows,
));

const logDate = '2026-09-11';
for (const b of built) {
  const w = b.well;
  // deviation survey
  write(`01-wells/surveys/${w.name}-survey.csv`, csv(
    ['md_m', 'inclination_deg', 'azimuth_deg_grid', 'tvd_m', 'ns_m', 'ew_m', 'dls_deg_30m'],
    b.survey.stations.map((s) => [n(s.md, 2), n(s.inc, 3), n(s.azi, 3), n(s.tvd, 3), n(s.ns, 3), n(s.ew, 3), n(s.dls, 3)]),
  ));
  // tops
  write(`01-wells/tops/${w.name}-tops.csv`, csv(
    ['top_name', 'md_m', 'tvd_m', 'tvdss_m', 'surface_type', 'age_ma', 'interpreter'],
    b.tops.map((t) => [t.name, n(t.md, 2), n(t.tvd, 2), n(t.tvdss, 2), t.type, n(t.age_ma, 1), 'Demo Interpreter']),
  ));
  if (!b.rows.length) continue;

  // checkshots: sonic-integrated time with a realistic drift, quoted the way
  // the Well Data Manager dialog defaults — measured depth, one way time.
  const csRows = [];
  {
    let owt = (FRAME.water_depth_m * 1000) / 1500;     // ms, one way through the water
    let prev = FRAME.mudline_md;
    const levels = [];
    const step = (b.rows[b.rows.length - 1].md - FRAME.mudline_md) / 16;
    for (let i = 1; i <= 16; i += 1) levels.push(FRAME.mudline_md + i * step);
    let li = 0;
    for (const r of b.rows) {
      owt += ((r.tvd - prev) * 1000) / r.vp_m_s;
      prev = r.tvd;
      if (li < levels.length && r.md >= levels[li]) {
        const drift = -7.5 * (1 - Math.exp(-(r.tvd - FRAME.mudline_md) / 850));
        csRows.push([n(r.md, 2), n(owt + drift, 3), n(r.tvd, 2), n(r.tvdss, 2)]);
        li += 1;
      }
    }
  }
  write(`01-wells/checkshots/${w.name}-checkshots.csv`, csv(
    ['md_m', 'one_way_time_ms', 'tvd_m', 'tvdss_m'], csRows,
  ));

  // LAS
  const litho = { SAND: 1, INTERBED: 2, SHALE: 3, CLAYSAND: 4 };
  const curves = CURVES[w.curves];
  const rows = b.rows.map((r) => ({
    md: r.md, CALI: r.cali, GR: r.gr, SP: r.sp, RHOB: r.rhob, NPHI: r.nphi,
    DT: r.dt, RT: r.rt, RXO: r.rxo, PEF: r.pef, LITH: litho[r.lith] ?? 0,
  }));
  write(`01-wells/${w.name}.las`, writeLas({
    well: w.name, curves, rows,
    header: {
      company: FRAME.operator, field: LOCKED.field, location: FRAME.licence,
      country: FRAME.country, service: 'Petrolord Synthetic Logging',
      date: logDate, uwi: uwiOf(w.name),
      params: {
        EKB:  { unit: 'M', value: FRAME.kb_m.toFixed(2), descr: 'Kelly bushing elevation above MSL' },
        EGL:  { unit: 'M', value: (-FRAME.water_depth_m).toFixed(2), descr: 'Mudline elevation relative to MSL' },
        WD:   { unit: 'M', value: FRAME.water_depth_m.toFixed(2), descr: 'Water depth' },
        BHT:  { unit: 'DEGF', value: tempF(b.rows[b.rows.length - 1].tvdss).toFixed(1), descr: 'Bottom hole temperature' },
        BHTD: { unit: 'M', value: b.rows[b.rows.length - 1].md.toFixed(1), descr: 'Depth of BHT measurement' },
        MST:  { unit: 'DEGF', value: FRAME.seabed_temp_f.toFixed(1), descr: 'Mudline (seabed) temperature' },
        RMF:  { unit: 'OHMM', value: PETRO.rmf_ohm_m_at_75f.toFixed(3), descr: 'Mud filtrate resistivity at 75 degF' },
        RMFT: { unit: 'DEGF', value: '75.0', descr: 'Temperature of RMF measurement' },
        XCOO: { unit: 'M', value: utmE(b.survey.surface.x).toFixed(2), descr: `Surface easting, ${FRAME.crs}` },
        YCOO: { unit: 'M', value: utmN(b.survey.surface.y).toFixed(2), descr: `Surface northing, ${FRAME.crs}` },
      },
    },
  }));
}
say(`  wells written: headers, ${built.length} surveys and top sets, `
  + `${built.filter((b) => b.rows.length).length} LAS files and checkshot tables`);

// The Well Design episode imports an actual survey as a workbook.
{
  const b = built.find((x) => x.well.name === 'Ekene-10');
  const aoa = [['MD (m)', 'Inc (deg)', 'Azi (deg)', 'Comment'],
    ...b.survey.stations.map((s, i) => [
      Number(s.md.toFixed(2)), Number(s.inc.toFixed(3)), Number(s.azi.toFixed(3)),
      i === 0 ? 'Wellhead' : (Math.abs(s.md - 400) < 1 ? 'KOP' : ''),
    ])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Ekene-10 definitive survey'], ['Operator', FRAME.operator], ['CRS', FRAME.crs],
    ['North reference', 'Grid'], ['Wellhead easting', utmE(PLATFORM.x)], ['Wellhead northing', utmN(PLATFORM.y)],
  ]), 'Header');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Definitive Survey');
  mk(path.join(OUT, '01-wells'));
  XLSX.writeFile(wb, path.join(OUT, '01-wells', 'Ekene-10-definitive-survey.xlsx'));
}

// ===========================================================================
// 9. Surfaces and culture
// ===========================================================================

function gridObject(spec, z, name, crsLabel) {
  const x = Array.from({ length: spec.nx }, (_, i) => FRAME.origin_e + spec.x0 + i * spec.dx);
  const y = Array.from({ length: spec.ny }, (_, r) => FRAME.origin_n + spec.y0 + r * spec.dy);
  return { x, y, z, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, name, crsLabel };
}

const crsLabel = `${FRAME.crs} (${FRAME.crs_name})`;
{
  const engineWells = LOCKED_WELLS.map((w) => ({
    name: w.name, surface_x: w.x, surface_y: w.y,
    tops: [{ name: 'TOP_SAND', md_m: w.top_sand }, { name: 'BASE_SAND', md_m: w.base_sand }],
  }));
  const pts = topsToPoints(engineWells, 'TOP_SAND');
  const spec = specForPoints(pts, GRID.cell_m, GRID.pad_cells);
  const opts = { maxExtrapolation: GRID.max_extrapolation_m };
  const top = gridSurface(pts, spec, opts).z;
  const base = gridSurface(topsToPoints(engineWells, 'BASE_SAND'), spec, opts).z;

  const gTop = gridObject(spec, top, 'EKENE_SAND_TOP', crsLabel);
  write('02-surfaces/EkeneSand-top-6wells.zmap', writeZMAP(gTop));
  write('02-surfaces/EkeneSand-top-6wells.cps3', writeCPS3(gTop));
  write('02-surfaces/EkeneSand-top-6wells.xyz', writeXYZ(gTop));
  write('02-surfaces/EkeneSand-base-6wells.zmap', writeZMAP(gridObject(spec, base, 'EKENE_SAND_BASE', crsLabel)));

  // A deeper surface on a finer grid, sampled from the structural model. This
  // is the "grid file from somebody else's package" Episode 4 imports.
  const cell = 50;
  const nx = 72; const ny = 66;
  const x0 = 0; const y0 = 400;
  const zO = new Float64Array(nx * ny);
  for (let r = 0; r < ny; r += 1) {
    for (let c = 0; c < nx; c += 1) {
      zO[r * nx + c] = -geo.horizonDepthAt('OBORO', x0 + c * cell, y0 + r * cell);
    }
  }
  const gOb = gridObject({ nx, ny, dx: cell, dy: cell, x0, y0 }, zO, 'OBORO_SAND_TOP', crsLabel);
  write('02-surfaces/OboroSand-top.zmap', writeZMAP(gOb));
  write('02-surfaces/OboroSand-top.cps3', writeCPS3(gOb));
  say(`  surfaces: Ekene Sand top and base (${spec.nx}x${spec.ny} at ${GRID.cell_m} m), `
    + `Oboro Sand top (${nx}x${ny} at ${cell} m)`);
}

// Culture: the licence boundary and the fault trace, in the project CRS.
{
  const ring = [[-100, 300], [3300, 300], [3300, 3300], [-100, 3300], [-100, 300]]
    .map(([x, y]) => [Number(utmE(x).toFixed(2)), Number(utmN(y).toFixed(2))]);
  write('03-culture/ek11-licence-boundary.geojson', `${JSON.stringify({
    type: 'FeatureCollection',
    name: 'EK-11 licence boundary',
    crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${FRAME.crs.split(':')[1]}` } },
    features: [{
      type: 'Feature',
      properties: { name: FRAME.licence, operator: FRAME.operator, area_km2: 10.2 },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }],
  }, null, 2)}\n`);

  const trace = [];
  for (let y = 300; y <= 3300; y += 150) {
    trace.push([Number(utmE(geo.faultXAt(y)).toFixed(2)), Number(utmN(y).toFixed(2))]);
  }
  write('03-culture/ekene-growth-fault.geojson', `${JSON.stringify({
    type: 'FeatureCollection',
    name: 'Ekene Growth Fault',
    crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${FRAME.crs.split(':')[1]}` } },
    features: [{
      type: 'Feature',
      properties: {
        name: FAULT.name, type: 'normal growth fault', downthrown: 'east',
        dip_deg: FAULT.dip_deg, strike_deg: FAULT.strike_deg,
        throw_m_at_ekene_sand: 0, throw_m_at_oboro_sand: 38, throw_m_at_akata: 72,
        note: 'Dies out below the Ekene Sand base, which is why the Ekene tank is unfaulted in the base case.',
      },
      geometry: { type: 'LineString', coordinates: trace },
    }],
  }, null, 2)}\n`);
  say('  culture: licence boundary polygon and the growth fault trace');
}

// ===========================================================================
// 10. Seismic
// ===========================================================================
{
  const ref = built.find((b) => b.well.name === 'Ekene-1');
  const props = layerPropsFrom(ref.rows);
  const ns = Math.round(SEISMIC.t_max_ms / SEISMIC.dt_ms) + 1;
  const dtUs = SEISMIC.dt_ms * 1000;

  for (const [label, cfg] of [['full', SEISMIC.full], ['small', SEISMIC.small]]) {
    const coordsLocal = makeGeometry(cfg);
    const traceAt = makeTraceBuilder({ geo, props, ns, dtMs: SEISMIC.dt_ms });
    const cache = new Map();
    const buf = writeSegy({
      nInline: cfg.nInline, nXline: cfg.nXline, ns, dtUs, formatCode: cfg.format,
      il0: cfg.il0, xl0: cfg.xl0,
      coords: (il, xl) => {
        const p = coordsLocal(il, xl);
        return { x: utmE(p.x), y: utmN(p.y) };
      },
      trace: (il, xl) => {
        const key = `${il}/${xl}`;
        if (!cache.has(key)) {
          const p = coordsLocal(il, xl);
          cache.set(key, traceAt(p.x, p.y));
        }
        const t = cache.get(key);
        cache.delete(key);
        return t;
      },
      textLines: [
        `CLIENT ${FRAME.operator}`,
        `SURVEY EKENE 3D ${label.toUpperCase()} - SYNTHETIC DEMONSTRATION DATA`,
        `AREA ${FRAME.licence}  ${FRAME.country}`,
        `CRS ${FRAME.crs} ${FRAME.crs_name}`,
        `BIN ${SEISMIC.bin_m} M X ${SEISMIC.bin_m} M   INLINE AZIMUTH ${SEISMIC.inline_azimuth_deg} DEG`,
        `INLINE RANGE ${cfg.il0} TO ${cfg.il0 + cfg.nInline - 1}`,
        `CROSSLINE RANGE ${cfg.xl0} TO ${cfg.xl0 + cfg.nXline - 1}`,
        `SAMPLES ${ns}  INTERVAL ${SEISMIC.dt_ms} MS  RECORD ${SEISMIC.t_max_ms} MS`,
        `FORMAT ${cfg.format === 1 ? 'IBM FLOAT' : 'IEEE FLOAT'}  4 BYTE`,
        'BYTE POSITIONS INLINE 189  CROSSLINE 193  CDPX 181  CDPY 185  SCALAR 71',
        'POLARITY SEG NORMAL - IMPEDANCE INCREASE IS A PEAK',
        'DATUM MEAN SEA LEVEL  REPLACEMENT VELOCITY 1500 M/S',
        'PROCESSING POST STACK TIME MIGRATION',
        '',
        'THIS VOLUME IS SYNTHETIC. IT IS GENERATED FROM THE SAME EARTH MODEL',
        'AS THE WELL LOGS IN THIS KIT, SO THE SYNTHETIC SEISMOGRAM TIES.',
        'IT IS NOT DATA FROM ANY REAL FIELD.',
        '',
        'THE TEXTUAL HEADER IS A NOTE SOMEBODY TYPED. THE TRACES ARE THE DATA.',
      ],
    });
    const name = `04-seismic/EKENE3D-${label}.sgy`;
    write(name, buf);
    say(`  seismic ${label}: ${cfg.nInline}x${cfg.nXline}x${ns}, `
      + `${(buf.length / 1048576).toFixed(1)} MB, ${cfg.format === 1 ? 'IBM' : 'IEEE'} float`);
  }
  write('04-seismic/README-seismic.md', [
    '# Ekene 3D — synthetic volumes', '',
    `- **Polarity** ${SEISMIC_NOTES.polarity}`,
    `- **Top Ekene Sand is a ${SEISMIC_NOTES.topSandEvent}.** ${SEISMIC_NOTES.reason}`,
    `- **Datum** ${SEISMIC_NOTES.datum}`,
    `- **Byte positions** inline 189, crossline 193, CDP X 181, CDP Y 185, scalar 71 (value -100).`,
    `- **CRS** ${crsLabel}.`, '',
    '`EKENE3D-small.sgy` is the one to import on camera: it decodes inside a take.',
    '`EKENE3D-full.sgy` is the one to have imported already for everything after that.', '',
    '## What is in it',
    '',
    'The seabed, the Benin and Agbada boundaries, the Ogbia Shale, the top and base',
    'of the Ekene Sand, the Oboro Unconformity, the Oboro Sand and the Akata',
    'Formation. The growth fault at inline-parallel strike is invisible at the Ekene',
    'level by design and clear at the Oboro and Akata levels, which is where a growth',
    'fault is pickable anyway.', '',
    'The cube is built from the same earth model as the logs, so the synthetic',
    'seismogram from any well\'s RHOB and DT ties it without stretching.',
  ].join('\n'));
}

// ===========================================================================
// 11. Pressure: the calibration data Episode 9 asks for
// ===========================================================================
{
  const b = built.find((x) => x.well.name === 'Ekene-1');
  const at = (md) => b.rows.reduce((best, r) => (Math.abs(r.md - md) < Math.abs(best.md - md) ? r : best));

  // MDT pressures: an oil gradient above the contact and a water gradient
  // below, intersecting at the LOCKED initial pressure at the LOCKED contact.
  const gOil = (62.4 * (141.5 / (131.5 + LOCKED.api)) + 0.0136 * LOCKED.rsi_scf_stb * LOCKED.gas_sg)
    / LOCKED.boi_rb_stb / 144;
  const gWat = (0.4335 * LOCKED.gammaW) / LOCKED.bw_rb_stb;
  const datumFt = LOCKED.owc_m * FT_PER_M;
  const pAt = (md) => {
    const ft = md * FT_PER_M;
    return md <= LOCKED.owc_m
      ? LOCKED.pi_psia - gOil * (datumFt - ft)
      : LOCKED.pi_psia + gWat * (ft - datumFt);
  };
  const mdtRows = [];
  for (const md of [1549, 1552, 1555, 1558, 1561, 1565, 1570, 1576]) {
    const r = at(md);
    mdtRows.push(['Ekene-1', n(md, 1), n(r.tvdss, 2), n(pAt(md), 1), md <= LOCKED.owc_m ? 'oil' : 'water',
      n(md <= LOCKED.owc_m ? gOil : gWat, 4), 'MDT pretest', 'good']);
  }
  for (const md of [1543, 1550, 1558, 1566]) {
    const b3 = built.find((x) => x.well.name === 'Ekene-3');
    const r3 = b3.rows.reduce((best, r) => (Math.abs(r.md - md) < Math.abs(best.md - md) ? r : best));
    mdtRows.push(['Ekene-3', n(md, 1), n(r3.tvdss, 2), n(pAt(md), 1), md <= LOCKED.owc_m ? 'oil' : 'water',
      n(md <= LOCKED.owc_m ? gOil : gWat, 4), 'MDT pretest', 'good']);
  }
  write('05-pressure/ekene-mdt-pressures.csv', csv(
    ['well', 'md_m', 'tvdss_m', 'pressure_psia', 'fluid', 'gradient_psi_per_ft', 'test_type', 'quality'],
    mdtRows,
  ));

  // Leak-off and formation integrity tests at the casing shoes, read off the
  // designed fracture gradient.
  const lotRows = [];
  for (const c of PRESSURE.casing) {
    if (c.shoe_md < 300 || c.shoe_md > b.rows[b.rows.length - 1].md) continue;
    const r = at(c.shoe_md);
    const kind = c.shoe_md === 1250 ? 'LOT' : (c.shoe_md === 600 ? 'FIT' : 'LOT');
    const emw = kind === 'FIT' ? r.fgEmw - 0.6 : r.fgEmw;
    lotRows.push([`${c.size_in}"`, n(c.shoe_md, 1), n(r.tvd, 2), kind,
      n(emw, 2), n(emw * 0.052 * r.tvd * FT_PER_M, 0),
      kind === 'FIT' ? 'pressured to this value and held; formation not broken down' : 'clear leak-off']);
  }
  write('05-pressure/ekene-lot-fit.csv', csv(
    ['casing', 'shoe_md_m', 'shoe_tvd_m', 'test', 'emw_ppg', 'pressure_psi', 'note'], lotRows,
  ));

  // Mud weights actually used, and the one that did not work.
  const mwRows = [];
  for (const [from, to, mw, note] of [
    [60, 600, 8.8, 'seawater and gel sweeps'],
    [600, 1250, 9.2, 'no losses, no influx'],
    [1250, 1548, 11.9, 'raised through the Ogbia ramp on connection gas'],
    [1548, 1700, 12.6, 'reservoir section; 0.6 ppg over the prognosis'],
    [1700, 2250, 13.9, 'Akata; held'],
  ]) mwRows.push([n(from, 0), n(to, 0), n(mw, 2), note, 'held']);
  mwRows.push(['1250', '1420', '11.20', 'first attempt through the ramp', 'FAILED - 12 bbl influx at 1418 m, circulated out, raised to 11.9']);
  write('05-pressure/ekene-mud-weights.csv', csv(
    ['from_md_m', 'to_md_m', 'mud_weight_ppg', 'note', 'outcome'], mwRows,
  ));

  // The designed profile, so a presenter can check the app against the truth.
  const prog = [];
  for (let md = 200; md <= 2250; md += 25) {
    const r = at(md);
    prog.push([n(md, 0), n(r.tvd, 1), n(r.tvdss, 1), n(r.obPsi, 1), n(r.pnPsi, 1), n(r.ppPsi, 1), n(r.fgPsi, 1),
      n(r.obEmw, 3), n(r.ppEmw, 3), n(r.fgEmw, 3)]);
  }
  write('05-pressure/ekene-1-designed-prognosis.csv', csv(
    ['md_m', 'tvd_m', 'tvdss_m', 'overburden_psi', 'hydrostatic_psi', 'pore_pressure_psi', 'fracture_psi',
      'overburden_ppg', 'pore_pressure_ppg', 'fracture_ppg'], prog,
  ));
  say(`  pressure: ${mdtRows.length} MDT pretests (gradients intersect at the mapped contact), `
    + `${lotRows.length} shoe tests, mud weight history, designed prognosis`);
}

// ===========================================================================
// 12. Stratigraphy
// ===========================================================================
{
  write('06-stratigraphy/ekene-stratigraphic-column.csv', csv(
    ['surface', 'key', 'age_ma', 'surface_type', 'hiatus_end_ma', 'ekene_1_md_m', 'note'],
    HORIZONS.map((h) => [h.name, h.key, n(h.age_ma, 1), h.type, h.hiatus_end_ma ? n(h.hiatus_end_ma, 1) : '',
      n(h.e1, 1),
      h.type === 'unconformity' ? `subaerial unconformity; hiatus ${h.age_ma} to ${h.hiatus_end_ma} Ma`
        : (h.type === 'mfs' ? 'maximum flooding surface; regional marker and the top of the pressure ramp'
          : (h.type === 'sb' ? 'sequence boundary at the base of a reservoir sand' : ''))]),
  ));
  write('06-stratigraphy/ekene-biozones.csv', csv(
    ['zone', 'top_surface', 'base_surface', 'top_age_ma', 'base_age_ma', 'marker', 'environment'],
    [
      ['Benin continental', 'BENIN', 'AGBADA', '2.6', '5.3', 'barren', 'continental / upper coastal plain'],
      ['Agbada paralic upper', 'AGBADA', 'OGBIA', '5.3', '12.5', 'Uvigerinella sp.', 'paralic, delta front'],
      ['Ogbia flooding', 'OGBIA', 'TOP_SAND', '12.5', '14.8', 'Dodo shale fauna', 'outer neritic'],
      ['Ekene reservoir', 'TOP_SAND', 'BASE_SAND', '14.8', '15.4', 'sparse', 'shoreface to distributary mouth bar'],
      ['Agbada paralic lower', 'BASE_SAND', 'OBORO_U', '15.4', '16.4', 'Uvigerinella sp.', 'paralic'],
      ['Hiatus', 'OBORO_U', 'OBORO_U', '16.4', '20.5', 'none - section absent', 'subaerial exposure'],
      ['Oboro reservoir', 'OBORO', 'OBORO_B', '21.0', '22.2', 'sparse', 'shoreface'],
      ['Basal Agbada', 'OBORO_B', 'AKATA', '22.2', '28.0', 'Bolivina sp.', 'inner to outer neritic'],
      ['Akata marine', 'AKATA', '', '28.0', '', 'Bolivina sp.', 'deep marine, undercompacted'],
    ],
  ));
  write('06-stratigraphy/core-photographs/README.md', [
    '# Core photographs', '',
    'Episode 8 section 05 asks for two or three core photographs with their depths.',
    'This kit does not ship photographs, because a synthetic field has no core.', '',
    'Use any core photograph you have the right to show, and label it with one of',
    'the cored intervals below. They are the intervals the Ekene Sand core was cut',
    'over in this dataset, and they match the SCAL plugs the reservoir fixture',
    'already carries.', '',
    '| Well | Cored interval (m MD) | What to describe |',
    '|---|---|---|',
    '| Ekene-1 | 1548.0 - 1566.0 | clean shoreface sand, oil stained above 1560 |',
    '| Ekene-3 | 1541.0 - 1559.5 | crestal sand, best porosity in the field |',
    '| Ekene-5 | 1552.0 - 1570.0 | sand with two shale streaks, the lowest permeability plug |', '',
    'The three SCAL plugs in the reservoir fixture are EK1-P (Ekene-1, 420 md),',
    'EK3-P (Ekene-3, 250 md) and EK5-P (Ekene-5, 95 md).',
  ].join('\n'));
  say('  stratigraphy: column with ages and the Oboro hiatus, biozones, core interval note');
}

// ===========================================================================
// 13. Well design
// ===========================================================================
{
  const target = built.find((b) => b.well.name === 'Ekene-11');
  const tvdT = geo.horizonDepthAt('OBORO', target.well.x, target.well.y);
  write('07-well-design/ekene-11-targets.csv', csv(
    ['target', 'easting_m', 'northing_m', 'tvd_m', 'tvdss_m', 'radius_m', 'shape', 'note'],
    [
      ['T1 Oboro Sand', n(utmE(target.well.x), 2), n(utmN(target.well.y), 2), n(tvdT, 2), n(tvdT - FRAME.kb_m, 2), '50', 'circle', 'primary; 8 m below the Oboro Sand top, in the eastern fault block'],
      ['T2 Oboro base', n(utmE(target.well.x + 180), 2), n(utmN(target.well.y + 120), 2), n(tvdT + 55, 2), n(tvdT + 55 - FRAME.kb_m, 2), '75', 'circle', 'secondary; landing point for the horizontal option'],
    ],
  ));
  write('07-well-design/ekene-alpha-site.csv', csv(
    ['item', 'value'],
    [
      ['site', PLATFORM.name],
      ['wellhead easting m', n(utmE(PLATFORM.x), 2)],
      ['wellhead northing m', n(utmN(PLATFORM.y), 2)],
      ['crs', `${FRAME.crs} ${FRAME.crs_name}`],
      ['north reference', 'Grid'],
      ['grid convergence deg', '-0.42'],
      ['magnetic declination deg', '1.85'],
      ['declination date', '2026-01-01'],
      ['kb above msl m', n(FRAME.kb_m, 2)],
      ['water depth m', n(FRAME.water_depth_m, 2)],
      ['slot spacing m', '2.5'],
      ['existing wellbores', 'Ekene-8, Ekene-9, Ekene-10, Ekene-12'],
    ],
  ));
  say('  well design: Ekene-11 targets and the Ekene Alpha site card');
}

// ===========================================================================
// 14. Episode notes — the one thing the scripts are missing
// ===========================================================================

const EPISODES = [
  { n: 1, app: 'Well Data Manager', files: [
    ['01-wells/Ekene-1.las', 'the hero well\'s log file'],
    ['01-wells/surveys/Ekene-1-survey.csv', 'paste into the Deviation tab (MD, inclination, azimuth; metres; grid north)'],
    ['01-wells/tops/Ekene-1-tops.csv', 'paste into the Tops tab (name and MD)'],
    ['01-wells/checkshots/Ekene-1-checkshots.csv', 'paste into the Checkshots tab; leave the selectors on the default measured depth and one way time, which is what this file is'],
    ['01-wells/well-headers.csv', 'the header values to type: KB 25 m, water depth 35 m, surface easting and northing, CRS'],
  ], note: 'Build Ekene-1 by hand from the CSVs, then import its LAS into it. Every later episode uses this well.' },
  { n: 2, app: 'Petrophysics Studio', files: [
    ['01-wells/Ekene-1.las', 'already in the registry from Episode 1'],
  ], note: 'The water leg is 1560.0 to 1580.0 m MD — type those into the Pickett water-zone fields. '
    + 'The fit returns m near 2 and a*Rw near the true Rw of the 35,000 ppm brine at formation temperature. '
    + 'Linear is the honest Vsh model here and it is also the exact one: GR is linear in clay fraction in this data. '
    + 'Matrix 2.65 for the density porosity. Zones: build them from the tops with Fill between tops.' },
  { n: 3, app: 'Well Correlation', files: [
    ['01-wells/Ekene-5.las, Ekene-1.las, Ekene-6.las, Ekene-2.las', 'a west-to-east section across the field and across the fault'],
    ['01-wells/tops/*-tops.csv', 'the same nine surfaces in every well'],
  ], note: 'Correlate on the Ogbia Shale: it is a maximum flooding surface, the strongest and most '
    + 'continuous gamma ray marker in the section, and it sits 250 m above the reservoir. '
    + 'The bed character inside every package is the same sequence in every well, at that well\'s own depths, '
    + 'so the section correlates the way a real one does. Share one well with a colleague before the take.' },
  { n: 4, app: 'Mapping & Surface Studio', files: [
    ['the six TOP_SAND picks already in the registry', 'grid these; six wells, well spread'],
    ['02-surfaces/EkeneSand-base-6wells.zmap', 'the deeper surface for the isochore, if you would rather import than re-grid'],
    ['02-surfaces/OboroSand-top.zmap', 'the grid file to import in section 09'],
    ['03-culture/ek11-licence-boundary.geojson', 'the boundary polygon'],
  ], note: 'Grid the Ekene Sand from the SIX development wells at a 100 m cell: that is the map the whole '
    + 'series is built on and it reproduces the field\'s published volumetrics exactly. '
    + 'For the re-grid beat, add Ekene-7: it is an appraisal well the six-well map predicts at 1543.33 m '
    + 'and which actually found the sand at 1549.0 m, so the map visibly moves and you can say by how much.' },
  { n: 5, app: 'ReservoirCalc Pro', files: [
    ['the published Ekene Sand surface from Episode 4', 'the area and the structure'],
    ['the Ekene Sand zone from Episode 2', 'porosity, water saturation and net to gross'],
    ['03-culture/ek11-licence-boundary.geojson', 'the area of interest'],
  ], note: 'The oil water contact is 1560 m. Moving it 50 ft is worth a visible volume change on this structure '
    + 'because the oil column is only 20.3 m at the crest. The deterministic answer on the published map '
    + 'is 12.14 MMstb, which is the number the Academy teaches and the reservoir fixture carries.' },
  { n: 6, app: 'Seismolord', files: [
    ['04-seismic/EKENE3D-small.sgy', 'import this one on camera; it decodes inside a take'],
    ['04-seismic/EKENE3D-full.sgy', 'have this one imported already'],
    ['04-seismic/README-seismic.md', 'polarity, byte positions, datum'],
  ], note: 'Top Ekene Sand is a PEAK under SEG normal polarity: the reservoir is faster and denser than the '
    + 'overpressured shale above it. Set the snap event to peak before you place a seed. '
    + 'Tie on Ekene-1, which carries sonic, density and an imported checkshot set. '
    + 'Pick the growth fault at the Oboro or Akata level, where it has real throw; it dies out above the reservoir, '
    + 'which is exactly why the Ekene tank is unfaulted.' },
  { n: 7, app: 'Earth Modeling', files: [
    ['the Ekene Sand surface from Episode 4 and the horizon surface from Episode 6', 'two surfaces from two applications'],
    ['02-surfaces/OboroSand-top.zmap', 'a third surface for a second zone'],
    ['03-culture/ekene-growth-fault.geojson', 'the fault polygon'],
    ['03-culture/ek11-licence-boundary.geojson', 'the boundary'],
  ], note: 'The fault splits the wells four west (Ekene-1, -3, -5, -7) to three east (Ekene-2, -4, -6). '
    + 'At the Ekene Sand only Ekene-6 and Ekene-10 carry a pay zone in the eastern block, because Ekene-2 and '
    + 'Ekene-4 found the sand wet. So the western block krigs and the eastern one falls back, with the reason '
    + 'written down. That is the beat worth filming.' },
  { n: 8, app: 'Stratigraphy Studio', files: [
    ['06-stratigraphy/ekene-stratigraphic-column.csv', 'nine dated surfaces'],
    ['06-stratigraphy/ekene-biozones.csv', 'biozones and environments'],
    ['01-wells/Ekene-10.las', 'carries the LITH lithology curve'],
    ['06-stratigraphy/core-photographs/README.md', 'cored intervals to label your own photographs with'],
  ], note: 'The unconformity is the Oboro Unconformity at 1790 m in Ekene-1, with a hiatus from 16.4 to 20.5 Ma. '
    + 'That is the gap the Wheeler chart turns into something measurable. Save a section in Well Correlation first.' },
  { n: 9, app: 'Pore Pressure Studio', files: [
    ['01-wells/Ekene-1.las', 'sonic and density'],
    ['01-wells/Ekene-9.las', 'sonic but NO density, so the Gardner substitution beat has a real well'],
    ['05-pressure/ekene-mdt-pressures.csv', 'formation pressures'],
    ['05-pressure/ekene-lot-fit.csv', 'leak-off and formation integrity tests at the shoes'],
    ['05-pressure/ekene-mud-weights.csv', 'mud weights that worked, and one that did not'],
    ['05-pressure/ekene-1-designed-prognosis.csv', 'the truth, to check yourself against off camera'],
  ], note: 'Mudline is 60 m MD. Water depth 35 m. The section is normally pressured to 1290 m and overpressured '
    + 'below it, so pick the compaction trend ABOVE 1290 m. Picking it below is the collapse the episode wants. '
    + 'Eaton at exponent 3 returns 12.02 ppg at the reservoir, which is the field\'s published initial pressure '
    + 'of 3200 psia at 1560 m. The mud weight row that failed is the 11.2 ppg attempt at 1418 m.' },
  { n: 10, app: 'Well Design Studio', files: [
    ['07-well-design/ekene-alpha-site.csv', 'the site: wellhead, CRS, north reference, convergence, declination'],
    ['07-well-design/ekene-11-targets.csv', 'the targets'],
    ['01-wells/Ekene-10-definitive-survey.xlsx', 'the actual survey to import in section 09'],
    ['01-wells/surveys/Ekene-12-survey.csv', 'the neighbour to scan against'],
    ['the prognosis published from Episode 9', 'the mud window on the trajectory'],
  ], note: 'Four wellbores are already on the pad (Ekene-8, -9, -10, -12) at 2.5 m slot spacing, so anti-collision '
    + 'has something real to scan. Ekene-11 is the well being designed and it is the only one in this kit with no logs.' },
];

for (const e of EPISODES) {
  const lines = [
    `# Episode ${String(e.n).padStart(2, '0')} — ${e.app}`, '',
    '## Data for this episode', '',
    ...e.files.map(([f, why]) => `- \`${f}\` — ${why}`), '',
    '## Before the take', '', e.note, '',
    `Kit: \`${KIT.name}-${KIT.version}\`. Field: Ekene, ${FRAME.licence}, ${crsLabel}.`,
    'Everything in this kit is synthetic and internally consistent: it is generated from one earth model,',
    'so the numbers agree wherever two applications look at the same rock.',
  ];
  write(`episodes/episode-${String(e.n).padStart(2, '0')}-${e.app.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, `${lines.join('\n')}\n`);
}
say(`  episode notes: ${EPISODES.length} files naming exactly what to load`);

// ===========================================================================
// 15. Manifest and front page
// ===========================================================================

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push({ path: rel, bytes: fs.statSync(path.join(dir, e.name)).size });
  }
  return out;
}

write('00-START-HERE.md', [
  '# Ekene Field — demonstration dataset', '',
  `Kit \`${KIT.name}-${KIT.version}\`. Generated by \`tools/demo-dataset/generate.mjs\`.`,
  'Deterministic: regenerating gives byte-identical files.', '',
  '## What this is', '',
  'One field, carried across the whole tutorial series. The wells, the maps, the seismic,',
  'the pressures and the well plans are all generated from a single earth model, so a number',
  'a presenter reads in one application agrees with the same number in the next. That',
  'agreement is the thing the series is demonstrating.', '',
  '**Ekene is not a real field.** It is the teaching field the Petrolord Academy already uses,',
  'put on camera. Its volumetrics, PVT, rock curves and production history are the values ten',
  'Academy courses teach, so a viewer who takes a course after watching a video meets the same',
  'field again.', '',
  '## The field', '', 
  `| | |`, `|---|---|`,
  `| Licence | ${FRAME.licence}, ${FRAME.country} |`,
  `| CRS | ${crsLabel} |`,
  `| Water depth | ${FRAME.water_depth_m} m, KB ${FRAME.kb_m} m above MSL, mudline ${FRAME.mudline_md} m MD |`,
  `| Reservoirs | Ekene Sand (oil, contact ${LOCKED.owc_m} m MD) and Oboro Sand (gas, contact ${OBORO.gwc_m} m MD) |`,
  `| STOIIP | ${(LOCKED.stoiip_stb / 1e6).toFixed(3)} MMstb |`,
  `| Reservoir | ${LOCKED.pi_psia} psia at the contact, bubble point ${LOCKED.pb_psia} psia, ${LOCKED.temp_f} degF, ${LOCKED.api} API |`,
  `| Wells | ${built.length} (six development, one appraisal, four from the platform, one planned) |`,
  `| Structure | drape anticline over a growth fault that dies out below the reservoir |`, '',
  '## Folders', '',
  '| Folder | What is in it |', '|---|---|',
  '| `01-wells` | LAS logs, deviation surveys, tops, checkshots, well headers |',
  '| `02-surfaces` | gridded structure in ZMAP+, CPS-3 and XYZ |',
  '| `03-culture` | licence boundary and fault trace as GeoJSON |',
  '| `04-seismic` | two SEG-Y volumes, small and full |',
  '| `05-pressure` | MDT pressures, shoe tests, mud weights, the designed prognosis |',
  '| `06-stratigraphy` | dated column, biozones, cored intervals |',
  '| `07-well-design` | site card and targets |',
  '| `episodes` | one note per episode naming exactly what to load |', '',
  '## The chain', '',
  'Episode 1 builds the well. 2 interprets it. 3 correlates it. 4 maps it. 5 turns the map into a',
  'volume. 6 ties the seismic to it. 7 models it. 8 dates it. 9 turns it into a drilling decision.',
  '10 plans the next well from that decision. Keep Ekene-1 as the well throughout.', '',
  '## What agrees with what', '',
  '- Water saturation in the logs comes from the field\'s own capillary pressure curve, so the',
  '  crest drains to Sw 0.3506 exactly as the reservoir fixture says it does.',
  `- Water resistivity is the ${LOCKED.salinity_ppm.toLocaleString('en-US')} ppm brine at formation temperature. A Pickett plot on`,
  '  Ekene-1\'s water leg recovers it.',
  `- The pore pressure prognosis lands on ${LOCKED.pi_psia} psia at the contact, which is the field's published`,
  `  initial reservoir pressure, ${PRESSURE_MODEL.emwAtDatum.toFixed(2)} ppg equivalent mud weight.`,
  '- The seismic is convolved from the same density and sonic the LAS files carry, so the synthetic ties.',
  `- Gridding the six development wells gives ${LOCKED.oil_cells} oil cells and a ${LOCKED.max_oil_column_m} m`,
  '  maximum oil column, which are the field\'s published numbers.', '',
  '## Heavy files', '',
  'The SEG-Y volumes are release assets. Everything else is text and travels with the kit.',
].join('\n'));

const files = walk(OUT);
const manifest = {
  kit: `${KIT.name}-${KIT.version}`,
  generated_by: 'tools/demo-dataset/generate.mjs',
  plan: 'docs/scope/DemoDataset-PLAN.md',
  field: LOCKED.field,
  synthetic: true,
  crs: FRAME.crs,
  locked_values_reproduced: {
    oil_cells: LOCKED.oil_cells,
    max_oil_column_m: LOCKED.max_oil_column_m,
    stoiip_stb: LOCKED.stoiip_stb,
    ntg: sFinal.ntg,
    net_porosity: sFinal.phiNet,
    initial_pressure_psia: LOCKED.pi_psia,
    pore_pressure_at_contact_psia: PRESSURE_MODEL.ppPsi(PRESSURE.datum_md),
    reservoir_temperature_f: tempF(OIL_CONTACT_TVDSS),
    rw_at_reservoir_ohmm: rwAt(LOCKED.temp_f),
    sw_at_crest: OIL_SH.swAtHeightAboveFwl(LOCKED.max_oil_column_m + OIL_SH.entry_m),
  },
  tuning: TUNING,
  wells: built.map((b) => ({
    name: b.well.name, kind: b.well.kind, purpose: b.well.purpose,
    td_md_m: b.survey.stations[b.survey.stations.length - 1].md,
    curves: CURVES[b.well.curves],
    fault_block: geo.faultSide(b.well.x, b.well.y),
    samples: b.rows.length,
  })),
  files,
  total_bytes: files.reduce((a, f) => a + f.bytes, 0),
};
write('MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);

say('');
say(`  ${files.length} files, ${(manifest.total_bytes / 1048576).toFixed(1)} MB total`);
say(`  written to ${path.relative(ROOT, OUT)}`);
write('GENERATION-REPORT.txt', `${report.join('\n')}\n`);
