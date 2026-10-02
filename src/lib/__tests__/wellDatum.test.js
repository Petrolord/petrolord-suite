/** @jest-environment node */
// Well datum model gate (WDM U2-007). The numbers are worked by hand from
// geometry, never read back from the module:
//
// Path (both wells): vertical to 1,000 m MD, a 30 degree build over 300 m
// (constant curvature, azimuth 90), then a 1,000 m tangent at 30 degrees.
//   build radius  R = 300 / (pi/6)          = 572.9578 m
//   build TVD     R sin 30                   = 286.4789 m
//   tangent TVD   1000 cos 30                = 866.0254 m
//   TVD at 2,300 m MD = 1000 + 286.4789 + 866.0254 = 2152.5043 m
//   TVD at 1,300 m MD = 1286.4789 m
//
// Offshore: KB 25 m above MSL (the air gap), 100 m of water.
//   mudline TVD = 125 m; TVDSS(2300) = 2127.5043; below mudline 2027.5043
// Onshore: ground 312 m, KB 318.5 m above MSL (6.5 m above ground).
//   TVDSS(2300) = 1834.0043; below ground 2146.0043;
//   at 200 m MD the hole is 118.5 m ABOVE sea level (TVDSS -118.5)

import {
  readWellDatum, makeWellFrame, tvdssFromTvd, tvdFromTvdss, elevationFromTvdss, surfaceTvd,
  belowSurfaceFromTvd, tvdFromBelowSurface, airGapM, refElevForPath, validateDatum, datumFromEntry,
  datumToEntry, proposeDatumFromLas, datumChangeImpact, datumChangeRecord, datumChangeLine, datumPatch,
  datumInsertFields, datumLine, tvdssBasisText, datumColumnsPresent, DATUM_COLUMNS, DEPTH_REF_KINDS,
} from '../wellDatum';
import { makeDepthFrame } from '../../../packages/engines/engines/welldata/checkshots.js';
import { parseLas } from '../../../packages/engines/engines/welldata/lasParse.js';
import { M_PER_FT } from '../units/registry';

const DEVIATION = [
  { md: 0, inc: 0, azi: 0 },
  { md: 1000, inc: 0, azi: 90 },
  { md: 1300, inc: 30, azi: 90 },
  { md: 2300, inc: 30, azi: 90 },
];
const R = 300 / (Math.PI / 6);
const TVD_1300 = 1000 + R * Math.sin(Math.PI / 6);
const TVD_2300 = TVD_1300 + 1000 * Math.cos(Math.PI / 6);

const nullDatum = { depth_ref_kind: null, depth_ref_label: null, depth_ref_elev_m: null, well_environment: null, ground_elev_m: null, water_depth_m: null, vertical_datum: null, elev_unit: null, datum_changes: null };
const OFFSHORE = { id: 'w-off', name: 'OFF-1', kb_m: 25, td_md_m: 2300, deviation: DEVIATION, ...nullDatum,
  depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'offshore', water_depth_m: 100, vertical_datum: 'MSL', elev_unit: 'm' };
const ONSHORE = { id: 'w-on', name: 'ON-1', kb_m: 318.5, td_md_m: 2300, deviation: DEVIATION, ...nullDatum,
  depth_ref_kind: 'KB', depth_ref_elev_m: 318.5, well_environment: 'onshore', ground_elev_m: 312, vertical_datum: 'MSL', elev_unit: 'm' };

describe('hand-worked path', () => {
  test('the figures in the header are the geometry', () => {
    expect(R).toBeCloseTo(572.9578, 4);
    expect(TVD_1300).toBeCloseTo(1286.4789, 4);
    expect(TVD_2300).toBeCloseTo(2152.5043, 4);
  });
});

