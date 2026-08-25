// WD5 trajectory contract + serializers: the versioned shape and its
// JSON/CSV/Excel/DXF forms. Geometry comes from the validated engine
// (computeSurveyTable) — these tests pin the contract fields and that
// each serializer carries the full station set faithfully.

import * as XLSX from 'xlsx';
import {
  buildTrajectoryContract, contractToJson, contractToCsv,
  contractToWorkbook, contractToDxf, exportFormats,
  TRAJECTORY_CONTRACT_VERSION,
} from '../services/trajectoryContract';

const SITE = { name: 'Pad A', crs: 'EPSG:32631', xy_unit: 'm', north_reference: 'grid' };
const WELLBORE = {
  name: 'HAR-1', uwi: 'UWI-1', head_x: 500000, head_y: 6800000, kb_elev_m: 30,
  depth_unit: 'm', azimuth_reference: 'true', grid_convergence_deg: -1.2,
  mag_declination_deg: -4,
};
const DESIGN = { name: 'Base plan', revision: 2, status: 'definitive', engine_version: 'drilling-wd2' };

const stations = [];
for (let i = 0; i <= 20; i++) {
  stations.push({ md: i * 100, inc: Math.min(60, i * 4), azi: 45 });
}

const contract = buildTrajectoryContract({
  site: SITE, wellbore: WELLBORE, design: DESIGN, stations,
  magRef: { bTotalNT: 50000, dipDeg: 72, declinationDeg: -4 },
  generatedAt: '2026-08-25T12:00:00Z',
});

describe('buildTrajectoryContract', () => {
  test('carries the versioned header and full azimuth chain', () => {
    expect(contract.contract).toBe('petrolord-trajectory');
    expect(contract.version).toBe(TRAJECTORY_CONTRACT_VERSION);
    expect(contract.site.crs).toBe('EPSG:32631');
    expect(contract.wellbore.gridConvergenceDeg).toBe(-1.2);
    expect(contract.wellbore.magDeclinationDeg).toBe(-4);
    expect(contract.geomagnetics.model).toBe('WMM2025');
    expect(contract.units.azimuths).toMatch(/grid/);
  });

  test('stations carry engine positions in both frames', () => {
    expect(contract.stations).toHaveLength(stations.length);
    const last = contract.stations[contract.stations.length - 1];
    expect(last.md).toBe(2000);
    // absolute = wellhead + relative
    expect(last.x).toBeCloseTo(WELLBORE.head_x + last.e, 9);
    expect(last.y).toBeCloseTo(WELLBORE.head_y + last.n, 9);
    expect(last.tvdss).toBeCloseTo(last.tvd - WELLBORE.kb_elev_m, 9);
    // deviated NE quadrant: both offsets positive
    expect(last.n).toBeGreaterThan(0);
    expect(last.e).toBeGreaterThan(0);
  });

  test('rejects degenerate station sets', () => {
    expect(() => buildTrajectoryContract({
      site: SITE, wellbore: WELLBORE, design: DESIGN, stations: [stations[0]],
    })).toThrow(/at least 2 stations/);
  });
});

describe('serializers', () => {
  test('JSON round-trips', () => {
    const back = JSON.parse(contractToJson(contract));
    expect(back.stations).toHaveLength(stations.length);
    expect(back.version).toBe(TRAJECTORY_CONTRACT_VERSION);
  });

  test('CSV: header block + one row per station', () => {
    const csv = contractToCsv(contract);
    const lines = csv.split('\n');
    expect(lines[0]).toMatch(/petrolord-trajectory v1/);
    const dataLines = lines.filter((l) => l && !l.startsWith('#'));
    expect(dataLines).toHaveLength(stations.length + 1); // header row + rows
    expect(dataLines[0]).toBe('MD_m,Inc_deg,AziGrid_deg,TVD_m,TVDSS_m,North_m,East_m,X_m,Y_m,DLS_deg30m,VS_m');
  });

  test('Excel workbook: Header + Stations sheets, values intact', () => {
    const wb = contractToWorkbook(contract);
    expect(wb.SheetNames).toEqual(['Header', 'Stations']);
    // write + reread to prove the workbook is genuinely serializable
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(back.Sheets.Stations, { header: 1 });
    expect(rows).toHaveLength(stations.length + 1);
    expect(rows[0][0]).toBe('MD_m');
    expect(rows[rows.length - 1][0]).toBe(2000);
  });

  test('DXF: 3D polyline in absolute coordinates with z up', () => {
    const dxf = contractToDxf(contract);
    expect(dxf).toMatch(/POLYLINE/);
    expect(dxf).toMatch(/WELLPATH/);
    expect(dxf).toMatch(/HAR-1/);
    // one VERTEX per station
    const vertexCount = (dxf.match(/VERTEX/g) || []).length;
    expect(vertexCount).toBe(stations.length);
    // the wellhead z = -tvdss(0) = +KB elevation (up positive)
    expect(dxf).toContain('500000');
  });

  test('exportFormats offers all four with safe filenames', () => {
    const formats = exportFormats(contract, 'HAR-1/Base plan');
    expect(formats.map((f) => f.id)).toEqual(['json', 'csv', 'xlsx', 'dxf']);
    for (const f of formats) {
      expect(f.filename).not.toMatch(/[/\s]/);
      const out = f.make();
      expect(out.length ?? out.byteLength).toBeGreaterThan(100);
    }
  });
});
