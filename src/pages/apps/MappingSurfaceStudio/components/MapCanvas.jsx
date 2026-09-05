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
export function contourPlan({ grid, typed, unit = 'ft', isLength = true, target = 10 }) {
  const toDisp = (v) => (isLength ? toDisplay(v, unit) : v);
  const fromDisp = (v) => (isLength ? fromDisplay(v, unit) : v);
  const t = Number(typed);
  let stepDisp;
  if (t > 0) stepDisp = t;
  else if (grid) {
    const { zMin, zMax } = gridRange(grid);
    stepDisp = zMax > zMin ? contourLevels(toDisp(zMin), toDisp(zMax), target).step : 0;
  } else stepDisp = 0;
  const stepM = stepDisp > 0 ? fromDisp(stepDisp) : null;
  const format = (v) => fmtTick(toDisp(v), stepDisp > 0 ? stepDisp : 1);
  return { stepM, stepDisp, format };
}

const MapCanvas = forwardRef(function MapCanvas({
  surface, grid, wells = [], cultureLayers = [], posted = null, markers = [],
  pendingVertices = [], drawing = false, onMapClick,
  display = { unit: 'ft', isLength: true }, settings = DEFAULT_MAP_DISPLAY,
}, ref) {
  const spec = surface ? {
    x0: surface.origin_x, y0: surface.origin_y, dx: surface.dx, dy: surface.dy, nx: surface.nx, ny: surface.ny,
  } : null;
  const isLength = display.isLength;
  const isTime = surface?.z_domain === 'time';
  // lengths in the display unit, time in ms, attributes raw
  const zFormat = (v) => (isLength ? toDisplay(v, display.unit).toFixed(1) : isTime ? v.toFixed(1) : v.toFixed(3));
  const zUnit = isLength ? display.unit : isTime ? 'ms' : '';
  const plan = useMemo(
    () => contourPlan({ grid, typed: settings.contourStep, unit: display.unit, isLength }),
    [grid, settings.contourStep, display.unit, isLength],
  );
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
      zUnit={zUnit}
      label={surface?.name || ''}
    />
  );
});

export default MapCanvas;