describe('offshore deviated well: KB 25 m above MSL, 100 m of water', () => {
  const frame = makeWellFrame(OFFSHORE);
  test('MD to TVD, TVDSS, elevation and depth below mudline at TD', () => {
    const p = frame.mdToPosition(2300);
    expect(p.tvd).toBeCloseTo(2152.5043, 3);
    expect(p.tvdss).toBeCloseTo(2127.5043, 3);
    expect(p.elevation).toBeCloseTo(-2127.5043, 3);
    expect(p.belowSurface).toBeCloseTo(2027.5043, 3);
    expect(p.extrapolated).toBe(false);
  });
  test('end of build', () => {
    const p = frame.mdToPosition(1300);
    expect(p.tvd).toBeCloseTo(1286.4789, 3);
    expect(p.tvdss).toBeCloseTo(1261.4789, 3);
    expect(p.belowSurface).toBeCloseTo(1161.4789, 3);
  });
  test('the mudline: TVD 125 m, TVDSS = water depth, 0 below mudline', () => {
    expect(surfaceTvd(frame.datum)).toBe(125);
    expect(airGapM(frame.datum)).toBe(25);
    const p = frame.mdToPosition(125);
    expect(p.tvdss).toBeCloseTo(100, 9);
    expect(p.belowSurface).toBeCloseTo(0, 9);
    // the rig floor itself is 25 m above sea level
    expect(frame.mdToPosition(0).elevation).toBeCloseTo(25, 9);
  });
  test('inverse lookups return the MD they came from', () => {
    expect(frame.tvdssToMd(2127.5043).md).toBeCloseTo(2300, 2);
    expect(frame.tvdToMd(2152.5043).md).toBeCloseTo(2300, 2);
    expect(frame.belowSurfaceToMd(2027.5043).md).toBeCloseTo(2300, 2);
    expect(frame.tvdssToMd(1261.4789).md).toBeCloseTo(1300, 2);
  });
  test('NEGATIVE CONTROL: the wrong sign and a forgotten KB both miss the hand value', () => {
    const tvd = frame.mdToPosition(2300).tvd;
    const swapped = tvd + 25;      // sign swapped
    const ignored = tvd;           // KB ignored
    expect(Math.abs(swapped - 2127.5043)).toBeGreaterThan(49);
    expect(Math.abs(ignored - 2127.5043)).toBeGreaterThan(24);
    expect(tvdssFromTvd(tvd, frame.datum)).not.toBeCloseTo(swapped, 0);
    expect(tvdssFromTvd(tvd, frame.datum)).not.toBeCloseTo(ignored, 0);
    // depth below mudline: forgetting the air gap or the water misses too
    expect(Math.abs((tvd - 100) - 2027.5043)).toBeGreaterThan(24);
    expect(Math.abs((tvd - 25) - 2027.5043)).toBeGreaterThan(99);
  });
  test('agrees with the vendored engine frame on the same elevation', () => {
    const engine = makeDepthFrame({ deviation: DEVIATION, kbM: 25, tdMdM: 2300 });
    for (const md of [0, 500, 1000, 1150, 1300, 2000, 2300, 2500]) {
      const a = frame.mdToTvdss(md); const b = engine.mdToTvdss(md);
      expect(a.tvd).toBeCloseTo(b.tvd, 9);
      expect(a.tvdss).toBeCloseTo(b.tvdss, 9);
      expect(a.extrapolated).toBe(b.extrapolated);
    }
    expect(frame.kbM).toBe(25);
    expect(frame.stations).toHaveLength(4);
    expect(frame.path[3].tvdss).toBeCloseTo(2127.5043, 3);
  });
});

describe('onshore deviated well: ground 312 m, KB 318.5 m above MSL', () => {
  const frame = makeWellFrame(ONSHORE);
  test('MD to TVDSS and depth below ground at TD', () => {
    const p = frame.mdToPosition(2300);
    expect(p.tvd).toBeCloseTo(2152.5043, 3);
    expect(p.tvdss).toBeCloseTo(1834.0043, 3);
    expect(p.elevation).toBeCloseTo(-1834.0043, 3);
    expect(p.belowSurface).toBeCloseTo(2146.0043, 3);
  });
  test('a point above sea level has a negative TVDSS and a positive elevation', () => {
    const p = frame.mdToPosition(200);
    expect(p.tvdss).toBeCloseTo(-118.5, 9);
    expect(p.elevation).toBeCloseTo(118.5, 9);
    expect(p.belowSurface).toBeCloseTo(193.5, 9);
  });
  test('the KB stands 6.5 m above ground', () => {
    expect(surfaceTvd(frame.datum)).toBeCloseTo(6.5, 9);
    expect(Number.isNaN(airGapM(frame.datum))).toBe(true);
  });
  test('NEGATIVE CONTROL: wrong sign or no KB', () => {
    const tvd = frame.mdToPosition(2300).tvd;
    expect(Math.abs((tvd + 318.5) - 1834.0043)).toBeGreaterThan(600);
    expect(Math.abs(tvd - 1834.0043)).toBeGreaterThan(300);
    // depth below ground computed from ground level instead of the KB height misses by 305.5 m
    expect(Math.abs((tvd - 312) - 2146.0043)).toBeGreaterThan(300);
  });
  test('a well measured from ground level', () => {
    const gl = makeWellFrame({ ...ONSHORE, depth_ref_kind: 'GL', depth_ref_elev_m: 312, kb_m: 312 });
    const p = gl.mdToPosition(1000);
    expect(p.tvdss).toBeCloseTo(688, 9);
    expect(p.belowSurface).toBeCloseTo(1000, 9);
  });
});

