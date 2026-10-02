/**
 * WDM-U2-007: every app reads a well's vertical reference through
 * src/lib/wellDatum.js. This gate calls each app's own door with three
 * wells on one survey:
 *   SET     the datum columns state KB 25 m (offshore, 100 m of water)
 *   UNSET   the columns exist, nothing stated, kb_m 0
 *   OLD     a row from before the migration (kb_m 0, no columns)
 * and checks that SET gives the hand value, UNSET is refused with a reason
 * and never read as 0, and OLD keeps the earlier behaviour (the negative
 * control for "nothing breaks before the migration is applied").
 *
 * The last test is a source guard: no file outside the module subtracts a
 * KB default or builds the engine frame directly.
 */
import fs from 'fs';
import path from 'path';
import { DATUM_COLUMNS, makeWellFrame } from '../wellDatum';
import { makeDepthAxes } from '@/components/wells/depthModes';
import { frameNotes, depthOfFor, mdFromDisplayed } from '@/components/wells/section/sectionFrame';
import { wellInventory } from '@/pages/apps/WellDataManager/engine/inventory';
import { sheetRows } from '@/pages/apps/WellDataManager/engine/topsSheet';
import { topsCsv as wdmTopsCsv, surveyCsv } from '@/pages/apps/WellDataManager/engine/wellExport';
import { depthColumns } from '@/pages/apps/PetrophysicsStudio/services/petroExport';
import { shmCurve } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';
import { headerRows } from '@/pages/apps/PetrophysicsStudio/services/petroReport';
import { depthReferences } from '@/pages/apps/PorePressureStudio/services/depthRef';
import { datumToMudline } from '@/pages/apps/PorePressureStudio/services/alongHole';
import { wellDepthFrame } from '@/pages/apps/PorePressureStudio/services/prep';
import { topsToControlPoints, CONTROL_POINT_SKIP_REASONS } from '@/pages/apps/MappingSurfaceStudio/services/topControlPoints';
import { buildWellSections, WELL_REASONS } from '@/pages/apps/Seismolord/lib/wellDisplay';
import { pipelineWells } from '@/pages/apps/Seismolord/services/topsToHorizons';
import { planTopsFile } from '@/pages/apps/WellCorrelation/services/topsFile';
import { assembleOffsetCandidates, registryOffsetsWithoutDatum } from '@/pages/apps/well-planning/services/offsetFrame';
import { offsetTopsFrom, offsetWellsWithoutDatum } from '@/pages/apps/WellsiteStudio/services/tops';
import { verticalDepthOf } from '@/lib/basinHandoff';
import { wellLasText } from '@/lib/portability/sidecars';
import { refElevOrNull } from '../wellDatum';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));

const DEVIATION = [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 90 }, { md: 1300, inc: 30, azi: 90 }, { md: 2300, inc: 30, azi: 90 }];
const TVD_2300 = 1000 + (300 / (Math.PI / 6)) * 0.5 + 1000 * Math.cos(Math.PI / 6); // 2152.5043
const nullDatum = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));
const row = (id, name, extra) => ({
  id, name, user_id: 'u', surface_x: 500000, surface_y: 6700000, td_md_m: 2300, deviation: DEVIATION, crs: 'EPSG:32631', xy_unit: 'm',
  checkshots: [], tops: [{ id: `${id}-t`, name: 'Top A', md_m: 2300 }], ...extra,
});
const SET = row('s', 'SET-1', { kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'offshore', water_depth_m: 100, vertical_datum: 'MSL' });
const UNSET = row('u', 'UNSET-1', { kb_m: 0, ...nullDatum });
const OLD = row('o', 'OLD-1', { kb_m: 0 });
const TOPS = [SET, UNSET, OLD].map((w) => ({ id: w.tops[0].id, well_id: w.id, name: 'Top A', md_m: 2300 }));

