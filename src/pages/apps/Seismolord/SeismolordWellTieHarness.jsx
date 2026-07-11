import React, { useState } from 'react';
import WellTiePanel from './components/WellTiePanel';
import { surveyAffine } from './engine/surveyGeometry';
import { normalizeVelocity } from './engine/velocityModel';

// Dev-only harness route (/dev/seismolord-welltie, DEV builds only):
// the REAL WellTiePanel on a synthetic KNOWN layer cake — truth
// 1600 / 2600 m/s with the boundary at 100 ms — starting from a
// deliberately perturbed 1400 / 3000 model. Two vertical wells carry
// tops at the truth depths (TopA 48 m on a 60 ms horizon inside layer
// 1, TopB 132 m on a 140 ms horizon inside layer 2), so the Playwright
// spec can drive pair -> Fit -> Apply and assert the fit recovers the
// truth exactly and Apply hands the fitted manifest model back.

const GEOM = { nIl: 16, nXl: 16 };
const DT_US = 4000;

const AFFINE = surveyAffine({
  affine: {
    origin: { x: 0, y: 0 },
    il_vec: { x: 0, y: 25 },
    xl_vec: { x: 25, y: 0 },
  },
});

const flat = (s) => new Float32Array(GEOM.nIl * GEOM.nXl).fill(s);
const GRIDS = { hz1: flat(15), hz2: flat(35) };       // 60 ms / 140 ms
const BOUNDARIES = [flat(25)];                        // 100 ms

// perturbed current model; the ties below come from truth 1600 / 2600:
// z(60ms) = 1600 * 0.03 = 48 m; z(140ms) = 1600*0.05 + 2600*0.02 = 132 m
const MODEL = normalizeVelocity({
  type: 'layercake',
  layers: [
    { base_horizon_id: 'b1', v0: 1400, k: 0 },
    { base_horizon_id: null, v0: 3000, k: 0 },
  ],
});

const WELLS = [
  {
    id: 'wa', name: 'W-A', surfaceX: 200, surfaceY: 200, kbM: 0, tdMdM: 400,
    tops: [{ name: 'TopA', md: 48 }, { name: 'TopB', md: 132 }],
  },
  {
    id: 'wb', name: 'W-B', surfaceX: 150, surfaceY: 250, kbM: 0, tdMdM: 400,
    tops: [{ name: 'TopA', md: 48 }, { name: 'TopB', md: 132 }],
  },
];

const HORIZONS = [
  { id: 'hz1', name: 'Horizon 1' },
  { id: 'hz2', name: 'Horizon 2' },
];

export default function SeismolordWellTieHarness() {
  const [applied, setApplied] = useState(null);

  return (
    <div style={{ background: '#0b1220', minHeight: '100vh', color: '#cbd5e1', padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Seismolord well-tie harness (known cake)</h1>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        applied: <span data-testid="harness-applied">{applied || '-'}</span>
      </div>
      <div style={{ width: 720 }}>
        <WellTiePanel
          wells={WELLS}
          horizons={HORIZONS}
          velocityModel={MODEL}
          boundaries={BOUNDARIES}
          dtUs={DT_US}
          geom={GEOM}
          affine={AFFINE}
          loadGrid={async (id) => GRIDS[id]}
          onApply={async (model, calibration) => setApplied(JSON.stringify({ model, calibration }))}
        />
      </div>
    </div>
  );
}