describe('scalar conversions', () => {
  const d = readWellDatum(OFFSHORE);
  test('round trips', () => {
    expect(tvdFromTvdss(tvdssFromTvd(1500, d), d)).toBe(1500);
    expect(tvdFromBelowSurface(belowSurfaceFromTvd(1500, d), d)).toBe(1500);
    expect(elevationFromTvdss(100)).toBe(-100);
  });
  test('non-numbers give NaN, never 0', () => {
    expect(Number.isNaN(tvdssFromTvd(NaN, d))).toBe(true);
    expect(Number.isNaN(tvdssFromTvd(undefined, d))).toBe(true);
    expect(Number.isNaN(tvdssFromTvd(100, null))).toBe(true);
  });
});

describe('unset is distinct from 0', () => {
  test('columns present, nothing stated, kb_m 0: TVDSS refused with the reason', () => {
    const well = { id: 'lad', name: 'Lad', kb_m: 0, td_md_m: 2300, deviation: DEVIATION, ...nullDatum };
    const d = readWellDatum(well);
    expect(d.state).toBe('unset');
    expect(d.tvdssOk).toBe(false);
    expect(d.tvdssReason).toMatch(/Lad has no depth reference elevation/);
    expect(d.tvdssReason).toMatch(/Well Data Manager/);
    const frame = makeWellFrame(well);
    const p = frame.mdToPosition(2300);
    expect(p.tvd).toBeCloseTo(2152.5043, 3);       // TVD needs no datum
    expect(Number.isNaN(p.tvdss)).toBe(true);
    expect(Number.isNaN(p.elevation)).toBe(true);
    expect(frame.tvdssToMd(1000)).toBeNull();
    expect(frame.tvdToMd(1000).md).toBeCloseTo(1000, 6);
    expect(Number.isNaN(frame.kbM)).toBe(true);
    expect(Number.isNaN(refElevForPath(well))).toBe(true);
    expect(Number.isNaN(frame.path[3].tvdss)).toBe(true);
    expect(datumLine(d)).toBe('Depth reference not set');
  });
  test('an explicit 0 (measured from mean sea level) is a value', () => {
    const well = { name: 'MSL-1', kb_m: 0, deviation: [], ...nullDatum, depth_ref_kind: 'MSL', depth_ref_elev_m: 0, vertical_datum: 'MSL' };
    const d = readWellDatum(well);
    expect(d.state).toBe('set');
    expect(d.tvdssOk).toBe(true);
    expect(makeWellFrame(well).mdToTvdss(1500).tvdss).toBe(1500);
    expect(refElevForPath(well)).toBe(0);
  });
  test('before the migration (no columns): kb_m 0 keeps the earlier behaviour, with a note', () => {
    const well = { name: 'Old', kb_m: 0, deviation: [] };
    expect(datumColumnsPresent(well)).toBe(false);
    const d = readWellDatum(well);
    expect(d.state).toBe('legacy-zero');
    expect(d.tvdssOk).toBe(true);
    expect(d.note).toMatch(/cannot yet tell 0 from not entered/);
    expect(makeWellFrame(well).mdToTvdss(1500).tvdss).toBe(1500);
  });
  test('before the migration: a non-zero kb_m is the KB elevation', () => {
    const d = readWellDatum({ name: 'Old', kb_m: 62.01 });
    expect(d.state).toBe('legacy-kb');
    expect(d.refKind).toBe('KB');
    expect(d.refElevM).toBe(62.01);
    expect(d.note).toBeNull();
  });
  test('after the migration: a row an older build wrote (kb_m only) reads as KB and says so', () => {
    const d = readWellDatum({ name: 'Old', kb_m: 62.01, ...nullDatum });
    expect(d.state).toBe('legacy-kb');
    expect(d.refElevM).toBe(62.01);
    expect(d.note).toMatch(/earlier KB field/);
  });
  test('the stated value wins over kb_m', () => {
    const d = readWellDatum({ name: 'X', kb_m: 10, ...nullDatum, depth_ref_kind: 'RT', depth_ref_elev_m: 31.2 });
    expect(d.refElevM).toBe(31.2);
    expect(d.refKind).toBe('RT');
    expect(d.refLabel).toBe('RT');
  });
  test('depth below mudline needs the environment and the water depth', () => {
    const d = readWellDatum({ name: 'X', kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 });
    expect(d.surfaceOk).toBe(false);
    expect(d.surfaceReason).toMatch(/onshore or offshore/);
    const off = readWellDatum({ name: 'X', kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'offshore' });
    expect(off.surfaceReason).toMatch(/no water depth/);
    const on = readWellDatum({ name: 'X', kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'onshore' });
    expect(on.surfaceReason).toMatch(/no ground level/);
  });
});

