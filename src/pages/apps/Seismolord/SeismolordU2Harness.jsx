import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { buildTestBricks } from './viewer/selfTest';
import { assembleSlice } from './engine/sliceAssembly';
import SliceView from './components/SliceView';
import MapView from './components/MapView';
import PlotDialog from './components/workspace/dialogs/PlotDialog';
import { guidedTrack2D } from './lib/trackerEdit';
import { MistieCharacterTable } from './components/Line2dPanel';
import { crossingCharacter, solveCharacter } from './lib/mistieCharacter';
import { rotateConstantPhase } from './engine/tieWarp';

// U2-014: three synthetic 2D lines at one crossing each pair, rotated
// 0, 30, -20 degrees and scaled 1, 1.5, 0.8 about a common trace
function mistieDemo() {
  const ns = 200;
  const ricker = (x, w = 4) => { const a = (x / w) ** 2; return (1 - 2 * a) * Math.exp(-a); };
  const base = Float32Array.from({ length: ns }, (_, k) => ricker(k - 90) - 0.6 * ricker(k - 104) + 0.4 * ricker(k - 118));
  const lines = [[0, 1], [30, 1.5], [-20, 0.8]].map(([d, k]) => Float32Array.from(rotateConstantPhase(base, (d * Math.PI) / 180), (v) => v * k));
  const measured = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({ a, b, timeMs: 0, ...crossingCharacter(lines[a], lines[b], 100, 100, { half: 40 }) }));
  return {
    participants: ['L-101', 'L-102', 'L-103'].map((name, i) => ({ line: { id: `l${i}`, name, survey_meta: {} } })),
    horizon: 'Top Reservoir',
    character: { measured, sol: solveCharacter(3, measured) },
  };
}

// Dev-only harness route (/dev/seismolord-u2, DEV builds only): the Step 2
// upgrade features on the deterministic synthetic volume, no auth or DB.
// The real SliceView, MapView and PlotDialog (U2-001: templates, legend,
// company and analyst held in an in-memory store that stands in for the
// account metadata). Later U2 items add their panels here.

const DIM = 64;
const AFFINE = {
  origin: { x: 500000, y: 6000000 },
  il_vec: { x: 0, y: 25 },
  xl_vec: { x: 25, y: 0 },
};
const WELL = { il: 32, xl: 44 };

export const memoryIdentityStore = () => {
  let saved = { company: '', analyst: 'Harness Analyst' };
  return {
    load: async () => ({ ...saved }),
    save: async (id) => { saved = { ...id }; window.__plotIdentity = saved; return saved; },
  };
};

