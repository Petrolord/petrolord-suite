// Surface map viewport (Mapping & Surface Studio): since MS1
// (2026-09-05) a thin adapter over the shared map viewport
// (src/components/maps/MapViewport). A geo_surfaces row becomes the
// grid spec; z labels print in the display unit for lengths (depth
// elevation, thickness) and raw for attributes.

import React, { forwardRef, useMemo } from 'react';
import MapViewport from '@/components/maps/MapViewport';
import { fmtTick } from '@/components/maps/annotations';
import { contourLevels, gridRange } from '@/lib/gridding/mapContours';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';

export const DEFAULT_MAP_DISPLAY = Object.freeze({
  contourStep: '',   // display-unit interval; '' = automatic
  labels: true,
  colormap: 'structure',
  reverse: false,
  names: true,
  posted: true,
  legend: true,
  scaleBar: true,
  north: true,
  axes: false,
});

/**
 * Contour step in metres plus a label formatter, from a typed interval
 * (display unit) or an automatic nice step chosen IN THE DISPLAY UNIT,
 * so a feet session contours at 50 ft, not at 32.8 ft (10 m).
 */
export function contourPlan({ grid, typed, unit = 'ft', isLength = true, target = 10, sign = 1 }) {
  const toDisp = (v) => (isLength ? sign * toDisplay(v, unit) : v);
  const fromDisp = (v) => (isLength ? fromDisplay(sign * v, unit) : v);
  const t = Number(typed);
  let stepDisp;
  if (t > 0) stepDisp = t;
  else if (grid) {
    const { zMin, zMax } = gridRange(grid);
    const [a, b] = [toDisp(zMin), toDisp(zMax)].sort((p, q) => p - q);
    stepDisp = b > a ? contourLevels(a, b, target).step : 0;
  } else stepDisp = 0;
  const stepM = stepDisp > 0 ? fromDisp(stepDisp) : null;
  const format = (v) => fmtTick(toDisp(v), stepDisp > 0 ? stepDisp : 1);
  return { stepM, stepDisp, format, toDisp, fromDisp };
}

/**
 * Display sign of a surface (Mapping T1 MAP-T1-013): -1 shows a depth
 * STRUCTURE as positive depth below datum (storage stays elevation); every
 * other surface, and the default, keeps its stored sign.
 */
export const displaySign = (surface, depthPositive) => (
  depthPositive && surface?.z_domain === 'depth' && surface?.kind !== 'isochore' ? -1 : 1
);

/** Round colour-bar levels chosen in the display unit, returned in data units. */
export const colorbarLevelsFor = (toDisp, fromDisp) => (zMin, zMax, ticks) => {
  const [a, b] = [toDisp(zMin), toDisp(zMax)].sort((p, q) => p - q);
  return b > a ? contourLevels(a, b, ticks).levels.map(fromDisp) : [];
};

const MapCanvas = forwardRef(function MapCanvas({
  surface, grid, wells = [], cultureLayers = [], posted = null, markers = [],
  pendingVertices = [], drawing = false, onMapClick,
  onDragStart = null, onDrag = null, onDragEnd = null, overlays = [],
  display = { unit: 'ft', isLength: true }, settings = DEFAULT_MAP_DISPLAY,
}, ref) {
  const spec = surface ? {
    x0: surface.origin_x, y0: surface.origin_y, dx: surface.dx, dy: surface.dy, nx: surface.nx, ny: surface.ny,
    ...(surface.rotation_deg ? { rotation_deg: surface.rotation_deg } : {}),
  } : null;
  const isLength = display.isLength;
  const isTime = surface?.z_domain === 'time';
  const sign = isLength ? displaySign(surface, display.depthPositive) : 1;
  // lengths in the display unit, time in ms, attributes raw
  const zFormat = (v) => (isLength ? (sign * toDisplay(v, display.unit)).toFixed(1) : isTime ? v.toFixed(1) : v.toFixed(3));
  const zUnit = isLength ? display.unit : isTime ? 'ms' : '';
  const plan = useMemo(
    () => contourPlan({ grid, typed: settings.contourStep, unit: display.unit, isLength, sign }),
    [grid, settings.contourStep, display.unit, isLength, sign],
  );
  const levelsOf = useMemo(() => colorbarLevelsFor(plan.toDisp, plan.fromDisp), [plan]);
  return (
    <MapViewport
      ref={ref}
      testIdPrefix="map"
      spec={spec}
      grid={grid}
      wells={wells}
      cultureLayers={cultureLayers}
      markers={markers}
      pendingVertices={pendingVertices}
      drawing={drawing}
      onMapClick={onMapClick}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      overlays={overlays}
      posted={settings.posted ? posted : null}
      contourStep={plan.stepM}
      contourFormat={plan.format}
      contourLabels={settings.labels}
      colormap={settings.colormap}
      reverse={settings.reverse}
      showNames={settings.names}
      showLegend={settings.legend}
      showScaleBar={settings.scaleBar}
      showNorth={settings.north}
      showAxes={settings.axes}
      height="fill"
      zFormat={zFormat}
      colorbarLevels={isLength || isTime ? levelsOf : null}
      zUnit={zUnit}
      label={surface?.name || ''}
    />
  );
});

export default MapCanvas;
