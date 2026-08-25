// The Well Design Studio trajectory contract (WD5): the versioned,
// self-describing shape every downstream consumer reads — torque &
// drag, casing design, reporting, external tools. One builder, four
// serializers (JSON / CSV / Excel / DXF). Pure functions, jest-tested;
// the UI supplies rows and triggers downloads.
//
// Contract frame: stations in METRES with GRID azimuths (registry
// convention); positions both wellhead-relative (n/e) and absolute
// site-CRS (x/y); TVD below KB and TVDSS. The header carries the full
// azimuth chain (reference, convergence, declination) and geomagnetic
// context so consumers can convert without guessing.

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Drawing from 'dxf-writer';
import { computeSurveyTable } from '../engine/surveyMath';

export const TRAJECTORY_CONTRACT_VERSION = '1.0.0';

/**
 * Build the contract object.
 * stations: grid-metre {md, inc, azi} (a design's saved cache or a
 * definitive composite). generatedAt: ISO string from the caller.
 */
export function buildTrajectoryContract({
  site, wellbore, design, stations, magRef = null, generatedAt = null,
  source = 'plan',
}) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('A trajectory contract needs at least 2 stations.');
  }
  const headX = wellbore?.head_x ?? 0;
  const headY = wellbore?.head_y ?? 0;
  const kb = wellbore?.kb_elev_m ?? 0;
  const table = computeSurveyTable(stations, {
    surfaceX: headX, surfaceY: headY, kb, mdUnit: 'm',
  });
  return {
    contract: 'petrolord-trajectory',
    version: TRAJECTORY_CONTRACT_VERSION,
    generatedAt,
    source, // 'plan' | 'composite'
    site: site ? {
      name: site.name ?? null,
      crs: site.crs ?? null,
      xyUnit: site.xy_unit ?? null,
      northReference: site.north_reference ?? 'grid',
    } : null,
    wellbore: {
      name: wellbore?.name ?? null,
      uwi: wellbore?.uwi ?? null,
      headX,
      headY,
      kbElevM: kb,
      groundElevM: wellbore?.ground_elev_m ?? null,
      depthUnit: wellbore?.depth_unit ?? 'm',
      azimuthReference: wellbore?.azimuth_reference ?? 'grid',
      gridConvergenceDeg: wellbore?.grid_convergence_deg ?? null,
      magDeclinationDeg: wellbore?.mag_declination_deg ?? null,
    },
    design: design ? {
      name: design.name ?? null,
      revision: design.revision ?? null,
      status: design.status ?? null,
      engineVersion: design.engine_version ?? null,
    } : null,
    geomagnetics: magRef ? {
      model: 'WMM2025',
      bTotalNT: magRef.bTotalNT,
      dipDeg: magRef.dipDeg,
      declinationDeg: magRef.declinationDeg,
    } : null,
    units: {
      depths: 'm', azimuths: 'deg grid north', dls: 'deg/30m', coordinates: 'site CRS metres',
    },
    stations: table.map((r) => ({
      md: r.md,
      inc: r.inc,
      azi: r.azi,
      tvd: r.tvd,
      tvdss: r.tvdss,
      n: r.n,
      e: r.e,
      x: r.x,
      y: r.y,
      dls30m: r.dls30m,
      vs: r.vs,
    })),
  };
}

/** Contract -> JSON text (pretty, stable field order per builder). */
export function contractToJson(contract) {
  return JSON.stringify(contract, null, 2);
}

const CSV_COLUMNS = [
  ['MD_m', (s) => s.md], ['Inc_deg', (s) => s.inc], ['AziGrid_deg', (s) => s.azi],
  ['TVD_m', (s) => s.tvd], ['TVDSS_m', (s) => s.tvdss],
  ['North_m', (s) => s.n], ['East_m', (s) => s.e],
  ['X_m', (s) => s.x], ['Y_m', (s) => s.y],
  ['DLS_deg30m', (s) => s.dls30m], ['VS_m', (s) => s.vs],
];

