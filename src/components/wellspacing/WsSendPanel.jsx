// Sending a spacing case downstream (WS-U2-004, RL11). The Waterflood pattern
// (src/components/waterflooddesign/WfSendPanel.jsx): what leaves this app is
// the `ws-case-1` contract, read by id from the saved project by the
// receiver. Forecast Scenario Hub takes the case's field oil profile as a
// profile case from the first production date; Petroleum Economics Studio
// takes its calendar-year oil and solution gas as a production file. Both
// keep the contract, print where the numbers came from, and say when the
// source changed since.
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, GitBranch, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useWellSpacing } from '@/contexts/WellSpacingContext';
import { buildWsCaseContract, wsBasisLine } from '@/utils/wellspacing/wsCaseContract';
import { projectPayload } from '@/utils/wellspacing/model';
import { buildLabel } from '@/lib/platformBuild';

export const HUB_ROUTE = '/dashboard/apps/reservoir/forecast-scenario-hub';
export const EPE_ROUTE = '/dashboard/apps/economics/epe/cases';

const WsSendPanel = () => {
  const { pathname } = useLocation();
  const onHarness = pathname.startsWith('/dev/');
  const hubRoute = onHarness ? '/dev/forecast-scenario-hub' : HUB_ROUTE;
  const epeRoute = onHarness ? '/dev/epe/cases/c1' : EPE_ROUTE;
  const {
    inputs, results, u, currentProjectId, projectName, setSenderField, manualSave, canWrite, savingAvailable, savingReason,
  } = useWellSpacing();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const sender = inputs.sender || {};
  // what would be sent, from the state on screen (the receiver reads the saved copy)
  const preview = useMemo(() => {
    if (!currentProjectId) return null;
    return buildWsCaseContract({ projectId: currentProjectId, projectName, payload: projectPayload({ id: currentProjectId, name: projectName, inputs }), build: buildLabel() });
  }, [currentProjectId, projectName, inputs]);
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
  const query = `wsProject=${encodeURIComponent(currentProjectId || '')}`;
  const cases = results?.spacingResults || [];
  return (
    <section className="bg-pl-surface border border-pl-border rounded-xl p-4 shadow-pl-sm space-y-2" data-testid="ws-send">
      <h3 className="text-lg font-bold text-pl-text inline-flex items-center gap-2"><Send size={16} /> Send a case</h3>
      <p className="text-[11px] text-pl-muted">The field profile of one spacing case, every well on its schedule, to Forecast Scenario Hub or Petroleum Economics Studio.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="ws-send-spacing" className="text-xs text-pl-muted">Case ({u.label('spacing')})</Label>
          <select
            id="ws-send-spacing" data-testid="ws-send-spacing" value={sender.spacing || ''} disabled={canWrite === false || !cases.length}
            onChange={(e) => setSenderField('spacing', e.target.value)}
            className="w-full h-8 px-2 border border-pl-border-strong bg-pl-surface rounded-md text-sm text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
          >
            <option value="">Choose a case</option>
            {cases.map((r) => <option key={r.spacing} value={String(r.spacing)}>{u.fmt('spacing', r.spacing, 6)} ({r.numberOfWells} wells)</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ws-send-start" className="text-xs text-pl-muted">First production date</Label>
          <Input id="ws-send-start" type="date" value={sender.start || ''} onChange={(e) => setSenderField('start', e.target.value)} className="h-8 text-xs" data-testid="ws-send-start" disabled={canWrite === false} />
        </div>
      </div>
      {!savingAvailable ? (
        <p className="text-xs text-pl-warning-text" data-testid="ws-send-refusal">{savingReason} The receiving app reads the case from the saved project, so nothing can be sent until saving is on.</p>
      ) : !currentProjectId ? (
        <p className="text-xs text-pl-muted" data-testid="ws-send-refusal">Create or open a project first: the receiving app reads the case from the saved project.</p>
      ) : !c ? (
        <p className="text-xs text-pl-muted" data-testid="ws-send-refusal">{preview?.reason}</p>
      ) : (
        <>
          <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="ws-send-basis">
            {wsBasisLine(c)}. Field Np {u.fmt('volume', c.forecast.Np / 1e6, 5)} {u.label('volume')} from {c.forecast.start}.
          </p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${hubRoute}?${query}`)} data-testid="ws-send-hub">
            <GitBranch size={12} /> Open as a case in Forecast Scenario Hub
          </Button>
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${epeRoute}?${query}`)} data-testid="ws-send-epe">
            <Landmark size={12} /> Use in Petroleum Economics Studio
          </Button>
          <p className="text-[10px] text-pl-muted">The project is saved first. The receiving app reads this case by its project, keeps where it came from, and tells you if it changes here later. In Petroleum Economics Studio open a case, then Production, Import from Well Spacing Optimizer, and enter the drilling capex there.</p>
        </>
      )}
    </section>
  );
};

export default WsSendPanel;
