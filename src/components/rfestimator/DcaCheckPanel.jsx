// Decline EUR over the in-place volume, a cross-check beside the estimate
// (RF-U2-014). Forecasts are read by id from saved Decline Curve Analysis
// projects as dca-forecast-1 contracts; the panel reads them again and says
// when a source changed since it was taken.
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { listDcaForecasts, getDcaForecast } from '@/utils/declineCurve/dcaForecastService';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { dcaCheckFrom, dcaImpliedRf } from '@/utils/rfestimator/dcaCrossCheck';

const DcaCheckPanel = () => {
  const { inputs, derived, result, dcaCheck, setDcaCheck, canWrite, addNotification } = useRfEstimator();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState({});
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState([]);
  const stream = inputs.phase === 'gas' ? 'gas' : 'oil';
  const implied = useMemo(() => dcaImpliedRf(dcaCheck, { inPlace: derived.inPlace, phase: inputs.phase, rf: result.rf }), [dcaCheck, derived.inPlace, inputs.phase, result.rf]);

  useEffect(() => {
    if (!open || list) return undefined;
    let alive = true;
    listDcaForecasts(supabase).then((rows) => { if (alive) setList(rows.filter((r) => r.stream === stream)); }, (e) => { if (alive) { setList([]); setMessage(e.message); } });
    return () => { alive = false; };
  }, [open, list, stream]);

  // "source changed since": read every taken forecast again by id
  useEffect(() => {
    let alive = true;
    setChanged([]);
    if (!dcaCheck?.items?.length) return undefined;
    (async () => {
      const out = [];
      for (const it of dcaCheck.items) {
        const now = await getDcaForecast(supabase, { projectId: it.projectId, wellId: it.wellId, stream: it.stream }).catch(() => null);
        if (!now) out.push(`${it.wellName}: the source forecast is no longer readable.`);
        else if (!now.ok) out.push(`${it.wellName}: the source cannot send this forecast now (${now.reason}).`);
        else if (now.contract.fingerprint !== it.fingerprint) out.push(`${it.wellName}: the forecast changed after it was taken. Take it again to use it.`);
      }
      if (alive) setChanged(out);
    })();
    return () => { alive = false; };
  }, [dcaCheck]);

  const take = () => {
    const contracts = (list || []).filter((r) => r.ok && picked[`${r.projectId}|${r.wellId}`]).map((r) => r.contract);
    const got = dcaCheckFrom(contracts, { phase: inputs.phase });
    if (!got.ok) { setMessage(got.errors.join(' ')); return; }
    setDcaCheck(got.check);
    setOpen(false);
    addNotification?.(`Decline forecasts taken: ${got.check.items.length} well${got.check.items.length === 1 ? '' : 's'}.`, 'success');
  };

  return (
    <div className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-dca-check">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">Cross-check: decline EUR over {inputs.phase === 'gas' ? 'OGIP' : 'OOIP'}</span>
        {canWrite && <button type="button" className="text-[11px] underline text-pl-primary-text" onClick={() => setOpen((v) => !v)} data-testid="rf-dca-open">{open ? 'Close' : 'Take forecasts'}</button>}
      </div>
      {implied && (
        <div className="text-[11px] space-y-1" data-testid="rf-dca-implied">
          <p className="text-pl-text">{implied.text}</p>
          {implied.vsEstimate && <p className="text-pl-muted">{implied.vsEstimate}</p>}
          <p className="text-pl-muted">Wells: {dcaCheck.items.map((i) => i.wellName).join(', ')}.</p>
          {changed.map((c) => <p key={c} className="text-pl-warning-text" data-testid="rf-dca-changed">{c}</p>)}
          {canWrite && <button type="button" className="underline text-pl-muted" onClick={() => setDcaCheck(null)}>Forget the forecasts</button>}
        </div>
      )}
      {!implied && !open && <p className="text-[10px] text-pl-muted">Take the {stream} forecasts of the wells of this reservoir from Decline Curve Analysis to print their EUR over the in-place volume beside the estimate.</p>}
      {open && (
        <div className="space-y-1" data-testid="rf-dca-picker">
          {list == null && <p className="text-[11px] text-pl-muted">Reading your Decline Curve Analysis projects.</p>}
          {list && !list.length && <p className="text-[11px] text-pl-muted">No {stream} forecast is readable from this account.</p>}
          {(list || []).map((r) => {
            const key = `${r.projectId}|${r.wellId}`;
            return (
              <label key={key} className="flex items-start gap-2 text-[11px] text-pl-text">
                <input type="checkbox" disabled={!r.ok} checked={!!picked[key]} onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.checked }))} />
                <span>{r.wellName} ({r.projectName}){r.ok ? '' : `: ${r.reason}`}</span>
              </label>
            );
          })}
          <Button size="sm" variant="outline" className="h-8" onClick={take} data-testid="rf-dca-take">Take the EUR</Button>
          {message && <p className="text-[11px] text-pl-danger-text">{message}</p>}
        </div>
      )}
    </div>
  );
};

export default DcaCheckPanel;