describe('hostile inputs', () => {
  test('feet and metres through the unit registry', () => {
    const ft = datumFromEntry({ refKind: 'KB', refElev: '82', environment: 'offshore', waterDepth: '328.084', verticalDatum: 'MSL' }, 'ft');
    expect(ft.errors).toEqual([]);
    expect(ft.datum.refElevM).toBeCloseTo(82 * M_PER_FT, 12);
    expect(ft.datum.refElevM).toBeCloseTo(24.9936, 10);
    expect(ft.datum.waterDepthM).toBeCloseTo(100.0000032, 6);
    expect(ft.datum.elevUnit).toBe('ft');
    const m = datumFromEntry({ refKind: 'KB', refElev: '24.9936' }, 'm');
    expect(m.datum.refElevM).toBe(24.9936);
    // NEGATIVE CONTROL: reading the feet as metres is 57 m out
    expect(Math.abs(82 - ft.datum.refElevM)).toBeGreaterThan(57);
    // and back, in either unit
    const row = { name: 'F', kb_m: ft.datum.refElevM, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: ft.datum.refElevM, elev_unit: 'ft' };
    expect(datumToEntry(readWellDatum(row), 'ft').refElev).toBe('82');
    expect(datumToEntry(readWellDatum(row), 'm').refElev).toBe('24.994');
  });
  test('a comma decimal is read; text is refused', () => {
    expect(datumFromEntry({ refKind: 'KB', refElev: '25,5' }, 'm').datum.refElevM).toBe(25.5);
    expect(datumFromEntry({ refKind: 'KB', refElev: 'abc' }, 'm').errors.join(' ')).toMatch(/Reference elevation must be a number/);
  });
  test('blank stays not set (null), never 0', () => {
    const r = datumFromEntry({ refKind: '', refElev: '', groundElev: ' ', waterDepth: '' }, 'm');
    expect(r.errors).toEqual([]);
    expect(r.datum.refElevM).toBeNull();
    expect(r.datum.groundElevM).toBeNull();
    expect(r.datum.waterDepthM).toBeNull();
  });
  test('negative KB: refused offshore, warned on land', () => {
    const off = validateDatum({ refKind: 'KB', refElevM: -25, environment: 'offshore', waterDepthM: 100 });
    expect(off.errors.join(' ')).toMatch(/offshore KB cannot be below the vertical datum/);
    const on = validateDatum({ refKind: 'KB', refElevM: -12, environment: 'onshore', groundElevM: -18 });
    expect(on.errors).toEqual([]);
    expect(on.warnings.join(' ')).toMatch(/negative/);
  });
  test('water depth on an onshore well is refused', () => {
    const r = validateDatum({ refKind: 'KB', refElevM: 318.5, environment: 'onshore', groundElevM: 312, waterDepthM: 100 });
    expect(r.errors.join(' ')).toMatch(/Water depth belongs to an offshore well/);
  });
  test('ground level on an offshore well, negative water depth, a KB below ground', () => {
    expect(validateDatum({ refKind: 'KB', refElevM: 25, environment: 'offshore', groundElevM: 4 }).errors.join(' ')).toMatch(/Ground level belongs to an onshore well/);
    expect(validateDatum({ refKind: 'KB', refElevM: 25, environment: 'offshore', waterDepthM: -100 }).errors.join(' ')).toMatch(/cannot be negative/);
    expect(validateDatum({ refKind: 'KB', refElevM: 300, environment: 'onshore', groundElevM: 312 }).errors.join(' ')).toMatch(/below ground level/);
    expect(validateDatum({ refKind: 'GL', refElevM: 0, environment: 'offshore' }).errors.join(' ')).toMatch(/onshore reference/);
  });
  test('an elevation with no kind, an unknown kind, an unnamed "other", a unit slip', () => {
    expect(validateDatum({ refElevM: 25 }).errors.join(' ')).toMatch(/Say what the reference elevation belongs to/);
    expect(validateDatum({ refKind: 'XX', refElevM: 25 }).errors.join(' ')).toMatch(/Unknown depth reference/);
    expect(validateDatum({ refKind: 'OTHER', refElevM: 25 }).errors.join(' ')).toMatch(/Name the depth reference/);
    expect(validateDatum({ refKind: 'OTHER', refLabel: 'Casing flange', refElevM: 25 }).errors).toEqual([]);
    expect(validateDatum({ refKind: 'KB', refElevM: 62010 }).errors.join(' ')).toMatch(/Check the unit/);
  });
  test('ground level reference: the two elevations must agree, and one fills the other', () => {
    expect(validateDatum({ refKind: 'GL', refElevM: 312, groundElevM: 300, environment: 'onshore' }).errors.join(' ')).toMatch(/differ/);
    expect(validateDatum({ refKind: 'GL', refElevM: 312, environment: 'onshore' }).datum.groundElevM).toBe(312);
    expect(validateDatum({ refKind: 'GL', groundElevM: 312, environment: 'onshore' }).datum.refElevM).toBe(312);
  });
  test('measured from mean sea level: elevation is 0, a non-zero value is refused', () => {
    expect(validateDatum({ refKind: 'MSL' }).datum.refElevM).toBe(0);
    expect(validateDatum({ refKind: 'MSL', refElevM: 12 }).errors.join(' ')).toMatch(/reference elevation of 0/);
    // against LAT, mean sea level does sit above the datum
    expect(validateDatum({ refKind: 'MSL', refElevM: 1.4, verticalDatum: 'LAT' }).errors).toEqual([]);
  });
  test('a KB typed as exactly 0 is questioned', () => {
    expect(validateDatum({ refKind: 'KB', refElevM: 0 }).warnings.join(' ')).toMatch(/Leave the elevation blank/);
  });
});

