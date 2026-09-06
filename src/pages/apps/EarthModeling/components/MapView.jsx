// Model map viewport (Earth Modeling G8.2): any model layer (surface
// depth, zone thickness, property, fault blocks) as a colour raster
// with contours, posted wells, fault polygons, and click-to-draw fault
// polygon editing. Since Mapping MS1 (2026-09-05) a thin adapter over
// the shared map viewport (src/components/maps/MapViewport): zoom, pan,
// readout, scale bar and labelled contours come with it. The e2e pins
// (em-map-canvas box = viewport, PAD 44 fit on the node extent, plain
// click -> onMapClick) hold in the viewport.

import React from 'react';
import MapViewport from '@/components/maps/MapViewport';

export default function MapView({
  spec, grid, wells = [], polygons = [], pendingVertices = [],
  drawing = false, onMapClick, contours = true, height = 480, label = '',
}) {
  return (
    <MapViewport
      testIdPrefix="em-map"
      spec={spec}
      grid={grid}
      wells={wells}
      polygons={polygons}
      pendingVertices={pendingVertices}
      drawing={drawing}
      onMapClick={onMapClick}
      contours={contours}
      height={height}
      label={label}
      zFormat={(v) => v.toFixed(2)}
      hint={drawing ? 'click to add fault-polygon vertices' : ''}
    />
  );
}
