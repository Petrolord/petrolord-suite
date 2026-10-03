// Sending a forecast downstream (DCA-U1-008, owner question 10, RL11).
//
// What leaves this app is the `dca-forecast-1` contract, read by id from the
// saved project by the receiver: Forecast Scenario Hub takes it as a case
// that starts at the data cut-off; Petroleum Economics Studio takes its
// calendar-year volumes as a production file. Both keep the contract, print
// where the numbers came from, and say when the source changed since.
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, GitBranch, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { buildDcaForecastContract, dcaBasisLine } from '@/utils/declineCurve/dcaForecastContract';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { buildLabel } from '@/lib/platformBuild';

export const HUB_ROUTE = '/dashboard/apps/reservoir/forecast-scenario-hub';
export const EPE_ROUTE = '/dashboard/apps/economics/epe/cases';

const DCASendPanel = ({ hubRoute: hubProp = null, epeRoute: epeProp = null }) => {
  // on a /dev harness the receivers are their harnesses (no sign-in there)
  const { pathname } = useLocation();
  const onHarness = pathname.startsWith('/dev/');
  const hubRoute = hubProp || (onHarness ? '/dev/forecast-scenario-hub' : HUB_ROUTE);
  const epeRoute = epeProp || (onHarness ? '/dev/epe/cases/c1' : EPE_ROUTE);
  const { currentProjectId, currentProject, currentWell, currentWellId, selectedStream, wells, manualSave, canWrite, status } = useDeclineCurve();
  const u = useDcaUnits();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // what would be sent, from the state on screen (the receiver reads the saved copy)
  const preview = useMemo(() => {
    if (!currentProjectId || !currentWellId) return null;
    return buildDcaForecastContract({
      projectId: currentProjectId, projectName: currentProject?.name, payload: { payloadVersion: 2, wells }, wellId: currentWellId, stream: selectedStream, build: buildLabel(),
    });
  }, [currentProjectId, currentProject, wells, currentWellId, selectedStream, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentWell) return null;
  const query = `dcaProject=${encodeURIComponent(currentProjectId || '')}&dcaWell=${encodeURIComponent(currentWellId || '')}&dcaStream=${selectedStream}`;
  const go = async (to) => {
    if (busy) return;
    setBusy(true);
    try {
      // the receiver reads the saved project: save first (an owner or the holder of the check-out)
      if (canWrite !== false) await manualSave();
      navigate(to);
    } finally {
      setBusy(false);
    }
  };
  const c = preview?.ok ? preview.contract : null;
  const vol = (v) => Math.round(u.volumeTo(selectedStream, v) || 0).toLocaleString();

  return (
    <section className="space-y-2" data-testid="dca-send">
      <h3 className="text-[11px] font-semibold text-pl-muted uppercase tracking-widest flex items-center gap-1"><Send size={12} /> Send this forecast</h3>
      {!c ? (
        <p className="text-xs text-pl-muted" data-testid="dca-send-refusal">{preview?.reason || 'Fit and forecast this stream, then it can be sent.'}</p>
      ) : (
        <>
          <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="dca-send-basis">
            {currentWell.name}, {selectedStream}: {dcaBasisLine(c)}. Remaining {vol(c.forecast.remaining)} {u.volumeLabel(selectedStream)}, EUR {vol(c.forecast.eur)} {u.volumeLabel(selectedStream)}.
          </p>
          {selectedStream === 'oil' ? (
            <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${hubRoute}?${query}`)} data-testid="dca-send-hub">
              <GitBranch size={12} /> Open as a case in Forecast Scenario Hub
            </Button>
          ) : (
            <p className="text-[11px] text-pl-muted">Forecast Scenario Hub holds oil cases; send a {selectedStream} forecast to Petroleum Economics Studio.</p>
          )}
          <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={() => go(`${epeRoute}?${query}`)} data-testid="dca-send-epe">
            <Landmark size={12} /> Use in Petroleum Economics Studio
          </Button>
          <p className="text-[10px] text-pl-muted">The project is saved first. The receiving app reads this forecast by its project, well and stream, keeps where it came from, and tells you if it changes here later. In Petroleum Economics Studio open a case, then Production, Import from Decline Curve Analysis.</p>
        </>
      )}
    </section>
  );
};

export default DCASendPanel;
