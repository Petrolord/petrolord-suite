// Voidage Replacement Monitor as a sender to Waterflood Design Studio
// (WF-U2-004, RL11): the `vrr-ledger-1` contract
// (src/utils/vrr/vrrLedgerContract.js), read by id by Waterflood's
// Surveillance tab. The project is saved first; the link carries only the
// project id (?vrrProject=), and Waterflood says when the ledger changes here.
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVrrMonitor, projectPayload } from '@/contexts/VrrMonitorContext';
import { buildVrrLedgerContract } from '@/utils/vrr/vrrLedgerContract';

export const WATERFLOOD_ROUTE = '/dashboard/apps/reservoir/waterflood-design-studio';

/** Where the link goes: the Surveillance tab of Waterflood with the project id. */
export const waterfloodLinkFor = (base, projectId) => `${base}?tab=surveillance&vrrProject=${encodeURIComponent(projectId)}`;

export default function VrrSendPanel() {
  const { pathname } = useLocation();
  const base = pathname.startsWith('/dev/') ? '/dev/studio/waterflood' : WATERFLOOD_ROUTE;
  const { currentProjectId, projectName, inputs, manualSave, canWrite } = useVrrMonitor();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (currentProjectId
    ? buildVrrLedgerContract({ projectId: currentProjectId, projectName, payload: projectPayload({ id: currentProjectId, name: projectName, inputs }) })
    : null), [currentProjectId, projectName, inputs]);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (canWrite !== false) await manualSave();
      navigate(waterfloodLinkFor(base, currentProjectId));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-2" data-testid="vrr-send">
      <h3 className="text-[11px] font-semibold text-pl-muted uppercase tracking-widest flex items-center gap-1"><Send size={12} /> Send the ledger</h3>
      {!currentProjectId ? (
        <p className="text-xs text-pl-muted" data-testid="vrr-send-refusal">Create or open a project first: Waterflood Design Studio reads the ledger from the saved project.</p>
      ) : !preview?.ok ? (
        <p className="text-xs text-pl-muted" data-testid="vrr-send-refusal">{preview?.reason}</p>
      ) : (
        <>
          <p className="text-[11px] text-pl-muted" data-testid="vrr-send-basis">
            {preview.contract.months.length} months, {preview.contract.wells.injectors.length} injectors, {preview.contract.wells.producers.length} producers{preview.contract.pressureSurveys.length ? `, ${preview.contract.pressureSurveys.length} pressure surveys` : ''}.
          </p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={go} data-testid="vrr-send-waterflood">
            <Send size={12} /> Send to Waterflood Design Studio
          </Button>
          <p className="text-[10px] text-pl-muted">The project is saved first. Waterflood Design Studio takes the per-well ledger as its surveillance history by this project's id, keeps where it came from, and tells you if it changes here later.</p>
        </>
      )}
    </section>
  );
}
