// Analytic cases for the section frame helpers (WC series): every
// expectation is derived by hand from the deterministic sample section.
import { sampleWells } from '../services/sampleSection';
import { computeFlattening, correlationPolyline } from '../engine/section';
import {
  depthOfFor, toReferenceFrame, displayedArray, isMonotonic, mdFromDisplayed,
  pathDistances, columnLayout, zoneBands,
} from '../engine/sectionFrame';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';

const withFrames = (wells) => wells.map((w) => ({
  ...w, frame: makeDepthFrame({ deviation: w.deviation, kbM: w.kb_m, tdMdM: w.td_md_m }),
}));

describe('depth reference', () => {
  const wells = withFrames(sampleWells());
  test('MD is the identity; a vertical well reads TVD = MD and TVDSS = MD - KB', () => {
    const w = wells[0];
    expect(depthOfFor(w, 'md')(1500)).toBe(1500);
    expect(depthOfFor(w, 'tvd')(1500)).toBe(1500);
    expect(depthOfFor(w, 'tvdss')(1500)).toBe(1500 - 30);
  });
  test('tops re-expressed in TVDSS keep their measured depth alongside', () => {
    const ref = toReferenceFrame(wells, 'tvdss');
    const dome = ref[0].tops.find((t) => t.name === 'Top Dome');
    expect(dome.md_m).toBe(1470);
    expect(dome.md_src).toBe(1500);
    expect(toReferenceFrame(wells, 'md')).toBe(wells); // no copy for MD
  });
  test('flatten on Top Dome is one flat line in TVDSS as in MD', () => {
    const ref = toReferenceFrame(wells, 'tvdss');
    const f = computeFlattening(ref, { mode: 'flatten', topName: 'Top Dome', datumM: 1500 });
    // vertical wells: shift = 1500 - (md - 30); KETA-2's Top Dome (1540 m MD)
    // sits below its 1400 m kick-off, so its TVDSS comes from the survey
    expect(f[0].shift).toBe(30);
    expect(f[2].shift).toBe(60);
    expect(f[1].shift).toBeCloseTo(1500 - depthOfFor(wells[1], 'tvdss')(1540), 9);
    const line = correlationPolyline(ref, f, 'Top Dome');
    expect(line.every((p) => Math.abs(p.displayed - 1500) < 1e-9)).toBe(true);
  });
  test('displayedArray applies reference and shift per sample and stays monotonic', () => {
    const w = wells[1];
    const disp = displayedArray(w.curves.DEPT, depthOfFor(w, 'tvdss'), -10);
    expect(disp.length).toBe(w.curves.DEPT.length);
    expect(disp[0]).toBe(1400 - 30 - 10);
    expect(isMonotonic(disp)).toBe(true);
    expect(isMonotonic(Float64Array.from([1, NaN, 2, 1.5]))).toBe(false);
  });
  test('the deviated well (KETA-2) reads TVD below MD past its kick-off: a 0 to 30 degree build over 350 m drops 334.22 m', () => {
    const w = wells[1];
    const tvdss = depthOfFor(w, 'tvdss');
    expect(tvdss(1400)).toBeCloseTo(1370, 6);
    // minimum curvature: dTVD = dMD * (sin I2 - sin I1) / (I2 - I1)
    const dTvd = 350 * (Math.sin(Math.PI / 6) - 0) / (Math.PI / 6);
    expect(tvdss(1750)).toBeCloseTo(1400 + dTvd - 30, 2);
    expect(depthOfFor(w, 'tvd')(1750)).toBeCloseTo(1400 + dTvd, 2);
    // and the plot inverts back to the measured depth
    expect(mdFromDisplayed(tvdss(1750), 0, w, 'tvdss').md).toBeCloseTo(1750, 6);
    // flatten on Base Sand in TVDSS: KETA-2's shift accounts for the build
    const ref = toReferenceFrame(wells, 'tvdss');
    const f = computeFlattening(ref, { mode: 'flatten', topName: 'Base Sand', datumM: 1600 });
    expect(f[1].shift).toBeCloseTo(1600 - tvdss(1705), 6);
  });
  test('mdFromDisplayed inverts the plot', () => {
    const w = wells[0];
    expect(mdFromDisplayed(1520, 0, w, 'md')).toEqual({ md: 1520, ambiguous: false, extrapolated: false });
    expect(mdFromDisplayed(1470 + 30, 30, w, 'tvdss').md).toBeCloseTo(1500, 9);
    expect(mdFromDisplayed(1480, 0, w, 'tvd').md).toBeCloseTo(1480, 9);
    expect(mdFromDisplayed(NaN, 0, w, 'md')).toBeNull();
  });
});

