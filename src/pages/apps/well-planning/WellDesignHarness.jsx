// Dev-only Playwright harness for Well Design Studio (WD2): exercises
// the engine + solver dialog + chart pack in a real browser without
// auth or Supabase. The seeded pad and target are fixed so the e2e
// spec can assert engine-derived numbers, never hardcoded literals.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { compileSegments } from './engine/segmentCompiler';
import { solveSlant, solveHorizontalLanding } from './engine/profileDesign';
import { declinationAt } from './engine/magnetics';
import { computeWellPath } from './engine/surveyMath';
import { computeErrorModel } from './engine/errorModel';
import { computeClearance } from './engine/antiCollision';
import SolverDialog from './components/SolverDialog';
import PlanViewChart from './charts/PlanViewChart';
import { SectionViewPanel, DlsPanel } from './charts/TrajectoryCharts';
import LadderChart from './charts/LadderChart';
import TravelingCylinderChart from './charts/TravelingCylinderChart';
import WellpathCubeView from './components/WellpathCubeView';
import { buildTrajectoryContract, contractToCsv, contractToDxf } from './services/trajectoryContract';

const WELLBORE = {
  id: 'harness-wb', name: 'HAR-1', head_x: 500000, head_y: 6800000,
  kb_elev_m: 30, depth_unit: 'm', grid_convergence_deg: -1.2,
};
// Fixed WMM2025 probe (Niger Delta-ish wellhead, fixed epoch) so the
// e2e spec can assert the browser-bundled magnetics shim against the
// engines package digit for digit.
const MAG_PROBE = { latDeg: 4.75, lonDeg: 7.0, decimalYear: 2026.65 };

// Fixed WD4 anti-collision probe: two parallel J-wells 50 m apart with
// a fixed geomagnetic reference, run through the browser-bundled Rev4
// error model + separation rule. Deterministic, so the e2e spec
// recomputes the same scan from the engines package and asserts the
// bundle digit for digit. Keep in sync with e2e/well-design-studio.spec.js.
export const AC_PROBE = {
  magRef: {
    bTotalNT: 50000, dipDeg: 72, declinationDeg: -4, convergenceDeg: 0, aziReference: 'grid',
  },
  offsetNorth: 50,
  params: { k: 3.5, sigmaPa: 0.5, Sm: 0.3, refRadius: 0.4572, offRadius: 0.3048 },
  stations() {
    const out = [];
    for (let i = 0; i < 40; i++) {
      const md = i * 50;
      out.push({ md, inc: Math.min(30, Math.max(0, (md - 300) / 30)), azi: 90 });
    }
    return out;
  },
};

export function runAcProbe() {
  const stations = AC_PROBE.stations();
  const build = (headY) => {
    const path = computeWellPath(stations, { surfaceX: 0, surfaceY: headY, kb: 0 });
    const model = computeErrorModel(stations, AC_PROBE.magRef);
    return {
      stations,
      positions: path.map((p) => ({ n: p.y, e: p.x, tvd: p.tvd })),
      cov: model.totalCov,
      radius: headY === 0 ? AC_PROBE.params.refRadius : AC_PROBE.params.offRadius,
    };
  };
  return computeClearance(build(0), build(AC_PROBE.offsetNorth), {
    k: AC_PROBE.params.k, sigmaPa: AC_PROBE.params.sigmaPa, Sm: AC_PROBE.params.Sm,
  });
}

const TARGETS = [
  {
    id: 'harness-t1', name: 'Amber sand', kind: 'circle', category: 'geological',
    center_x: 500850, center_y: 6801100, tvdss_m: 2470,
    geometry: { radius_m: 120 }, color: '#d97706',
  },
  {
    id: 'harness-t2', name: 'Landing', kind: 'point', category: 'drillers',
    center_x: 501400, center_y: 6801650, tvdss_m: 2600,
  },
];

