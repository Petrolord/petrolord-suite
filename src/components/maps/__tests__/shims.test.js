// Seismolord keeps its exports by identity through the shims, and the
// structure LUT is byte-identical to the ramp both map twins inlined.
import {
  niceStepDown, niceStepUp, fmtTick, scaleBarSpec, drawScaleBar, drawNorthArrow,
} from '../annotations';
import {
  niceStepDown as sNiceStepDown, niceStepUp as sNiceStepUp, fmtTick as sFmtTick,
  scaleBarSpec as sScaleBarSpec, drawScaleBar as sDrawScaleBar, drawNorthArrow as sDrawNorthArrow,
  axisTicks, drawAxes, drawColorbar,
} from '@/pages/apps/Seismolord/viewer/annotations';
import { buildLut as seismoBuildLut } from '@/pages/apps/Seismolord/viewer/shaderChunks';
import { buildLut, STRUCTURE_LUT, lutOf, MAP_COLORMAPS } from '../lut';
import { niceStepUp as numericNiceStepUp } from '@/lib/gridding/numeric';

test('Seismolord annotations re-export the kit functions by identity', () => {
  expect(sNiceStepDown).toBe(niceStepDown);
  expect(sNiceStepUp).toBe(niceStepUp);
  expect(sFmtTick).toBe(fmtTick);
  expect(sScaleBarSpec).toBe(scaleBarSpec);
  expect(sDrawScaleBar).toBe(drawScaleBar);
  expect(sDrawNorthArrow).toBe(drawNorthArrow);
  expect(niceStepUp).toBe(numericNiceStepUp);
  // the survey-bound half stays in Seismolord
  expect(typeof axisTicks).toBe('function');
  expect(typeof drawAxes).toBe('function');
  expect(typeof drawColorbar).toBe('function');
});

test('shaderChunks re-exports buildLut by identity', () => {
  expect(seismoBuildLut).toBe(buildLut);
});

test('STRUCTURE_LUT is the historic five-stop ramp', () => {
  const stops = [
    [0.0, [40, 60, 160]], [0.25, [40, 180, 200]], [0.5, [60, 190, 90]],
    [0.75, [230, 210, 70]], [1.0, [210, 60, 50]],
  ];
  const ref = (i) => {
    const f = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (f >= stops[s][0] && f <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const t = (f - a[0]) / (b[0] - a[0] || 1);
    return [0, 1, 2].map((k) => Math.round(a[1][k] + t * (b[1][k] - a[1][k])));
  };
  for (const i of [0, 64, 128, 192, 255]) {
    expect(Array.from(STRUCTURE_LUT.slice(i * 4, i * 4 + 3))).toEqual(ref(i));
    expect(STRUCTURE_LUT[i * 4 + 3]).toBe(255);
  }
  expect(lutOf()).toBe(STRUCTURE_LUT);
  expect(lutOf({ colormap: 'structure', reverse: true })[0]).toBe(210);
  expect(MAP_COLORMAPS[0].key).toBe('structure');
  expect(MAP_COLORMAPS.length).toBeGreaterThan(1);
  expect(lutOf({ colormap: MAP_COLORMAPS[1].key }).length).toBe(1024);
});
