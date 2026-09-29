/**
 * AppUpgrade WC-U1 (2026-09-29): section-kit geometry found wrong by the
 * practitioner lens, on the hostile wells of e2e/fixtures/wc/hostile. Shared
 * by Well Correlation and Stratigraphy Studio (one CrossSection).
 *
 *  WC-U1-002 proportional spacing read every X/Y as metres in one frame:
 *            a US-survey-feet pair 1,000 m apart was drawn 3.28 km apart, and
 *            wells in different CRSs were 13,500 km apart, pushing the rest of
 *            the section off the canvas.
 *  WC-U1-004 correlation lines ran from column centre to column centre, over
 *            the log tracks, so a top appeared to cross the curves.
 *  WC-U1-005 TVDSS of a well with no KB equals TVD, and a well with no survey
 *            is drawn vertical, without a word in the section.
 *  WC-U1-003 curves stored bottom-up by a G1-era import were read by sample:
 *            in TVD or TVDSS the well fell back to MD ("not monotonic") and
 *            was drawn KB metres too deep.
 * Negative control: each block fails on origin/main (c71824ef6).
 */
import fs from 'fs';
import path from 'path';
import {
  pathDistances, columnLayout, spacingProblem, correlationSegments, frameNotes, orientSectionCurves,
  depthOfFor, displayedArray, isMonotonic,
} from '../sectionFrame';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wc', 'hostile');
const wells = JSON.parse(fs.readFileSync(path.join(HOSTILE, 'wells.json'), 'utf8'));
const byName = (n) => wells.find((w) => w.name === n);
const withFrame = (w) => ({ ...w, frame: makeDepthFrame({ deviation: w.deviation, kbM: w.kb_m, tdMdM: w.td_md_m }) });

describe('WC-U1-002 spacing by distance honours the CRS and its unit', () => {
  test('a US-survey-feet pair 1,000 m apart measures 1,000 m', () => {
    const [d] = pathDistances([byName('ARLO 12'), byName('ARLO 14')]);
    expect(d).toBeCloseTo(1000, 6);
  });
  test('international feet convert at 0.3048', () => {
    const a = { surface_x: 0, surface_y: 0, crs: 'EPSG:9999', xy_unit: 'ft' };
    const b = { surface_x: 1000, surface_y: 0, crs: 'EPSG:9999', xy_unit: 'ft' };
    expect(pathDistances([a, b])[0]).toBeCloseTo(304.8, 9);
  });
  test('wells in different CRSs have no distance, and the reason names both frames', () => {
    const pair = [byName('ARLO 14'), byName('OKAN PX-4')];
    expect(Number.isNaN(pathDistances(pair)[0])).toBe(true);
    expect(spacingProblem(pair)).toMatch(/EPSG:2277.*EPSG:32632|EPSG:32632.*EPSG:2277/);
    expect(spacingProblem([byName('ARLO 12'), byName('ARLO 14')])).toBeNull();
  });
  test('the whole hostile section stays on the canvas (equal columns, with the reason)', () => {
    const cols = columnLayout(wells, { mode: 'proportional', plotLeft: 56, plotW: 900 });
    for (const c of cols) expect(c.x0 + c.w).toBeLessThanOrEqual(56 + 900 + 1e-9);
    expect(new Set(cols.map((c) => c.w)).size).toBe(1); // equal columns
  });
  test('close pairs pushed apart never run past the right edge', () => {
    // three wells at 0, 999 and 1,000 m: the last two collide and push right
    const line = [0, 999, 1000].map((x) => ({ surface_x: x, surface_y: 0, crs: 'EPSG:32632', xy_unit: 'm' }));
    const cols = columnLayout(line, { mode: 'proportional', plotLeft: 0, plotW: 300 });
    const last = cols[cols.length - 1];
    expect(last.x0 + last.w).toBeLessThanOrEqual(300 + 1e-9);
    for (let i = 1; i < cols.length; i++) expect(cols[i].x0).toBeGreaterThanOrEqual(cols[i - 1].x0 + cols[i - 1].w - 1e-9);
  });
});

