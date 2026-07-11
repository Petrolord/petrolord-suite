import React, { useMemo, useState } from 'react';
import WellImport from './components/WellImport';
import MapView from './components/MapView';
import { WELL_COLORS } from './components/WellsPanel';
import { computeWellPath, verticalWellPath } from './engine/wellPath';
import { surveyAffine, worldToIlxl } from './engine/surveyGeometry';

// Dev-only harness route (/dev/seismolord-wells, DEV builds only): the
// REAL WellImport form + the REAL MapView on the ROTATED fixture's
// exact affine truth (dome_rot: azimuth 30°, rectangular 25/37.5 m
// bins — the survey where axis-aligned shortcuts fail loudly), no auth
// or DB. Saves are captured locally; the last well's surface and TD
// are projected to fractional IL/XL through the app's own
// surveyAffine/worldToIlxl and exposed as testids so the Playwright
// spec can hold them against the Python oracle's independent inversion
// (wells.json lattice truth, < 0.1 cell).

// dome_rot affine truth (tools/validation/seismolord/model.py)
const ROT_AFFINE = {
  origin: { x: 500000.0, y: 6700000.0 },
  il_vec: { x: -18.749999999999996, y: 32.47595264191645 },
  xl_vec: { x: 21.65063509461097, y: 12.499999999999998 },
};

const MANIFEST = {
  geometry: {
    il: { min: 1, step: 1, count: 16 },
    xl: { min: 101, step: 1, count: 16 },
    ns: 32,
    dt_us: 4000,
    affine: ROT_AFFINE,
    corners: {
      first: { x: ROT_AFFINE.origin.x, y: ROT_AFFINE.origin.y },
      last: { x: 500193.0, y: 6700675.0 },
    },
  },
  stats: { rms: 0.5 },
};

export default function SeismolordWellsHarness() {
  const [wells, setWells] = useState([]);
  // MapView only needs the lattice dimensions from geom
  const geom = useMemo(() => ({ nIl: 16, nXl: 16, ns: 32, brickSize: 64 }), []);
  const aff = useMemo(() => surveyAffine(MANIFEST.geometry), []);

  const onSave = async (draft) => {
    const opts = { surfaceX: draft.surfaceX, surfaceY: draft.surfaceY, kb: draft.kbM };
    const path = draft.deviation.length >= 2
      ? computeWellPath(draft.deviation, opts)
      : verticalWellPath({ ...opts, td: draft.tdMdM });
    setWells((ws) => [...ws, {
      id: `w${ws.length + 1}`,
      name: draft.name,
      color: WELL_COLORS[ws.length % WELL_COLORS.length],
      surfaceX: draft.surfaceX,
      surfaceY: draft.surfaceY,
      path,
    }]);
  };

  const last = wells[wells.length - 1];
  const surfIj = last ? worldToIlxl(aff, last.surfaceX, last.surfaceY) : null;
  const end = last ? last.path[last.path.length - 1] : null;
  const tdIj = end ? worldToIlxl(aff, end.x, end.y) : null;

  return (
    <div style={{ background: '#0b1220', minHeight: '100vh', color: '#cbd5e1', padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Seismolord wells harness (rotated survey)</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
        <span data-testid="harness-well-count">{wells.length}</span>
        <span data-testid="harness-well-surface-ilxl">
          {surfIj ? `${surfIj.i},${surfIj.j}` : '-'}
        </span>
        <span data-testid="harness-well-td-ilxl">
          {tdIj ? `${tdIj.i},${tdIj.j}` : '-'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 460 }}>
          <WellImport onSave={onSave} />
        </div>
        <div style={{ width: 640 }}>
          <MapView
            manifest={MANIFEST}
            geom={geom}
            horizons={[]}
            faults={[]}
            wells={wells}
            height={420}
          />
        </div>
      </div>
    </div>
  );
}
