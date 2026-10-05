// Recovery against spacing points (WS-U2-002): the user's own calibration,
// each point with its kind and source; the app has no built-in curve. The
// spacing and the RF go through the shared unit draft (WsField), so a
// value typed in SI keeps its decimal; the points are stored in oilfield
// units in the form as a JSON string.
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWellSpacing } from '@/contexts/WellSpacingContext';
import { rfPointsOf, rfPointsText, fitRfAgainstSpacing, rfFitText, RF_POINT_KINDS } from '@/utils/wellspacing/rfCalibration';
import WsField from './WsField';

const SELECT = 'h-8 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text';

const RfPointsEditor = () => {
  const { inputs, setFormField, canWrite } = useWellSpacing();
  const points = rfPointsOf(inputs.form);
  const save = (next) => setFormField('rfPoints', rfPointsText(next));
  const set = (i, key, value) => save(points.map((p, j) => (j === i ? { ...p, [key]: value } : p)));
  const fit = fitRfAgainstSpacing(points);
  return (
    <div className="space-y-2" data-testid="ws-rf-points">
      <p className="text-[10px] text-pl-muted">Each point is a recovery factor you know at a spacing, with its source: an analog field, a decline type well at its spacing, or a simulation run. The fit RF = a + b ln(S) runs through them; no curve is built in.</p>
      {points.map((p, i) => (
        <div key={i} className="rounded-md border border-pl-border p-2 space-y-1" data-testid={`ws-rf-point-${i}`}>
          <div className="grid grid-cols-2 gap-2">
            <WsField id={`ws-rfp-spacing-${i}`} label="Spacing" kind="spacing" value={p.spacing} disabled={!canWrite} onChange={(v) => set(i, 'spacing', v)} />
            <WsField id={`ws-rfp-rf-${i}`} label="RF" kind="percent" value={p.rf} disabled={!canWrite} onChange={(v) => set(i, 'rf', v)} />
          </div>
          <select aria-label={`Point ${i + 1} kind`} className={SELECT} value={p.kind || 'analog'} disabled={!canWrite} onChange={(e) => set(i, 'kind', e.target.value)} data-testid={`ws-rfp-kind-${i}`}>
            {RF_POINT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="flex gap-2">
            <Input aria-label={`Point ${i + 1} source`} className="h-8 text-xs" placeholder="Source (required)" value={p.source || ''} disabled={!canWrite} onChange={(e) => set(i, 'source', e.target.value)} data-testid={`ws-rfp-source-${i}`} />
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Remove point ${i + 1}`} disabled={!canWrite} onClick={() => save(points.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="h-8" disabled={!canWrite} onClick={() => save([...points, { spacing: '', rf: '', kind: 'analog', source: '' }])} data-testid="ws-rfp-add">
        <Plus size={14} className="mr-1" /> Add a point
      </Button>
      <p className="text-[10px] text-pl-muted" data-testid="ws-rf-fit">{fit.ok ? rfFitText(fit) : fit.errors[0]}</p>
    </div>
  );
};

export default RfPointsEditor;