describe('WC-U1-004 correlation lines join column edges', () => {
  const boxes = [{ x0: 56, w: 100 }, { x0: 156, w: 100 }, { x0: 256, w: 100 }];
  const yOf = (d) => d;
  test('neighbours: right edge of one column to the left edge of the next', () => {
    const segs = correlationSegments([{ wellIndex: 0, displayed: 10 }, { wellIndex: 1, displayed: 20 }], boxes, yOf);
    expect(segs).toEqual([{ x1: 156, y1: 10, x2: 156, y2: 20, dashed: false }]);
  });
  test('a well without the top in between is bridged with a dashed line', () => {
    const segs = correlationSegments([{ wellIndex: 0, displayed: 10 }, { wellIndex: 2, displayed: 30 }], boxes, yOf);
    expect(segs).toEqual([{ x1: 156, y1: 10, x2: 256, y2: 30, dashed: true }]);
  });
  test('no line inside any column (the negative control of the old centre-to-centre path)', () => {
    const segs = correlationSegments([{ wellIndex: 0, displayed: 1 }, { wellIndex: 1, displayed: 2 }, { wellIndex: 2, displayed: 3 }], boxes, yOf);
    for (const s of segs) {
      for (const b of boxes) {
        const inside = (x) => x > b.x0 + 1e-9 && x < b.x0 + b.w - 1e-9;
        expect(inside(s.x1) || inside(s.x2)).toBe(false);
      }
    }
  });
});

describe('WC-U1-005 the section says when a vertical reference is assumed', () => {
  test('no KB: TVDSS equals TVD, said on the well', () => {
    const w = withFrame(byName('IDU 7'));
    expect(frameNotes(w, 'tvdss')).toContain('no KB: TVDSS = TVD');
    expect(frameNotes(w, 'tvd')).not.toContain('no KB: TVDSS = TVD');
    expect(frameNotes(w, 'md')).toEqual([]);
  });
  test('no survey: drawn vertical, said on the well', () => {
    const w = withFrame(byName('IDU 9'));
    expect(frameNotes(w, 'tvdss')).toContain('no survey: vertical');
    expect(frameNotes(withFrame(byName('OKAN PX-4')), 'tvdss')).toContain('no survey: vertical');
    expect(frameNotes(withFrame({ ...byName('IDU 7'), kb_m: 25 }), 'tvdss')).toEqual([]);
  });
});

describe('WC-U1-003 curves stored bottom-up are read top-down', () => {
  const raw = byName('BONGA G1-UP');
  const f32 = (a) => Float32Array.from(a);
  const cw = { curves: { DEPT: f32(raw.curves.DEPT), GR: f32(raw.curves.GR) }, logs: { DEPT: f32(raw.curves.DEPT), GR: f32(raw.curves.GR), RT: f32(raw.curves.RT) } };
  test('depth ascends and every sample keeps its depth', () => {
    const o = orientSectionCurves(cw);
    expect(o.reoriented).toBe(true);
    const d = o.curves.DEPT;
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    // the GR stored beside 1,900 m is still beside 1,900 m
    const iOld = Array.from(cw.curves.DEPT).indexOf(1900);
    const iNew = Array.from(d).indexOf(1900);
    expect(o.curves.GR[iNew]).toBe(cw.curves.GR[iOld]);
    expect(o.logs.RT[iNew]).toBe(cw.logs.RT[iOld]);
    expect(o.logs.DEPT[0]).toBe(1800);
  });
  test('TVDSS through the frame is then monotonic, so the well is not dropped back to MD', () => {
    const o = orientSectionCurves(cw);
    const w = withFrame({ ...raw, depth: o.curves.DEPT });
    expect(isMonotonic(displayedArray(o.curves.DEPT, depthOfFor(w, 'tvdss'), 0))).toBe(true);
    expect(isMonotonic(displayedArray(cw.curves.DEPT, depthOfFor(w, 'tvdss'), 0))).toBe(false);
  });
  test('an ascending well is returned untouched', () => {
    const ok = byName('IDU 9');
    const c = { curves: { DEPT: f32(ok.curves.DEPT) }, logs: {} };
    const o = orientSectionCurves(c);
    expect(o.reoriented).toBe(false);
    expect(o.curves).toBe(c.curves);
  });
});
