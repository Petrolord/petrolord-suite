// The rf-1 sender (RF-U2-001): ReservoirCalc Pro reads the estimate by id
// from the saved project, with its method, basis and source. The project is
// saved first, so what ReservoirCalc Pro reads is what is on screen.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { RF_PROJECT_PARAM } from '@/lib/rfEstimateSource';

export const RCP_ROUTE = '/dashboard/apps/geoscience/reservoircalc-pro';

/** The address ReservoirCalc Pro opens with to read the estimate by id. */
export const rcpHrefFor = (projectId, base = RCP_ROUTE) => `${base}?${RF_PROJECT_PARAM}=${encodeURIComponent(projectId)}`;

const SendToRcpPanel = ({ rcpBase = RCP_ROUTE }) => {
  const { currentProjectId, canWrite, manualSave, result } = useRfEstimator();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setMessage('');
    if (!currentProjectId) { setMessage('Save the estimate as a project first: ReservoirCalc Pro reads it by id from the saved project.'); return; }
    if (canWrite) {
      setBusy(true);
      const ok = await manualSave();
      setBusy(false);
      if (!ok) { setMessage('The project could not be saved, so ReservoirCalc Pro would read an older estimate. Try again.'); return; }
    }
    navigate(rcpHrefFor(currentProjectId, rcpBase));
  };
  return (
    <div className="space-y-1" data-testid="rf-send-rcp">
      <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={send} disabled={busy || !Number.isFinite(result.rf)} data-testid="rf-send-rcp-button">
        <Send className="w-3.5 h-3.5 mr-1" /> Send to ReservoirCalc Pro
      </Button>
      <p className="text-[10px] text-pl-muted leading-tight">
        ReservoirCalc Pro reads this estimate by id with its method and basis, and keeps its own recovery factor until you take this one there.
      </p>
      {message && <p className="text-[11px] text-pl-warning-text" data-testid="rf-send-rcp-message">{message}</p>}
    </div>
  );
};

export default SendToRcpPanel;
