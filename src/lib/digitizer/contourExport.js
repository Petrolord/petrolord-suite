// Digitized contour export (Contour Map Digitizer, MAP-U1-007,
// 2026-09-30). The first exports wrote image PIXELS (y down) as GeoJSON,
// DXF and CSV coordinates, dropped the fault lines from GeoJSON and DXF,
// and wrote every DXF vertex at elevation 0. Here every export is in the
// georeferenced world frame, carries each line's value and layer, and
// refuses to write without a georeference. Pure text builders.

const need = (pixelToWorld) => {
  if (typeof pixelToWorld !== 'function') throw new Error('Set the georeference first: without it the file would carry image pixels, not map coordinates.');
};

const elevationOf = (value, valuesAre) => {
  const v = Number(value);
  if (value === null || value === '' || !Number.isFinite(v)) return null;
  return valuesAre === 'depth' ? -v : v;
};

const linesOf = (layers) => [
  ...(layers?.contours || []).map((l) => ({ ...l, layer: 'contour' })),
  ...(layers?.faults || []).map((l) => ({ ...l, layer: 'fault' })),
].filter((l) => Array.isArray(l.points) && l.points.length >= 2);

/**
 * GeoJSON in the map's projected CRS. RFC 7946 expects WGS 84; projected
 * files carry the legacy `crs` member, which QGIS and ArcGIS read.
 */
export function contoursGeoJSON(layers, pixelToWorld, { valuesAre = 'depth', zUnit = 'm', crs = null, name = 'contours' } = {}) {
  need(pixelToWorld);
  const features = linesOf(layers).map((l) => ({
    type: 'Feature',
    properties: {
      layer: l.layer,
      value: l.value === null || l.value === '' ? null : Number(l.value),
      value_convention: valuesAre === 'depth' ? 'depth positive down' : 'elevation',
      elevation: elevationOf(l.value, valuesAre),
      unit: zUnit,
    },
    geometry: { type: 'LineString', coordinates: l.points.map(([px, py]) => pixelToWorld(px, py)) },
  }));
  const fc = { type: 'FeatureCollection', name, features };
  if (crs) fc.crs = { type: 'name', properties: { name: crs } };
  return JSON.stringify(fc, null, 1);
}

/** DXF R12 polylines, layers CONTOURS and FAULTS, Z = elevation. */
export function contoursDXF(layers, pixelToWorld, { valuesAre = 'depth', zUnit = 'm', crs = null } = {}) {
  need(pixelToWorld);
  const out = ['999', `Petrolord Contour Map Digitizer: Z is elevation (negative below datum) in ${zUnit}${crs ? `; XY in ${crs}` : ''}`, '0', 'SECTION', '2', 'ENTITIES'];
  for (const l of linesOf(layers)) {
    const z = elevationOf(l.value, valuesAre) ?? 0;
    out.push('0', 'POLYLINE', '8', l.layer === 'fault' ? 'FAULTS' : 'CONTOURS', '66', '1', '10', '0.0', '20', '0.0', '30', String(z));
    for (const [px, py] of l.points) {
      const [x, y] = pixelToWorld(px, py);
      out.push('0', 'VERTEX', '8', l.layer === 'fault' ? 'FAULTS' : 'CONTOURS', '10', String(x), '20', String(y), '30', String(z));
    }
    out.push('0', 'SEQEND');
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return `${out.join('\n')}\n`;
}

/** Contour points CSV: x, y, the value as entered, elevation, line and layer. */
export function contoursCSV(layers, pixelToWorld, { valuesAre = 'depth', zUnit = 'm' } = {}) {
  need(pixelToWorld);
  const rows = [];
  linesOf(layers).forEach((l, i) => {
    const el = elevationOf(l.value, valuesAre);
    for (const [px, py] of l.points) {
      const [x, y] = pixelToWorld(px, py);
      rows.push([x.toFixed(3), y.toFixed(3), l.value ?? '', el ?? '', i + 1, l.layer].join(','));
    }
  });
  return `x,y,value_${valuesAre === 'depth' ? 'depth' : 'elevation'}_${zUnit},elevation_${zUnit},line,layer\n${rows.join('\n')}\n`;
}