describe('shared viewers', () => {
  test('depth columns (log viewers): TVDSS is the hand value, NaN when unset, TVD when the row is old', () => {
    const at = (w) => makeDepthAxes(['md', 'tvd', 'tvdss'], { well: w })[2].valueOf(2300);
    expect(at(SET)).toBeCloseTo(TVD_2300 - 25, 3);
    expect(Number.isNaN(at(UNSET))).toBe(true);
    expect(at(OLD)).toBeCloseTo(TVD_2300, 3);
    // TVD needs no datum
    expect(makeDepthAxes(['tvd'], { well: UNSET })[0].valueOf(2300)).toBeCloseTo(TVD_2300, 3);
  });
  test('section kit (Well Correlation, Stratigraphy): notes and depths', () => {
    const w = (r) => ({ ...r, frame: makeWellFrame(r) });
    expect(frameNotes(w(SET), 'tvdss')).toEqual([]);
    expect(frameNotes(w(UNSET), 'tvdss')).toContain('no depth reference: TVDSS withheld');
    expect(frameNotes(w(OLD), 'tvdss')).toContain('no KB: TVDSS = TVD');
    expect(depthOfFor(w(SET), 'tvdss')(2300)).toBeCloseTo(TVD_2300 - 25, 3);
    expect(Number.isNaN(depthOfFor(w(UNSET), 'tvdss')(2300))).toBe(true);
    expect(depthOfFor(w(UNSET), 'tvd')(2300)).toBeCloseTo(TVD_2300, 3);
    // a displayed TVD inverts with no datum; a displayed TVDSS needs one
    expect(mdFromDisplayed(TVD_2300, null, w(UNSET), 'tvd').md).toBeCloseTo(2300, 2);
    expect(mdFromDisplayed(TVD_2300 - 25, null, w(UNSET), 'tvdss')).toBeNull();
    expect(mdFromDisplayed(TVD_2300 - 25, null, w(SET), 'tvdss').md).toBeCloseTo(2300, 2);
  });
});

describe('Well Data Manager', () => {
  test('inventory flag, tops sheet and exports', () => {
    expect(wellInventory(SET, [], SET.tops).flags).not.toContain('no_kb');
    expect(wellInventory(UNSET, [], UNSET.tops).flags).toContain('no_kb');
    expect(wellInventory(OLD, [], OLD.tops).flags).toContain('no_kb');
    expect(wellInventory(SET, [], []).kbM).toBe(25);
    expect(wellInventory(UNSET, [], []).kbM).toBeNull();
    const rows = Object.fromEntries(sheetRows([SET, UNSET, OLD], TOPS).map((r) => [r.wellName, r]));
    expect(rows['SET-1'].tvdss).toBeCloseTo(TVD_2300 - 25, 3);
    expect(rows['SET-1'].datumFlag).toBeNull();
    expect(rows['UNSET-1'].tvdss).toBeNull();
    expect(rows['UNSET-1'].datumFlag).toBe('unset');
    expect(rows['OLD-1'].tvdss).toBeCloseTo(TVD_2300, 3);
    expect(rows['OLD-1'].datumFlag).toBe('zero');
    const cell = (w) => wdmTopsCsv(w, w.tops, 'm').text.split('\n')[1].split(',');
    expect(Number(cell(SET)[5])).toBeCloseTo(TVD_2300 - 25, 3);
    expect(cell(UNSET)[5]).toBe('');                       // TVDSS withheld, TVD still written
    expect(Number(cell(UNSET)[4])).toBeCloseTo(TVD_2300, 3);
    expect(surveyCsv(UNSET, 'm').text.split('\n')[4].split(',')[4]).toBe('');
  });
});

describe('Petrophysics', () => {
  test('export depth columns say what TVDSS rests on, or why it is empty', () => {
    const md = Float64Array.of(2300);
    const s = depthColumns(md, { well: SET, columns: ['md', 'tvdss'] });
    expect(s.ordered[1].data[0]).toBeCloseTo(TVD_2300 - 25, 3);
    expect(s.notes.join(' ')).toMatch(/TVDSS uses KB 25 m\./);
    const u = depthColumns(md, { well: UNSET, columns: ['md', 'tvdss'] });
    expect(Number.isNaN(u.ordered[1].data[0])).toBe(true);
    expect(u.notes.join(' ')).toMatch(/UNSET-1 has no depth reference elevation.*The TVDSS column is empty\./);
    const o = depthColumns(md, { well: OLD, columns: ['md', 'tvdss'] });
    expect(o.ordered[1].data[0]).toBeCloseTo(TVD_2300, 3);
  });
  test('saturation height is refused on a well with no reference elevation', () => {
    const shm = { ok: true, fwlTvdssM: 2200, reservoir: { k_md: 100, phi: 0.2 }, jSpec: {}, fluids: {} };
    const r = shmCurve({ shm, depth: Float64Array.of(2300), well: UNSET });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no depth reference elevation.*free-water level in TVDSS/);
  });
  test('the report header names the reference', () => {
    const line = (w) => headerRows({ wellName: w.name, well: w }).find((r) => r[0] === 'Depth reference')[1];
    expect(line(SET)).toBe('MD below KB; KB 25.00 m above MSL');
    expect(line(UNSET)).toBe('MD below the depth reference; reference elevation not set (TVDSS withheld)');
    expect(line(OLD)).toBe('MD below KB; KB 0.00 m above the vertical datum (0 may mean not entered)');
  });
});