const WellDesignHarness = () => {
  const [segments, setSegments] = useState([
    { id: 'h1', type: 'Hold', length: 500, buildRate: 0, turnRate: 0 },
  ]);
  const [kickoffAzi, setKickoffAzi] = useState(0);
  const [solverOpen, setSolverOpen] = useState(false);

  const compiled = useMemo(() => {
    try {
      return compileSegments({
        mdUnit: 'm',
        tieOn: { md: 0, inc: 0, azi: kickoffAzi },
        segments: segments.map((s) => {
          const type = (s.type || 'Hold').toLowerCase();
          const length = parseFloat(s.length || 0);
          if (type === 'build') return { kind: 'build', rate: parseFloat(s.buildRate || 0), length };
          if (type === 'turn') return { kind: 'turn', rate: parseFloat(s.turnRate || 0), length };
          if (type === 'toolfacearc') return { kind: 'toolfaceArc', length, dls: parseFloat(s.dls || 0), toolfaceDeg: parseFloat(s.toolface || 0) };
          return { kind: 'hold', length };
        }).filter((s) => s.length > 0),
        kb: WELLBORE.kb_elev_m,
      });
    } catch (e) {
      return { error: e.message, table: null };
    }
  }, [segments, kickoffAzi]);

  const rows = compiled.table;
  const last = rows?.[rows.length - 1];
  const currentEnd = last ? { inc: last.inc, azi: last.azi, n: last.n, e: last.e, tvd: last.tvd } : null;

  const chartTargets = TARGETS.map((t) => ({
    ...t,
    e: t.center_x - WELLBORE.head_x,
    n: t.center_y - WELLBORE.head_y,
    geometry: t.geometry || {},
  }));

  const applySolution = ({ segments: solved, kickoffAzi: azi, mode }) => {
    setSegments((prev) => (mode === 'append' ? [...prev, ...solved] : solved));
    if (azi != null && mode !== 'append') setKickoffAzi(azi);
  };

  // WD4 probe: browser-bundled Rev4 + separation rule on the fixed pair.
  const acProbe = useMemo(() => {
    try { return runAcProbe(); } catch (e) { return null; }
  }, []);
  const acResults = acProbe
    ? [{ id: 'probe', label: 'Probe offset (50 m N)', clearance: acProbe, classification: { status: 'review' } }]
    : [];

  // WD5 probes: trajectory-contract exports + the 3D cube view on the
  // fixed probe geometry (deterministic; e2e recomputes the expected
  // numbers by importing the same service).
  const wd5 = useMemo(() => {
    try {
      const stations = AC_PROBE.stations();
      const contract = buildTrajectoryContract({
        site: { name: 'Harness pad', crs: 'EPSG:32631', xy_unit: 'm' },
        wellbore: WELLBORE,
        design: { name: 'Harness plan', revision: 1, status: 'draft' },
        stations,
        generatedAt: '2026-08-25T00:00:00Z',
      });
      const csv = contractToCsv(contract);
      const dxf = contractToDxf(contract);
      const model = computeErrorModel(stations, AC_PROBE.magRef);
      return {
        csvLines: csv.split('\n').length,
        dxfVertices: (dxf.match(/VERTEX/g) || []).length,
        tdTvdss: contract.stations[contract.stations.length - 1].tvdss,
        cubeWells: [
          {
            id: 'probe-plan', label: 'HAR-1 (plan)', color: '#166534', kind: 'plan',
            stations, headX: WELLBORE.head_x, headY: WELLBORE.head_y,
            kbElevM: WELLBORE.kb_elev_m, cov: model.totalCov,
          },
          {
            id: 'probe-off', label: 'HAR-offset', color: '#1d4ed8', kind: 'offset',
            stations, headX: WELLBORE.head_x, headY: WELLBORE.head_y + AC_PROBE.offsetNorth,
            kbElevM: 0,
          },
        ],
      };
    } catch (e) { return null; }
  }, []);
  const [snapshotBytes, setSnapshotBytes] = useState(null);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <h1 className="mb-2 text-sm font-bold">Well Design Studio harness</h1>
      <div className="mb-3 flex gap-2">
        <Button size="sm" data-testid="wd-open-solver" onClick={() => setSolverOpen(true)} className="h-7 bg-lime-600 text-xs">Design methods</Button>
        <Button size="sm" data-testid="wd-reset" onClick={() => { setSegments([{ id: 'h1', type: 'Hold', length: 500, buildRate: 0, turnRate: 0 }]); setKickoffAzi(0); }} variant="outline" className="h-7 border-slate-600 text-xs text-slate-300">Reset</Button>
      </div>

      <div className="mb-3 grid grid-cols-7 gap-2 text-xs" data-testid="wd-readout">
        <div>MD <span data-testid="wd-md" className="font-mono text-lime-400">{last ? last.md.toFixed(1) : '--'}</span></div>
        <div>TVD <span data-testid="wd-tvd" className="font-mono text-lime-400">{last ? last.tvd.toFixed(1) : '--'}</span></div>
        <div>N <span data-testid="wd-n" className="font-mono text-lime-400">{last ? last.n.toFixed(1) : '--'}</span></div>
        <div>E <span data-testid="wd-e" className="font-mono text-lime-400">{last ? last.e.toFixed(1) : '--'}</span></div>
        <div>Inc <span data-testid="wd-inc" className="font-mono text-lime-400">{last ? last.inc.toFixed(2) : '--'}</span></div>
        <div>Segs <span data-testid="wd-segcount" className="font-mono text-lime-400">{segments.length}</span></div>
        <div>Decl <span data-testid="wd-decl" className="font-mono text-lime-400">{declinationAt(MAG_PROBE).declinationDeg.toFixed(3)}</span></div>
        <div>AC SF <span data-testid="wd-acsf" className="font-mono text-lime-400">{acProbe ? acProbe.summary.minSf.toFixed(4) : '--'}</span></div>
        <div>CSV <span data-testid="wd-csvlines" className="font-mono text-lime-400">{wd5 ? wd5.csvLines : '--'}</span></div>
        <div>DXF <span data-testid="wd-dxfverts" className="font-mono text-lime-400">{wd5 ? wd5.dxfVertices : '--'}</span></div>
        <div>TDss <span data-testid="wd-tdtvdss" className="font-mono text-lime-400">{wd5 ? wd5.tdTvdss.toFixed(1) : '--'}</span></div>
        <div>Snap <span data-testid="wd-snapbytes" className="font-mono text-lime-400">{snapshotBytes ?? '--'}</span></div>
      </div>
      {compiled.error && <div className="mb-3 text-xs text-red-400" data-testid="wd-error">{compiled.error}</div>}

      <div className="grid h-[52vh] grid-cols-3 gap-px bg-slate-800">
        <PlanViewChart rows={rows || []} targets={chartTargets} unit="m" />
        <SectionViewPanel rows={rows || []} unit="m" vsAzimuthDeg={last?.closureAzi} />
        <DlsPanel rows={rows || []} unit="m" />
      </div>
      <div className="mt-px grid h-[34vh] grid-cols-3 gap-px bg-slate-800">
        <LadderChart results={acResults} mode="sf" unit="m" />
        <TravelingCylinderChart results={acResults} unit="m" />
        <div className="relative">
          {wd5 && (
            <WellpathCubeView
              wells={wd5.cubeWells}
              targets={[{
                id: 'harness-t1', name: 'Amber sand', kind: 'circle',
                center_x: 500850, center_y: 6801100, tvdss_m: 1400,
                geometry: { radius_m: 120 }, color: '#d97706',
              }]}
              tops={[]}
              background="light"
              onSnapshot={(url) => setSnapshotBytes(url.length)}
            />
          )}
        </div>
      </div>

      <SolverDialog
        open={solverOpen}
        onOpenChange={setSolverOpen}
        targets={TARGETS}
        wellbore={WELLBORE}
        mdUnit="m"
        kbM={WELLBORE.kb_elev_m}
        metersToUser={(v) => v}
        currentEnd={currentEnd}
        onApply={applySolution}
      />
    </div>
  );
};

// Exported for the e2e spec: the expected engine answers for the seeded
// geometry, computed by the same validated engine the app ships.
export function harnessExpectations() {
  const kop = 300;
  const dE = TARGETS[0].center_x - WELLBORE.head_x;
  const dN = TARGETS[0].center_y - WELLBORE.head_y;
  const dTvd = TARGETS[0].tvdss_m + WELLBORE.kb_elev_m - kop;
  const sol = solveSlant({ target: { dN, dE, dTvd }, buildRate: 3, mdUnit: 'm' });
  const chc = solveHorizontalLanding({
    tieOn: { inc: 0, azi: 0 },
    landing: {
      dN: TARGETS[1].center_y - WELLBORE.head_y,
      dE: TARGETS[1].center_x - WELLBORE.head_x,
      dTvd: TARGETS[1].tvdss_m + WELLBORE.kb_elev_m,
      incDeg: 90,
      aziDeg: 45,
    },
    rate1: 3, rate2: 3, mdUnit: 'm',
  });
  return { slant: sol, chc };
}

export default WellDesignHarness;
