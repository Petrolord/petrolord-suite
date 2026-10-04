// Voidage Replacement Monitor as a sender (WF-U2-004, VRR-U2-001, RL11): the
// `vrr-1` contract (src/utils/vrr/vrrLedgerContract.js), one contract for the
// ledger and the pressure rows, read by id. Waterflood Design Studio's
// Surveillance tab takes the ledger (the link carries only the project id,
// ?vrrProject=, and Waterflood says when the ledger changes here); Material
// Balance Studio takes the pressure rows from its Data tab. The project is
// saved first.
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVrrMonitor, projectPayload } from '@/contexts/VrrMonitorContext';
import { buildVrrContract } from '@/utils/vrr/vrrLedgerContract';

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
    ? buildVrrContract({ projectId: currentProjectId, projectName, payload: projectPayload({ id: currentProjectId, name: projectName, inputs }) })
    : null), [currentProjectId, projectName, inputs]);
  const c = preview?.ok ? preview.contract : null;
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
        <p className="text-xs text-pl-muted" data-testid="vrr-send-refusal">Create or open a project first: the receiving apps read the saved project by its id.</p>
      ) : !c ? (
        <p className="text-xs text-pl-muted" data-testid="vrr-send-refusal">{preview?.reason}</p>
      ) : (
        <>
          <p className="text-[11px] text-pl-muted" data-testid="vrr-send-contract">
            Contract {c.schema} (version {c.version}): {c.hasLedger ? `${c.months.length} months, ${c.wells.injectors.length} injectors, ${c.wells.producers.length} producers` : 'no per-well ledger'}, {c.pressureRows.length} pressure row{c.pressureRows.length === 1 ? '' : 's'} (psia, {c.datum.depth_ft != null ? `datum ${c.datum.reference || 'stated'} stated, not corrected` : 'no datum stated'}).
          </p>
          {c.hasLedger ? (
            <>
              <p className="text-[11px] text-pl-muted" data-testid="vrr-send-basis">
                {c.months.length} months, {c.wells.injectors.length} injectors, {c.wells.producers.length} producers{c.pressureSurveys.length ? `, ${c.pressureSurveys.length} pressure surveys` : ''}.
              </p>
              <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={go} data-testid="vrr-send-waterflood">
                <Send size={12} /> Send to Waterflood Design Studio
              </Button>
              <p className="text-[10px] text-pl-muted">The project is saved first. Waterflood Design Studio takes the per-well ledger as its surveillance history by this project's id, keeps where it came from, and tells you if it changes here later.</p>
            </>
          ) : (
            <p className="text-xs text-pl-muted" data-testid="vrr-send-refusal">{c.ledgerRefusal}</p>
          )}
          <p className="text-[10px] text-pl-muted" data-testid="vrr-send-mbal">
            {c.pressureRows.length
              ? 'Material Balance Studio takes these pressure rows onto the dated rows of a case from its Data tab ("Pressures from Voidage Replacement Monitor"), by this project\'s id.'
              : 'No dated pressure survey: Material Balance Studio has no pressure row to take from this project.'}
          </p>
        </>
      )}
    </section>
  );
}
