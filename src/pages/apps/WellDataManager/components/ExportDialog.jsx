// Export one well's data as files (AppUpgrade WDM-U2-002): LAS 2.0 with
// the curves the user ticks, a tops CSV and a survey CSV, all with depths
// in the display unit. The file builders are pure (engine/wellExport.js);
// this dialog only picks, downloads curve samples and hands the text to
// the browser. Curves that cannot share the LAS depth column are listed
// with the reason, never dropped silently.

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/fullPrecision';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import {
  buildWellLas, topsCsv, surveyCsv, lasExportPlan, exportSummary,
} from '../engine/wellExport';
import { unitText } from '../engine/displayUnits';

/** Formats offered, in menu order. `extra` formats (the PDF sheet) come from the caller. */
const BASE_FORMATS = [
  ['las', 'LAS 2.0 (logs)'],
  ['tops', 'Tops CSV'],
  ['survey', 'Survey CSV (with TVD and offsets)'],
];

/**
 * @param {Object} p
 * @param {Object} p.well @param {?Object[]} p.logs @param {?Object[]} p.tops
 * @param {Object[]} [p.units] strat units for the tops Unit column
 * @param {'m'|'ft'} p.unit display depth unit
 * @param {Array<[string, string, Function]>} [p.extraFormats] [key, label, run(ctx)] rows
 */
export default function ExportDialog({ open, onOpenChange, backend, well, logs, tops, units = [], unit = 'm', onStatus, extraFormats = [] }) {
  const u = unitText(unit);
  const [format, setFormat] = useState('las');
  const [picked, setPicked] = useState(null); // log ids ticked for the LAS (null = all)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const plan = useMemo(() => lasExportPlan(logs || []), [logs]);
  const formats = [...BASE_FORMATS, ...extraFormats.map(([k, l]) => [k, l])];

  useEffect(() => { if (open) { setPicked(null); setError(null); setBusy(false); } }, [open, well?.id]);

  const ticked = (id) => (picked ? picked.includes(id) : true);
  const toggle = (id) => setPicked((p) => {
    const cur = p || plan.exportable.map((l) => l.id);
    return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  });

  const disabledReason = format === 'las' && !plan.depth ? 'This well has no depth curve.'
    : format === 'las' && !plan.exportable.length ? 'This well has no curves besides depth.'
      : format === 'tops' && !(tops || []).length ? 'This well has no tops.'
        : format === 'survey' && !(well?.deviation || []).length ? 'This well has no deviation survey (it is treated as vertical).'
          : null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      let message;
      if (format === 'las') {
        const ids = [plan.depth.id, ...plan.exportable.filter((l) => ticked(l.id)).map((l) => l.id)];
        const data = new Map();
        for (const l of (logs || []).filter((x) => ids.includes(x.id))) data.set(l.id, await backend.downloadCurve(l));
        const out = buildWellLas({ well, logs, data, selectedIds: ids, unit: u, build: PLATFORM_BUILD.sha });
        downloadText(out.fileName, out.text, 'text/plain');
        message = exportSummary('las', { ...out, unit: u });
      } else if (format === 'tops') {
        const out = topsCsv(well, tops, u, units);
        downloadText(out.fileName, out.text, 'text/csv');
        message = exportSummary('tops', { rows: tops.length, unit: u });
      } else if (format === 'survey') {
        const out = surveyCsv(well, u);
        downloadText(out.fileName, out.text, 'text/csv');
        message = exportSummary('survey', { rows: well.deviation.length, unit: u });
      } else {
        const extra = extraFormats.find(([k]) => k === format);
        message = await extra[2]({ well, logs, tops, unit: u });
      }
      onStatus?.(message);
      onOpenChange(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="wdm-export-dialog">
        <DialogHeader>
          <DialogTitle>Export {well?.name}</DialogTitle>
          <DialogDescription>
            Depths in {u === 'ft' ? 'feet' : 'metres'} (the display unit). Curve values keep the units they are stored in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Export format">
            {formats.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-pl-text">
                <input type="radio" name="wdm-export-format" checked={format === k} onChange={() => setFormat(k)} data-testid={`wdm-export-format-${k}`} />
                {label}
              </label>
            ))}
          </div>
          {format === 'las' && plan.depth && (
            <div className="max-h-56 overflow-auto rounded border border-pl-border p-2" data-testid="wdm-export-curves">
              <div className="text-pl-muted mb-1">Depth: {plan.depth.mnemonic} (always written, as DEPT in {u})</div>
              {plan.exportable.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-pl-text">
                  <input type="checkbox" checked={ticked(l.id)} onChange={() => toggle(l.id)} data-testid={`wdm-export-curve-${l.mnemonic}`} />
                  {l.mnemonic} <span className="text-pl-muted">{l.unit || ''}</span>
                </label>
              ))}
              {plan.skipped.length > 0 && (
                <div className="mt-1 text-pl-warning-text" data-testid="wdm-export-skipped">
                  Not included: {plan.skipped.map((s) => `${s.mnemonic} (${s.reason})`).join('; ')}.
                </div>
              )}
            </div>
          )}
          {disabledReason && <div className="text-pl-muted" data-testid="wdm-export-reason">{disabledReason}</div>}
          {error && <div className="text-pl-danger-text" data-testid="wdm-export-error">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={busy || !!disabledReason} onClick={run} data-testid="wdm-export-download">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