describe('Pore Pressure', () => {
  test('onshore TVDSS comes from the datum, and is withheld with the reason without one', () => {
    const input = { zBmlM: [1000], mdM: [1010] };
    const params = { waterDepthM: 0, mudlineMdM: 10 };
    expect(depthReferences(input, params, { kbM: refElevOrNull({ ...SET, well_environment: null, water_depth_m: null }) }).tvdss[0]).toBeCloseTo(1010 - 25, 9);
    const u = depthReferences(input, params, { kbM: refElevOrNull(UNSET) });
    expect(u.tvdss).toBeNull();
    expect(u.reasons.tvdss).toMatch(/needs the KB elevation/);
    expect(depthReferences(input, params, { kbM: refElevOrNull(OLD) }).tvdss[0]).toBe(1010);
    // the ground elevation of an onshore well: KB less the mudline MD
    expect(datumToMudline({ mudlineMdM: 10, seismicDatumElevM: 0 }, { kbM: 25 }).mudlineElevM).toBe(15);
    expect(wellDepthFrame(UNSET).mdToPosition(2300).tvd).toBeCloseTo(TVD_2300, 3);
  });
});

describe('Mapping', () => {
  test('a TVDSS top map leaves out the well with no reference elevation, and says why; MD and TVD maps keep it', () => {
    const r = topsToControlPoints([SET, UNSET, OLD], 'Top A', { depthRef: 'tvdss' });
    expect(r.points.map((p) => p.well)).toEqual(['SET-1', 'OLD-1']);
    expect(r.points[0].z).toBeCloseTo(-(TVD_2300 - 25), 3);
    expect(r.points[1].z).toBeCloseTo(-TVD_2300, 3);
    expect(r.skipped).toEqual([{ well: 'UNSET-1', reason: 'no_datum' }]);
    expect(CONTROL_POINT_SKIP_REASONS.no_datum).toMatch(/no depth reference elevation/);
    expect(topsToControlPoints([SET, UNSET, OLD], 'Top A', { depthRef: 'tvd' }).points).toHaveLength(3);
    // NEGATIVE CONTROL: the engine door alone would post UNSET-1 at its TVD, as if the KB were 0
    const { topsToControlPoints: engineDoor } = jest.requireActual('@/pages/apps/MappingSurfaceStudio/engine/surface');
    expect(engineDoor([UNSET], 'Top A', { depthRef: 'tvdss' }).points[0].z).toBeCloseTo(-TVD_2300, 3);
  });
});

describe('Seismolord', () => {
  test('a well with no reference elevation is not drawn, with the reason; Tops to Horizons leaves it out', () => {
    const geom = { nIl: 4, nXl: 4, ns: 100 };
    const affine = { origin: { x: 0, y: 0 } };
    const r = buildWellSections({ wells: [{ id: 'u', name: 'UNSET-1', datumOk: false }], geom, dtUs: 4000, affine });
    expect(r.sections).toEqual([]);
    expect(r.skipped).toEqual([{ id: 'u', name: 'UNSET-1', code: 'noDatum', reason: WELL_REASONS.noDatum }]);
    expect(WELL_REASONS.noDatum).toMatch(/No depth reference elevation/);
    const pw = pipelineWells([{ id: 's', name: 'SET-1', kbM: 25, datumOk: true, tops: [] }, { id: 'u', name: 'UNSET-1', kbM: 0, datumOk: false, tops: [] }]);
    expect(pw.map((w) => w.name)).toEqual(['SET-1']);
  });
});

