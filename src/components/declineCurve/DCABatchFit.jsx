// DCA U2-005: batch fit across wells. One window rule, every well fitted and
// forecast through the single-well path, and a review grid: open a well from
// its row to check its fit. Each well keeps its own model choice, b limits,
// exclusions and forecast settings.
import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Layers } from 'lucide-react';
import DcaNumberField from '@/components/declineCurve/DcaNumberField';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export default function DCABatchFit() {
  const { runBatchFit, batchRows, selectedStream, setCurrentWellId, wells, canWrite } = useDeclineCurve();
  const u = useDcaUnits();
  const [rule, setRule] = useState('whole');
  const [months, setMonths] = useState(24);
  const stream = batchRows?.stream || selectedStream;
  return (
    <div className="space-y-2" data-testid="dca-batch">
      <Label className="text-xs text-pl-muted uppercase flex items-center gap-1"><Layers size={12} aria-hidden="true" /> Batch fit ({selectedStream})</Label>
      <p className="text-[10px] text-pl-muted">Fits and forecasts every well of the project on one window rule. Each well keeps its own model choice, b limits, exclusions and forecast settings; only its fit window is set here.</p>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="dca-batch-rule" className="text-[10px] text-pl-muted">Window</label>
          <select id="dca-batch-rule" value={rule} onChange={(e) => setRule(e.target.value)} data-testid="dca-batch-rule"
            className="h-8 rounded border border-pl-border bg-pl-surface text-pl-text text-xs">
            <option value="whole">Whole history</option>
            <option value="last">Last N months</option>
          </select>
        </div>
        {rule === 'last' && (
          <DcaNumberField id="dca-batch-months" label="N" unit="months" value={months} integer emptyValue={24}
            onCommit={(v) => setMonths(Number.isFinite(v) && v > 0 ? v : 24)} testId="dca-batch-months" className="w-24" labelClassName="text-[10px]" />
        )}
        <Button size="sm" className="h-8 text-xs" onClick={() => runBatchFit({ stream: selectedStream, rule, months })}
          disabled={!Object.keys(wells || {}).length || canWrite === false} data-testid="dca-batch-run">
          Fit all wells
        </Button>
      </div>
      {batchRows && (
        <div className="overflow-x-auto rounded border border-pl-border bg-pl-surface" data-testid="dca-batch-grid">
          <table className="w-full text-[11px]">
            <thead className="text-pl-muted text-left">
              <tr>
                <th className="px-2 py-1">Well</th><th className="px-2 py-1">Window</th><th className="px-2 py-1">Model</th>
                <th className="px-2 py-1 text-right">qi ({u.rateLabel(stream)})</th><th className="px-2 py-1 text-right">Di (%/yr nominal)</th>
                <th className="px-2 py-1 text-right">b</th><th className="px-2 py-1 text-right">R²</th><th className="px-2 py-1 text-right">Points</th>
                <th className="px-2 py-1 text-right">EUR ({u.volumeLabel(stream)})</th><th className="px-2 py-1">Review</th>
              </tr>
            </thead>
            <tbody>
              {batchRows.rows.map((r) => (
                <tr key={r.wellId} className="border-t border-pl-border">
                  <td className="px-2 py-1"><button type="button" className="underline text-pl-primary-text" onClick={() => setCurrentWellId(r.wellId)}>{r.wellName}</button></td>
                  <td className="px-2 py-1 font-pl-mono">{r.window ? `${r.window.startDate} to ${r.window.endDate}` : EMPTY_VALUE}</td>
                  {r.ok ? (
                    <>
                      <td className="px-2 py-1">{r.model}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{u.rateTo(stream, r.qi).toFixed(1)}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{finite(r.diPctYr) ? r.diPctYr.toFixed(2) : EMPTY_VALUE}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{Number(r.b.toPrecision(3))}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{r.R2.toFixed(3)}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{r.points}</td>
                      <td className="px-2 py-1 text-right font-pl-mono">{finite(r.eur) ? Math.round(u.volumeTo(stream, r.eur)).toLocaleString() : EMPTY_VALUE}</td>
                      <td className={`px-2 py-1 ${r.flags.length ? 'text-pl-warning-text' : 'text-pl-muted'}`}>{r.flags.length ? r.flags.join('; ') : 'none'}</td>
                    </>
                  ) : (
                    <td className="px-2 py-1 text-pl-warning-text" colSpan={8}>Not fitted: {r.reason}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
