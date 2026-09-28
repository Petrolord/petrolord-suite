import React from 'react';
import { AlertTriangle, Clock, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlySourceMessage } from '../sources/sliceSource';
import { describeConversion } from '../sources/conversionProgress';

/**
 * What a viewer window shows in place of a slice it cannot draw: a clear
 * message with Retry for a failure (out of memory included), the "time
 * slices after conversion" note with the conversion progress for a local
 * file, or the header-reading progress while a local file opens. Never an
 * endless spinner.
 *
 * @param {Object} p
 * @param {'error'|'time-unavailable'|'indexing'} p.kind
 * @param {Error} [p.error] for kind 'error'
 * @param {number} [p.budgetBytes] the viewer's memory budget (named in the OOM message)
 * @param {string} [p.what] what failed to load ('this slice', 'the time slice')
 * @param {?{phase: string, done: number, total: ?number}} [p.conversion]
 * @param {?{done: number, total: number}} [p.indexing]
 * @param {() => void} [p.onRetry]
 * @param {boolean} [p.overlay] absolutely positioned over the window
 */
export default function SliceSourceNotice({
  kind, error, budgetBytes, what, conversion, indexing, onRetry, overlay = true,
}) {
  const wrap = overlay
    ? 'absolute inset-0 z-20 flex items-center justify-center bg-pl-bg/80 p-4'
    : 'flex items-center justify-center p-4';
  if (kind === 'error') {
    return (
      <div className={wrap}>
        <div role="alert" className="max-w-md rounded-md border border-pl-danger/40 bg-pl-raised shadow-pl-md p-4 text-sm text-pl-text">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-pl-danger-text" />
            <p>{friendlySourceMessage(error, { budgetBytes, what })}</p>
          </div>
          {onRetry && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (kind === 'time-unavailable') {
    const conv = describeConversion(conversion);
    const pct = conversion?.total ? Math.floor((conversion.done / conversion.total) * 100) : null;
    return (
      <div className={wrap}>
        <div role="status" className="max-w-md rounded-md border border-pl-border bg-pl-raised shadow-pl-md p-4 text-sm text-pl-text">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 shrink-0 text-pl-info-text" />
            <p>
              Time slices are available after conversion, because each one needs the whole file.
              Inlines and crosslines are shown straight from the file you picked.
            </p>
          </div>
          <p className="mt-2 text-xs text-pl-muted" data-testid="conversion-progress">
            {conv || 'Conversion has not started. Start the import to convert this survey.'}
          </p>
          {pct != null && (
            <div className="mt-1 h-1.5 w-full rounded bg-pl-sunken">
              <div className="h-1.5 rounded bg-pl-info" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }
  // indexing
  return (
    <div className={wrap}>
      <div role="status" className="flex items-center gap-2 text-sm text-pl-text">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>
          Reading trace headers
          {indexing?.total ? `: ${indexing.done.toLocaleString('en-US')} of ${indexing.total.toLocaleString('en-US')}` : ''}
        </span>
      </div>
    </div>
  );
}