describe('LAS header proposals', () => {
  const las = (params) => parseLas([
    '~Version', ' VERS. 2.0 :', ' WRAP. NO :',
    '~Well', ' STRT.FT 1000 :', ' STOP.FT 1002 :', ' STEP.FT 1 :', ' NULL. -999.25 :', ' WELL. HOSTILE-1 :',
    '~Parameter', ...params,
    '~Curve', ' DEPT.FT :', ' GR.GAPI :',
    '~A', '1000 50', '1001 51', '1002 52', '',
  ].join('\n'));

  test('a land well: KB and ground level in feet, permanent datum MSL', () => {
    const p = proposeDatumFromLas(las([' EKB.F 1045.0 : KB elevation', ' EGL.F 1023.7 : Ground elevation', ' LMF. KB : Log measured from', ' DMF. KB :', ' PDAT. MSL :', ' APD.F 1045.0 :', ' EPD.F 0 :']));
    expect(p.empty).toBe(false);
    expect(p.fields.refKind).toBe('KB');
    expect(p.fields.refElevM).toBeCloseTo(1045 * 0.3048, 9);
    expect(p.fields.groundElevM).toBeCloseTo(1023.7 * 0.3048, 9);
    expect(p.fields.verticalDatum).toBe('MSL');
    expect(p.fields.environment).toBe('onshore');
    expect(p.fields.elevUnit).toBe('ft');
    expect(p.conflicts).toEqual([]);
    expect(p.found.map((f) => f.mnemonic)).toEqual(expect.arrayContaining(['EKB', 'EGL', 'APD', 'EPD', 'LMF', 'DMF', 'PDAT']));
  });
  test('permanent datum is ground level: EPD is the ground elevation, APD the KB height above it', () => {
    const p = proposeDatumFromLas(las([' PDAT. GL :', ' EPD.M 312 :', ' APD.M 6.5 :', ' LMF. KB :']));
    expect(p.fields.refKind).toBe('KB');
    expect(p.fields.refElevM).toBeCloseTo(318.5, 9);
    expect(p.fields.groundElevM).toBe(312);
    expect(p.fields.environment).toBe('onshore');
  });
  test('drill floor reference with EDF', () => {
    const p = proposeDatumFromLas(las([' EDF.M 31.2 :', ' LMF. DF :', ' PDAT. LAT :']));
    expect(p.fields.refKind).toBe('DF');
    expect(p.fields.refElevM).toBe(31.2);
    expect(p.fields.verticalDatum).toBe('LAT');
    expect(p.fields.environment).toBeNull();
  });
  test('EKB and APD + EPD that disagree are flagged, EKB proposed', () => {
    const p = proposeDatumFromLas(las([' EKB.M 25 :', ' APD.M 24.4 :', ' EPD.M 0 :', ' LMF. KB :', ' PDAT. MSL :']));
    expect(p.fields.refElevM).toBe(25);
    expect(p.conflicts.join(' ')).toMatch(/disagree/);
  });
  test('LMF and DMF that disagree: the log reference wins and it is said', () => {
    const p = proposeDatumFromLas(las([' EKB.M 25 :', ' EDF.M 24.6 :', ' LMF. DF :', ' DMF. KB :']));
    expect(p.fields.refKind).toBe('DF');
    expect(p.fields.refElevM).toBe(24.6);
    expect(p.conflicts.join(' ')).toMatch(/LMF/);
  });
  test('a null value, a 0 placeholder and a missing unit are not turned into elevations silently', () => {
    const nul = proposeDatumFromLas(las([' EKB.F -999.25 :', ' LMF. KB :']));
    expect(nul.fields.refElevM).toBeNull();
    expect(nul.notes.join(' ')).toMatch(/null value/);
    const zero = proposeDatumFromLas(las([' EKB.F 0 :', ' LMF. KB :']));
    expect(zero.fields.refElevM).toBeNull();
    expect(zero.notes.join(' ')).toMatch(/usually a blank header/);
    const noUnit = proposeDatumFromLas(las([' EKB. 82 :', ' LMF. KB :']));
    expect(noUnit.fields.refElevM).toBeCloseTo(82 * 0.3048, 9);
    expect(noUnit.notes.join(' ')).toMatch(/read in the file's depth unit \(ft\)/);
  });
  test('measured from mean sea level: 0 is the proposal', () => {
    const p = proposeDatumFromLas(las([' LMF. MSL :', ' PDAT. MSL :', ' APD.M 0 :']));
    expect(p.fields.refKind).toBe('MSL');
    expect(p.fields.refElevM).toBe(0);
  });
  test('nothing in the header: an empty proposal', () => {
    const p = proposeDatumFromLas(las([' BHT.DEGF 180 :']));
    expect(p.empty).toBe(true);
  });
  test('the WDM hostile Petrel export proposes its EKB and EGL', () => {
    const fs = require('fs');
    const path = require('path');
    const text = fs.readFileSync(path.join(__dirname, '../../../e2e/fixtures/wdm/hostile/las20_petrel_export.las'), 'utf8');
    const p = proposeDatumFromLas(parseLas(text));
    expect(p.found.some((f) => f.mnemonic === 'EKB')).toBe(true);
    expect(Number.isFinite(p.fields.refElevM)).toBe(true);
    expect(p.fields.refKind).toBe('KB');
  });
});

describe('correcting a datum', () => {
  const well = { ...OFFSHORE, checkshots: [{ tvdss_m: 100, twt_ms: 130 }, { tvdss_m: 900, twt_ms: 800 }], checkshots_provenance: { units_in: { depth_ref: 'md', depth_unit: 'm', time: 'owt' }, kb_m_used: 25 } };
  const counts = { tops: 14, curves: 21, zones: 3, unit: 'm' };
  test('a correction says the shift, what moves and what must be re-run, and needs confirmation', () => {
    const next = validateDatum({ refKind: 'KB', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'MSL' }).datum;
    const i = datumChangeImpact(well, next, counts);
    expect(i.kind).toBe('correction');
    expect(i.shiftM).toBeCloseTo(-6.5, 9);
    expect(i.needsConfirm).toBe(true);
    const text = i.lines.join('\n');
    expect(text).toMatch(/from 25\.00 m to 31\.50 m/);
    expect(text).toMatch(/6\.50 m shallower/);
    expect(text).toMatch(/14 tops/);
    expect(text).toMatch(/21 curves/);
    expect(text).toMatch(/2 checkshot rows: re-derived/);
    expect(text).toMatch(/Seismolord synthetics and well ties/);
    // the shift is what the frames give
    const before = makeWellFrame(well).mdToTvdss(2300).tvdss;
    const after = makeWellFrame(well, { datum: { ...readWellDatum(well), refElevM: 31.5 } }).mdToTvdss(2300).tvdss;
    expect(after - before).toBeCloseTo(i.shiftM, 9);
  });
  test('the same elevation with a new datum name moves nothing and needs no confirmation', () => {
    const next = validateDatum({ refKind: 'KB', refElevM: 25, environment: 'offshore', waterDepthM: 100, verticalDatum: 'LAT' }).datum;
    const i = datumChangeImpact(well, next, counts);
    expect(i.kind).toBe('details');
    expect(i.needsConfirm).toBe(false);
    expect(i.lines.join(' ')).toMatch(/No depth moves/);
  });
  test('a new water depth moves only depth below mudline', () => {
    const next = validateDatum({ refKind: 'KB', refElevM: 25, environment: 'offshore', waterDepthM: 120, verticalDatum: 'MSL' }).datum;
    expect(datumChangeImpact(well, next, counts).lines.join(' ')).toMatch(/Depths below mudline or ground change/);
  });
  test('clearing the elevation says TVDSS will be refused', () => {
    const next = validateDatum({ refKind: null, refElevM: null }).datum;
    const i = datumChangeImpact(well, next, counts);
    expect(i.kind).toBe('cleared');
    expect(i.lines[0]).toMatch(/refused everywhere/);
    expect(i.needsConfirm).toBe(true);
  });
  test('first entry on an unset well with no data needs no confirmation', () => {
    const lad = { name: 'Lad', kb_m: 0, ...nullDatum, checkshots: [] };
    const next = validateDatum({ refKind: 'KB', refElevM: 30 }).datum;
    const i = datumChangeImpact(lad, next, { tops: 0, curves: 0 });
    expect(i.kind).toBe('first');
    expect(i.needsConfirm).toBe(false);
  });
  test('the record says who, when, from, to and what was affected', () => {
    const next = validateDatum({ refKind: 'RT', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'MSL' }).datum;
    const rec = datumChangeRecord(well, next, { userId: 'u-1', userName: 'Ada Obi', at: '2026-10-02T09:00:00.000Z', reason: 'rig survey', app: 'well-data-manager', counts });
    expect(rec).toMatchObject({ at: '2026-10-02T09:00:00.000Z', by: 'u-1', by_name: 'Ada Obi', reason: 'rig survey', kind: 'correction' });
    expect(rec.shift_tvdss_m).toBeCloseTo(-6.5, 9);
    expect(rec.from).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 25 });
    expect(rec.to).toMatchObject({ depth_ref_kind: 'RT', depth_ref_elev_m: 31.5 });
    expect(rec.affected).toEqual({ tops: 14, curves: 21, zones: 3, checkshots: 2 });
    expect(datumChangeLine(rec)).toBe('2026-10-02: Ada Obi changed the depth reference from KB 25.00 m to RT 31.50 m (rig survey)');
  });
  test('the patch with the columns keeps every field, mirrors kb_m and appends the record', () => {
    const next = validateDatum({ refKind: 'RT', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'MSL', elevUnit: 'm' }).datum;
    const rec = datumChangeRecord(well, next, { userId: 'u-1', at: '2026-10-02T09:00:00.000Z' });
    const { patch, dropped, columns } = datumPatch({ ...well, datum_changes: [{ at: 'earlier' }] }, next, { record: rec });
    expect(columns).toBe(true);
    expect(dropped).toEqual([]);
    expect(patch).toMatchObject({ depth_ref_kind: 'RT', depth_ref_elev_m: 31.5, kb_m: 31.5, well_environment: 'offshore', water_depth_m: 100, ground_elev_m: null, vertical_datum: 'MSL', elev_unit: 'm' });
    expect(patch.datum_changes).toHaveLength(2);
    expect(Object.keys(patch).filter((k) => k !== 'kb_m').sort()).toEqual([...DATUM_COLUMNS].sort());
  });
  test('clearing writes NULL and a kb_m of 0', () => {
    const { patch } = datumPatch(well, validateDatum({}).datum);
    expect(patch.depth_ref_elev_m).toBeNull();
    expect(patch.depth_ref_kind).toBeNull();
    expect(patch.kb_m).toBe(0);
  });
  test('before the migration the patch is kb_m plus a dated note, and says what it could not keep', () => {
    const old = { name: 'Old', kb_m: 25, units_note: 'entered: KB/TD ft; stored SI', checkshots: [] };
    const next = validateDatum({ refKind: 'RT', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'LAT' }).datum;
    const rec = datumChangeRecord(old, next, { userName: 'Ada Obi', at: '2026-10-02T09:00:00.000Z' });
    const { patch, dropped, columns } = datumPatch(old, next, { record: rec });
    expect(columns).toBe(false);
    expect(Object.keys(patch).sort()).toEqual(['kb_m', 'units_note']);
    expect(patch.kb_m).toBe(31.5);
    expect(patch.units_note).toBe('entered: KB/TD ft; stored SI | Datum 2026-10-02: Ada Obi changed the depth reference from KB 25.00 m to RT 31.50 m');
    expect(dropped).toEqual(['reference kind', 'environment', 'water depth', 'vertical datum name']);
  });
  test('insert fields: a bare KB becomes kind KB; nothing becomes NULL, never 0', () => {
    expect(datumInsertFields({ refElevM: 25 })).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 25 });
    expect(datumInsertFields({})).toMatchObject({ depth_ref_kind: null, depth_ref_elev_m: null });
    expect(datumInsertFields({ refElevM: null }).depth_ref_elev_m).toBeNull();
  });
});

