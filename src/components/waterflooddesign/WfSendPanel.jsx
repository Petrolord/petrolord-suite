// Sending the pattern forecast downstream (WF-U2-001, RL11). The DCA pattern
// (src/components/declineCurve/DCASendPanel.jsx): what leaves this app is the
// `wf-forecast-1` contract, read by id from the saved project by the
// receiver. Forecast Scenario Hub takes it as a profile case from the flood
// start; Petroleum Economics Studio takes its calendar-year oil and water as
// a production file. Both keep the contract, print where the numbers came
// from, and say when the source changed since.
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, GitBranch, Landmark, Cuboid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { buildWfForecastContract, wfBasisLine } from '@/utils/waterflooddesign/wfForecastContract';
import { WF_BUILDERS } from '@/utils/waterflooddesign/wfForecastService';
import { buildLabel } from '@/lib/platformBuild';
import { SectionLabel } from './primitives';

export const HUB_ROUTE = '/dashboard/apps/reservoir/forecast-scenario-hub';
export const EPE_ROUTE = '/dashboard/apps/economics/epe/cases';
export const SIM_ROUTE = '/dashboard/apps/reservoir/reservoir-simulation-studio';

const WfSendPanel = () => {
  const { pathname } = useLocation();
  const onHarness = pathname.startsWith('/dev/');
  const hubRoute = onHarness ? '/dev/forecast-scenario-hub' : HUB_ROUTE;
  const epeRoute = onHarness ? '/dev/epe/cases/c1' : EPE_ROUTE;
  const simRoute = onHarness ? '/dev/reservoir-simulation-studio' : SIM_ROUTE;
  const { currentProjectId, projectName, serializeInputs, floodStart, setFloodStart, manualSave, canWrite, u } = useWaterfloodDesign();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // what would be sent, from the state on screen (the receiver reads the saved copy)
  const preview = useMemo(() => {
    if (!currentProjectId) return null;
    return buildWfForecastContract({ projectId: currentProjectId, projectName, payload: serializeInputs(), build: buildLabel() }, WF_BUILDERS);
  }, [currentProjectId, projectName, serializeInputs]);
  const go = async (to) => {
    if (busy) return;
    setBusy(true);
    try {
      if (canWrite !== false) await manualSave();
      navigate(to);
    } finally {
      setBusy(false);
    }
  };
  const c = preview?.ok ? preview.contract : null;
  const query = `wfProject=${encodeURIComponent(currentProjectId || '')}`;
  return (
    <section className="space-y-2" data-testid="wds-send">
      <SectionLabel><span className="inline-flex items-center gap-1"><Send size={12} /> Send this forecast</span></SectionLabel>
      <div>
        <Label htmlFor="wds-flood-start" className="text-xs text-pl-muted">Flood start date</Label>
        <Input id="wds-flood-start" type="date" value={floodStart || ''} onChange={(e) => setFloodStart(e.target.value)} className="h-8 text-xs" data-testid="wds-flood-start" disabled={canWrite === false} />
      </div>
      {!currentProjectId ? (
        <p className="text-xs text-pl-muted" data-testid="wds-send-refusal">Create or open a project first: the receiving app reads the forecast from the saved project.</p>
      ) : !c ? (
        <p className="text-xs text-pl-muted" data-testid="wds-send-refusal">{preview?.reason}</p>
      ) : (
        <>
          <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="wds-send-basis">
            {wfBasisLine(c)}. Np {Math.round(u.show('oilVolume', c.forecast.Np) ?? 0).toLocaleString('en-US')} {u.label('oilVolume')} from {c.forecast.start}.
          </p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${hubRoute}?${query}`)} data-testid="wds-send-hub">
            <GitBranch size={12} /> Open as a case in Forecast Scenario Hub
          </Button>
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${epeRoute}?${query}`)} data-testid="wds-send-epe">
            <Landmark size={12} /> Use in Petroleum Economics Studio
          </Button>
          {/* SIM-U2-007: a starting deck in Reservoir Simulation Studio (five-spot) */}
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${simRoute}?${query}&tab=builder`)} data-testid="wds-send-sim">
            <Cuboid size={12} /> Start a model in Reservoir Simulation Studio
          </Button>
          <p className="text-[10px] text-pl-muted">The project is saved first. The receiving app reads this forecast by its project, keeps where it came from, and tells you if it changes here later. In Petroleum Economics Studio open a case, then Production, Import from Waterflood Design Studio. In Reservoir Simulation Studio open or create a case: the Builder tab offers the pattern as a starting model (a five-spot is sent as its quarter element).</p>
        </>
      )}
    </section>
  );
};

export default WfSendPanel;