describe('Well Correlation', () => {
  test('a TVDSS tops file is refused for the well with no reference elevation; a TVD file is read', () => {
    const wells = [SET, UNSET].map((w) => ({ ...w, tops: undefined, is_own: true }));
    const tvdss = planTopsFile('Well,Top,TVDSS (m)\nSET-1,Top B,2000\nUNSET-1,Top B,2000\n', { wells });
    expect(tvdss.problems.map((p) => p.reason).join(' ')).toMatch(/UNSET-1, Top B: the well has no depth reference elevation/);
    const tvd = planTopsFile('Well,Top,TVD (m)\nUNSET-1,Top B,2000\n', { wells });
    expect(tvd.problems).toEqual([]);
    expect(tvd.creates).toHaveLength(1);
    expect(tvd.creates[0].mdM ?? tvd.creates[0].md_m ?? tvd.creates[0].md).toBeCloseTo(2300 - (TVD_2300 - 2000) / Math.cos(Math.PI / 6), 2);
    // the SET-1 pick did go through: TVDSS 2000 is TVD 2025
    expect(tvdss.creates).toHaveLength(1);
  });
});

describe('Well Design', () => {
  test('anti-collision leaves a registry well with no reference elevation out, and names it', () => {
    const c = assembleOffsetCandidates({ geoWells: [SET, UNSET, OLD], wellbore: { id: 'wb' }, siteCrs: 'EPSG:32631' });
    expect(c.map((x) => x.name)).toEqual(['SET-1', 'OLD-1']);
    expect(c[0].kbElevM).toBe(25);
    expect(registryOffsetsWithoutDatum({ geoWells: [SET, UNSET, OLD], wellbore: { id: 'wb' }, siteCrs: 'EPSG:32631' })).toEqual(['UNSET-1']);
  });
});

describe('Wellsite, Basin, portability', () => {
  test('Wellsite offset tops: a well with no reference elevation is left out and named', () => {
    const offsets = [SET, UNSET].map((w) => ({ id: w.id, name: w.name, kb_m: refElevOrNull(w), deviation: w.deviation, tops: w.tops }));
    const out = offsetTopsFrom(offsets);
    expect(out.map((t) => t.well_name)).toEqual(['SET-1']);
    expect(out[0].tvdss_m).toBeCloseTo(TVD_2300 - 25, 2);
    expect(offsetWellsWithoutDatum(offsets).map((w) => w.name)).toEqual(['UNSET-1']);
  });
  test('Basin layer thickness needs TVD only, so it works on every well', () => {
    for (const w of [SET, UNSET, OLD]) expect(verticalDepthOf(w).tvd(2300)).toBeCloseTo(TVD_2300, 3);
  });
  test('.pld LAS sidecar: the datum as stated, none for a well with none', () => {
    const logs = [{ id: 'l1', mnemonic: 'DEPT', unit: 'M' }, { id: 'l2', mnemonic: 'GR', unit: 'GAPI' }];
    const curves = { l1: Float32Array.of(1, 2), l2: Float32Array.of(50, 60) };
    const text = (w) => wellLasText(w, logs, curves) || '';
    expect(text(SET)).toMatch(/EKB\s*\.M\s+25\b/);
    expect(text(SET)).toMatch(/PDAT\s*\.\s+MSL/);
    expect(text(UNSET)).not.toMatch(/EKB|APD/);
    expect(text(OLD)).toMatch(/EKB\s*\.M\s+0\b/);
  });
});

describe('source guard', () => {
  test('no file outside the datum module defaults a KB to 0 or builds the engine depth frame itself', () => {
    const root = path.join(__dirname, '..', '..');
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(js|jsx)$/.test(e.name)) continue;
        const rel = path.relative(root, p);
        if (rel === path.join('lib', 'wellDatum.js')) continue;
        const text = fs.readFileSync(p, 'utf8');
        if (/kb_m\s*(\?\?|\|\|)\s*0/.test(text)) offenders.push(`${rel}: kb_m defaulted to 0`);
        if (/makeDepthFrame\s*\(/.test(text)) offenders.push(`${rel}: makeDepthFrame called directly`);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
