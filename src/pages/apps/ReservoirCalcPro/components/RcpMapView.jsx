// ReservoirCalc Pro 2D map on the shared Mapping map kit (upgrade U2-009).
// A thin adapter over src/components/maps/MapViewport, as Earth Modeling's
// MapView is: AOIs drawn as the kit's polygons, the in-progress AOI as its
// pending ring, and a plain click adds a vertex while drawing.
import React, { useMemo } from 'react';
import MapViewport from '@/components/maps/MapViewport';
import { kitPolygons } from '../services/mapKitGrid';

export default function RcpMapView({
  kit, label = '', unit = '', xyToM = 1, aois = [], activeAoiId = null,
  drawing = { isActive: false, currentPoints: [] }, enableDrawing = false, onAddPoint, colormap = 'structure',
}) {
  const polygons = useMemo(() => kitPolygons(aois, activeAoiId), [aois, activeAoiId]);
  if (!kit) return null;
  const isDrawing = !!(enableDrawing && drawing?.isActive);
  return (
    <MapViewport
      testIdPrefix="rcp-map"
      spec={kit.spec}
      grid={kit.grid}
      polygons={polygons}
      pendingVertices={isDrawing ? drawing.currentPoints : []}
      drawing={isDrawing}
      onMapClick={(p) => onAddPoint?.({ x: p.x, y: p.y })}
      colormap={colormap}
      xyToM={xyToM}
      height="fill"
      label={label}
      zUnit={unit}
      zFormat={(v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2))}
      hint={isDrawing ? 'click to add AOI vertices' : ''}
    />
  );
}