describe('well spacing', () => {
  const wells = sampleWells();
  test('surface distances along the path', () => {
    const d = pathDistances(wells);
    expect(d[0]).toBeCloseTo(1264.911, 3);
    expect(d[1]).toBeCloseTo(1315.295, 3);
  });
  test('equal spacing: contiguous equal columns', () => {
    const cols = columnLayout(wells, { mode: 'equal', plotLeft: 56, plotW: 900 });
    expect(cols.map((c) => c.x0)).toEqual([56, 356, 656]);
    expect(cols.every((c) => c.w === 300)).toBe(true);
    expect(cols[0].distM).toBeCloseTo(1264.911, 3);
    expect(cols[2].distM).toBeNull();
  });
  test('proportional spacing: centres in proportion to distance, no overlap', () => {
    const cols = columnLayout(wells, { mode: 'proportional', plotLeft: 56, plotW: 900 });
    const colW = 300 * 0.7;
    expect(cols[0].x0).toBe(56);
    expect(cols[2].x0).toBeCloseTo(56 + 900 - colW, 9);
    const ratio = (cols[1].x0 - cols[0].x0) / (cols[2].x0 - cols[1].x0);
    expect(ratio).toBeCloseTo(1264.911 / 1315.295, 3);
    expect(cols[0].gapAfter).toBeCloseTo(cols[1].x0 - (cols[0].x0 + colW), 9);
  });
  test('proportional falls back to equal without usable distances', () => {
    const noXY = wells.map((w) => ({ ...w, surface_x: null }));
    const cols = columnLayout(noXY, { mode: 'proportional', plotLeft: 0, plotW: 300 });
    expect(cols.map((c) => c.x0)).toEqual([0, 100, 200]);
    expect(columnLayout([], { plotW: 300 })).toEqual([]);
  });
  test('two wells at the same surface location do not overlap', () => {
    const twin = [wells[0], { ...wells[1], surface_x: wells[0].surface_x, surface_y: wells[0].surface_y }, wells[2]];
    const cols = columnLayout(twin, { mode: 'proportional', plotLeft: 0, plotW: 600 });
    expect(cols[1].x0).toBeGreaterThanOrEqual(cols[0].x0 + cols[0].w);
  });
});

describe('zone bands', () => {
  const wells = sampleWells();
  test('consecutive shown tops become bands named after the upper top', () => {
    const bands = zoneBands(wells[0], 0, ['Top Dome', 'Mid Shale', 'Base Sand']);
    expect(bands).toEqual([
      { name: 'Top Dome', upper: 'Top Dome', top: 1500, base: 1580 },
      { name: 'Mid Shale', upper: 'Mid Shale', top: 1580, base: 1660 },
    ]);
  });
  test('a well missing a top skips it; order follows depth, not the list', () => {
    const bands = zoneBands(wells[2], 30, ['Base Sand', 'Mid Shale', 'Top Dome']);
    expect(bands).toEqual([{ name: 'Top Dome', upper: 'Top Dome', top: 1500, base: 1642 }]);
  });
  test('explicit pairs', () => {
    expect(zoneBands(wells[0], 0, [], [['Top Dome', 'Base Sand'], ['Mid Shale', 'Nope']]))
      .toEqual([{ name: 'Top Dome to Base Sand', upper: 'Top Dome', top: 1500, base: 1660 }]);
  });
});