/** Contract -> CSV with a # header block carrying the context. */
export function contractToCsv(contract) {
  const meta = [
    `# petrolord-trajectory v${contract.version}`,
    `# well: ${contract.wellbore.name ?? ''}  design: ${contract.design?.name ?? ''} r${contract.design?.revision ?? ''} (${contract.source})`,
    `# site CRS: ${contract.site?.crs ?? 'unset'}  head: ${contract.wellbore.headX}, ${contract.wellbore.headY}  KB: ${contract.wellbore.kbElevM} m`,
    `# azimuths grid north; convergence ${contract.wellbore.gridConvergenceDeg ?? 'n/a'} deg; declination ${contract.wellbore.magDeclinationDeg ?? 'n/a'} deg`,
  ].join('\n');
  const rows = contract.stations.map((s) => Object.fromEntries(
    CSV_COLUMNS.map(([name, get]) => [name, +get(s).toFixed(3)]),
  ));
  return `${meta}\n${Papa.unparse(rows, { newline: '\n' })}`;
}

/** Contract -> xlsx workbook (Header + Stations sheets). */
export function contractToWorkbook(contract) {
  const wb = XLSX.utils.book_new();
  const headerRows = [
    ['Contract', `${contract.contract} v${contract.version}`],
    ['Generated', contract.generatedAt ?? ''],
    ['Source', contract.source],
    ['Site', contract.site?.name ?? ''],
    ['Site CRS', contract.site?.crs ?? ''],
    ['Wellbore', contract.wellbore.name ?? ''],
    ['UWI', contract.wellbore.uwi ?? ''],
    ['Wellhead X (E)', contract.wellbore.headX],
    ['Wellhead Y (N)', contract.wellbore.headY],
    ['KB elevation (m)', contract.wellbore.kbElevM],
    ['Design', contract.design ? `${contract.design.name} r${contract.design.revision} (${contract.design.status})` : ''],
    ['Azimuth reference', `${contract.wellbore.azimuthReference} (stations are grid)`],
    ['Grid convergence (deg)', contract.wellbore.gridConvergenceDeg ?? ''],
    ['Declination (deg)', contract.wellbore.magDeclinationDeg ?? ''],
    ['Geomagnetics', contract.geomagnetics ? `${contract.geomagnetics.model}: B ${contract.geomagnetics.bTotalNT} nT, dip ${contract.geomagnetics.dipDeg} deg` : ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(headerRows), 'Header');
  const stationRows = [
    CSV_COLUMNS.map(([name]) => name),
    ...contract.stations.map((s) => CSV_COLUMNS.map(([, get]) => +get(s).toFixed(3))),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stationRows), 'Stations');
  return wb;
}

/**
 * Contract -> DXF text: the wellpath as a 3D polyline in absolute site
 * coordinates (X = easting, Y = northing, Z = elevation = -TVDSS so up
 * is positive, the CAD convention), plus a wellhead point and TD text.
 */
export function contractToDxf(contract) {
  const d = new Drawing();
  d.setUnits('Meters');
  d.addLayer('WELLPATH', Drawing.ACI.GREEN, 'CONTINUOUS');
  d.addLayer('ANNOTATION', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.setActiveLayer('WELLPATH');
  d.drawPolyline3d(contract.stations.map((s) => [s.x, s.y, -s.tvdss]));
  d.setActiveLayer('ANNOTATION');
  const head = contract.stations[0];
  const td = contract.stations[contract.stations.length - 1];
  d.drawPoint(head.x, head.y, -head.tvdss);
  d.drawText(head.x + 5, head.y + 5, 8, 0, contract.wellbore.name ?? 'well');
  d.drawText(td.x + 5, td.y + 5, 6, 0, `TD ${td.md.toFixed(0)} m MD`);
  return d.toDxfString();
}

/** The export menu in one place: {label, filename, mime, make()}. */
export function exportFormats(contract, baseName) {
  const safe = (baseName || 'trajectory').replace(/[^\w.-]+/g, '_');
  return [
    {
      id: 'json',
      label: 'JSON (contract)',
      filename: `${safe}.trajectory.json`,
      mime: 'application/json',
      make: () => contractToJson(contract),
    },
    {
      id: 'csv',
      label: 'CSV',
      filename: `${safe}.csv`,
      mime: 'text/csv',
      make: () => contractToCsv(contract),
    },
    {
      id: 'xlsx',
      label: 'Excel',
      filename: `${safe}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      make: () => XLSX.write(contractToWorkbook(contract), { type: 'array', bookType: 'xlsx' }),
    },
    {
      id: 'dxf',
      label: 'DXF (CAD)',
      filename: `${safe}.dxf`,
      mime: 'application/dxf',
      make: () => contractToDxf(contract),
    },
  ];
}