export default function SeismolordU2Harness() {
  const { geom, getBrick } = useMemo(() => buildTestBricks(DIM), []);
  const [lineIndex, setLineIndex] = useState(WELL.il);
  const [slice, setSlice] = useState(null);
  const [plotOpen, setPlotOpen] = useState(false);
  const sectionCameraApi = useRef(null);
  const mapCameraApi = useRef(null);
  const identityStore = useMemo(memoryIdentityStore, []);
  const mistie = useMemo(mistieDemo, []);
  // U2-010: guided two-point tracking on the displayed line
  const [pickMode, setPickMode] = useState(null);
  const [guide, setGuide] = useState([]);
  const [guided, setGuided] = useState(null);
  const onPick = (p) => {
    if (pickMode !== 'seed') return;
    setGuide((g) => [...g, { trace: p.xlIdx, sample: p.sample }].slice(-2));
  };
  const runGuided = () => {
    try {
      const r = guidedTrack2D(slice, guide[0], guide[1], { mode: 'peak', maxStep: 2 });
      setGuided({ ...r, error: null });
    } catch (e) { setGuided({ error: e.message }); }
  };

  const manifest = useMemo(() => ({
    geometry: {
      il: { min: 1000, step: 1, count: DIM },
      xl: { min: 2000, step: 1, count: DIM },
      ns: DIM,
      dt_us: 4000,
      affine: AFFINE,
      corners: {
        first: { x: AFFINE.origin.x, y: AFFINE.origin.y },
        last: { x: AFFINE.origin.x + (DIM - 1) * 25, y: AFFINE.origin.y + (DIM - 1) * 25 },
      },
    },
    stats: { rms: 0.5 },
  }), []);

  useEffect(() => {
    let stale = false;
    assembleSlice(getBrick, geom, 'inline', lineIndex).then((s) => {
      if (!stale) setSlice({ ...s, orientation: 'inline' });
    });
    return () => { stale = true; };
  }, [getBrick, geom, lineIndex]);

  const horizon = useMemo(() => {
    const grid = new Float32Array(DIM * DIM);
    for (let i = 0; i < DIM; i++) {
      for (let x = 0; x < DIM; x++) {
        grid[i * DIM + x] = DIM / 2 + 8 * Math.sin(0.12 * x) + 5 * Math.cos(0.1 * i);
      }
    }
    return {
      id: 'h1', name: 'Top Reservoir', grid, color: '#4ade80', display: {},
    };
  }, []);

  const overlays = useMemo(() => {
    const stick = [0, 1, 2].map((k) => ({ il: WELL.il, xl: 20 + k, s: 12 + 14 * k }));
    const wellPts = [];
    for (let s = 2; s <= DIM - 2; s += 1) wellPts.push({ il: WELL.il, xl: WELL.xl, s });
    const guidedGrid = (() => {
      if (!guided?.picks) return null;
      const g = new Float32Array(DIM * DIM).fill(Math.fround(1e30));
      for (let t = 0; t < DIM; t++) g[lineIndex * DIM + t] = guided.picks[t];
      return { id: 'guided', name: 'Guided pick', grid: g, color: '#facc15' };
    })();
    return {
      horizons: guidedGrid ? [horizon, guidedGrid] : [horizon],
      faults: [{
        id: 'f1', name: 'Fault F1', sticks: [{ points: stick }], color: '#f97316',
      }],
      draftSticks: [],
      seedPick: null,
      wells: [{
        id: 'w1', name: 'OKAN-1', color: '#fbbf24', points: wellPts, tops: [{ name: 'Top A', il: WELL.il, xl: WELL.xl, s: 30 }],
      }],
    };
  }, [horizon, guided, lineIndex]);

  const mapWells = useMemo(() => [{
    id: 'w1',
    name: 'OKAN-1',
    color: '#fbbf24',
    surfaceX: AFFINE.origin.x + WELL.xl * 25,
    surfaceY: AFFINE.origin.y + WELL.il * 25,
    path: null,
  }], []);

  return (
    <div style={{ padding: 12 }} className="text-pl-text">
      <div className="flex items-center gap-3 mb-2 text-xs">
        <strong>Seismolord U2 harness</strong>
        <label>
          Inline index
          <input
            type="number"
            data-testid="u2-line-index"
            value={lineIndex}
            min={0}
            max={DIM - 1}
            onChange={(e) => setLineIndex(Math.max(0, Math.min(DIM - 1, Number(e.target.value) || 0)))}
            className="ml-1 w-16 border border-pl-border bg-pl-surface px-1"
          />
        </label>
        <span data-testid="u2-status">{slice ? 'ready' : 'loading'}</span>
        <button type="button" data-testid="u2-pick-seed" onClick={() => setPickMode((m) => (m ? null : 'seed'))} className="border border-pl-border px-2">
          {pickMode ? 'Picking guide points' : 'Pick guide points'}
        </button>
        <span data-testid="u2-guide-points">{guide.map((g) => `${g.trace}:${g.sample.toFixed(1)}`).join(' ')}</span>
        <button type="button" data-testid="u2-guided" onClick={runGuided} disabled={guide.length < 2} className="border border-pl-border px-2">
          Guided track
        </button>
        <span data-testid="u2-guided-result">{guided ? (guided.error || `${guided.tracked} traces ${guided.from}-${guided.to}`) : ''}</span>
        <button type="button" data-testid="u2-open-plot" onClick={() => setPlotOpen(true)} className="border border-pl-border px-2">
          Plot to PDF
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div data-testid="u2-section">
          <SliceView
            slice={slice}
            geom={geom}
            manifest={manifest}
            orientation="inline"
            sliceIndex={lineIndex}
            display={{
              colormap: 'seismic_rwb', gain: 1, polarity: 1, clip: 1.5, traceBalance: false,
            }}
            overlays={overlays}
            pickMode={pickMode}
            onPick={onPick}
            loading={false}
            height={360}
            cameraApi={sectionCameraApi}
            lineLabel={`Inline ${1000 + lineIndex}`}
          />
        </div>
        <div data-testid="u2-map">
          <MapView
            manifest={manifest}
            geom={geom}
            horizons={[horizon]}
            faults={overlays.faults}
            wells={mapWells}
            height={360}
            cameraApi={mapCameraApi}
          />
        </div>
      </div>
      <div className="mt-3 max-w-2xl" data-testid="u2-mistie">
        <strong className="text-xs">2D crossings: phase and amplitude</strong>
        <MistieCharacterTable result={mistie} busy={false} onApply={() => { window.__mistieApplied = mistie.character.sol; }} />
      </div>
      <PlotDialog
        open={plotOpen}
        onOpenChange={setPlotOpen}
        sectionCameraApi={sectionCameraApi}
        mapCameraApi={mapCameraApi}
        volume={{ name: 'u2_synthetic' }}
        crsName="WGS 84 / UTM zone 31N"
        identityStore={identityStore}
        extraRows={() => [['Build', 'harness']]}
      />
    </div>
  );
}