describe('words', () => {
  test('datum line and TVDSS basis', () => {
    expect(datumLine(readWellDatum(OFFSHORE))).toBe('KB 25.0 m above MSL, water depth 100.0 m');
    expect(datumLine(readWellDatum(ONSHORE), 'ft')).toBe('KB 1044.9 ft above MSL, ground level 1023.6 ft');
    expect(datumLine(readWellDatum({ kb_m: 62.01 }))).toBe('KB 62.0 m above datum (not named, taken as mean sea level)');
    expect(tvdssBasisText(readWellDatum(OFFSHORE))).toBe('TVDSS is below MSL, from KB 25.00 m');
    expect(tvdssBasisText(readWellDatum({ name: 'Lad', kb_m: 0, ...nullDatum }))).toMatch(/no depth reference elevation/);
  });
  test('house copy style: no em dashes in any message', () => {
    const texts = [
      readWellDatum({ name: 'Lad', kb_m: 0, ...nullDatum }).tvdssReason,
      readWellDatum({ kb_m: 0 }).note,
      ...validateDatum({ refKind: 'KB', refElevM: -25, environment: 'offshore', waterDepthM: -1, groundElevM: 3 }).errors,
      ...datumChangeImpact(OFFSHORE, validateDatum({ refKind: 'KB', refElevM: 30 }).datum, { tops: 1, curves: 1 }).lines,
    ];
    for (const t of texts) expect(t).not.toMatch(/—|–/);
    expect(DEPTH_REF_KINDS).toEqual(['KB', 'RT', 'DF', 'GL', 'MSL', 'OTHER']);
  });
});
