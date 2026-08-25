// Reports tab (WD6): the deliverable PDF pack — wall plot, survey
// listing, anti-collision report — generated client-side from the
// design's SAVED station cache (the same trajectory publish and
// exports use) and the saved wp_ac_runs history. Honest disabled
// states; nothing renders from unsaved drafts.

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText, Map as MapIcon, Shield } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useWellPlanningStore } from '../state/WellPlanningStore';
import {
  resolveMagReference, computeStationUncertainty, eouPlanEllipses, eouSectionBand,
} from '../services/acUtils';
import { buildTrajectoryContract } from '../services/trajectoryContract';
import {
  generateWallPlot, generateSurveyListing, generateAcReport,
} from '../services/reportPack';
import { getSurveyProgram, listAcRuns } from '../services/wpApi';

const CARD = 'flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-4';

const ReportsTab = () => {
  const { site, wellbore, design, targets: siteTargets } = useWellPlanningStore();
  const { toast } = useToast();
  const [busy, setBusy] = useState(null); // 'wallplot' | 'listing' | 'ac'
  const [acRuns, setAcRuns] = useState([]);
  const [acRunId, setAcRunId] = useState(null);
  const [programIntervals, setProgramIntervals] = useState(null);

  useEffect(() => {
    if (!design?.id) { setAcRuns([]); setAcRunId(null); return; }
    listAcRuns(design.id)
      .then((rows) => { setAcRuns(rows); setAcRunId(rows[0]?.id ?? null); })
      .catch(() => setAcRuns([]));
    getSurveyProgram(design.id)
      .then((row) => setProgramIntervals(Array.isArray(row?.intervals) && row.intervals.length ? row.intervals : null))
      .catch(() => setProgramIntervals(null));
  }, [design?.id]);

  const stations = useMemo(() => (Array.isArray(design?.stations) && design.stations.length >= 2
    ? design.stations : null), [design]);
  const magRef = useMemo(() => resolveMagReference(site, wellbore), [site, wellbore]);

  const buildInputs = () => {
    const contract = buildTrajectoryContract({
      site, wellbore, design, stations, magRef,
      generatedAt: new Date().toISOString(),
    });
    let uncertainty = null;
    if (magRef) {
      try {
        const { totalCov } = computeStationUncertainty(stations, magRef, { programIntervals });
        uncertainty = {
          ellipses: eouPlanEllipses(contract.stations, totalCov, { k: 2, every: 8 }),
          band: eouSectionBand(contract.stations, totalCov, { k: 2 }),
        };
      } catch (e) { /* wall plot still generates, without EOU */ }
    }
    const headX = wellbore?.head_x ?? 0;
    const headY = wellbore?.head_y ?? 0;
    const targets = (siteTargets || []).map((t) => ({
      name: t.name,
      n: (t.center_y ?? 0) - headY,
      e: (t.center_x ?? 0) - headX,
      tvdss: t.tvdss_m,
      radius: t.geometry?.radius_m || t.geometry?.semi_major_m || 0,
    }));
    return { contract, uncertainty, targets };
  };

  const run = (kind, fn) => async () => {
    setBusy(kind);
    try {
      const doc = await fn();
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`${wellbore?.name || 'well'}-${design?.name || 'design'}-${kind}-${stamp}.pdf`);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Report generation failed', description: e.message });
    } finally {
      setBusy(null);
    }
  };

  const handleWallPlot = run('wallplot', async () => {
    const { contract, uncertainty, targets } = buildInputs();
    return generateWallPlot({
      contract, targets, uncertainty, magRef, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  });

  const handleListing = run('listing', async () => {
    const { contract } = buildInputs();
    return generateSurveyListing({
      contract, magRef, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  });

  const handleAcReport = run('ac', async () => {
    const acRun = acRuns.find((r) => r.id === acRunId);
    return generateAcReport({
      run: acRun,
      wellName: wellbore?.name || '',
      designLabel: `${design?.name} r${design?.revision}`,
      generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  });

  if (!design) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        Select a design in the tree to generate reports.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-xs text-slate-400">
        Reports render from the design's saved trajectory ({stations ? `${stations.length} stations` : 'none — save the design first'})
        {magRef ? ` with ISCWSA MWD Rev4 uncertainty (${magRef.source === 'cache' ? 'cached' : 'live'} geomagnetics)` : '; no geomagnetic reference, so EOU overlays are omitted'}.
      </p>

      <div className={CARD}>
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-lime-400" />
          <h3 className="text-sm font-bold text-white">Wall plot</h3>
        </div>
        <p className="text-xs text-slate-400">
          A4 landscape: well header block, plan and section views with 2σ EOU overlays,
          key stations, targets. Vector graphics — crisp at print scale.
        </p>
        <Button onClick={handleWallPlot} disabled={!stations || busy != null}
          className="h-8 w-fit bg-lime-600 hover:bg-lime-700 text-white text-xs" data-testid="report-wallplot">
          {busy === 'wallplot' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
          Generate wall plot PDF
        </Button>
      </div>

      <div className={CARD}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-lime-400" />
          <h3 className="text-sm font-bold text-white">Survey listing</h3>
        </div>
        <p className="text-xs text-slate-400">
          Portrait: full station listing (MD, inc, grid azimuth, TVD, TVDSS, N/E, DLS, VS)
          with the well header and TD/QC summary.
        </p>
        <Button onClick={handleListing} disabled={!stations || busy != null}
          className="h-8 w-fit bg-lime-600 hover:bg-lime-700 text-white text-xs" data-testid="report-listing">
          {busy === 'listing' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
          Generate survey listing PDF
        </Button>
      </div>

      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-lime-400" />
          <h3 className="text-sm font-bold text-white">Anti-collision report</h3>
        </div>
        <p className="text-xs text-slate-400">
          From a saved separation scan: rule parameters, per-offset minimum SF,
          vector SF ladder, and every station below the review threshold.
        </p>
        {acRuns.length > 0 ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-slate-500">Saved run</Label>
              <Select value={acRunId ?? ''} onValueChange={setAcRunId}>
                <SelectTrigger className="h-8 mt-1 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 text-white">
                  {acRuns.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {new Date(r.created_at).toLocaleString()} — {(r.summary?.status || '').toUpperCase()}, min SF {r.summary?.overallMinSf ?? '—'} ({r.summary?.offsetCount} offsets)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAcReport} disabled={!acRunId || busy != null}
              className="h-8 bg-lime-600 hover:bg-lime-700 text-white text-xs" data-testid="report-ac">
              {busy === 'ac' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-1 h-3.5 w-3.5" />}
              Generate AC report PDF
            </Button>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500">
            No saved runs for this design — run and save a scan on the Anti-Collision tab first.
          </p>
        )}
      </div>
    </div>
  );
};

export default ReportsTab;
