// The shared "Source changed" notice (see model.js). Mounted beside the
// inputs an app pulled from a registry: one entry per changed or deleted
// source, with "Refresh from source" (the app's own pull, run again) and
// "Keep current values" (recorded for that version of the source). Also
// the small mark a results panel shows while a source needs attention.
import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Check, Loader2 } from 'lucide-react';
import { noticeText, whenText } from './model.js';

/**
 * @param {{items: object[], checking?: boolean, checkedAt?: ?string, error?: ?string,
 *   onCheck?: ?function(): void, onRefresh?: ?function(object): Promise<void>, onKeep?: ?function(object): void,
 *   canEdit?: boolean, readOnlyText?: string, title?: string, testId?: string, compact?: boolean, usedBy?: string}} props
 *   `usedBy` names what used the source in the sentences ("this project", "this site")
 *   An item may carry `effect`: one sentence on what a refresh would change (shown under the detail)
 */
export default function SourceChangedNotice({
  items, checking = false, checkedAt = null, error = null, onCheck = null, onRefresh = null, onKeep = null,
  canEdit = true, readOnlyText = 'Only the owner of this record can refresh it or keep its values.',
  title = 'Source changed', testId = 'source-changed', compact = false, usedBy = 'this project',
}) {
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState({});
  const list = items || [];
  if (!list.length && !error && !onCheck) return null;

  const refresh = async (item) => {
    if (!onRefresh) return;
    setBusy(item.key);
    setFailed((f) => ({ ...f, [item.key]: null }));
    try { await onRefresh(item); } catch (e) { setFailed((f) => ({ ...f, [item.key]: e?.message || 'The refresh failed.' })); } finally { setBusy(null); }
  };

  if (!list.length) {
    // nothing to report: a quiet line with the on-demand check
    return (
      <div className="flex items-center justify-between gap-2 text-[10px] text-pl-muted flex-shrink-0" data-testid={`${testId}-clear`}>
        <span>
          {error ? `The registry could not be read, so a change at the source cannot be checked (${error}).`
            : checking ? 'Checking the registry sources of this project.'
              : checkedAt ? `Registry sources checked ${whenText(checkedAt)}: no change since they were used.` : 'Registry sources not checked yet.'}
        </span>
        {onCheck && (
          <button type="button" onClick={onCheck} disabled={checking} className="inline-flex items-center gap-1 rounded border border-pl-border px-1.5 py-0.5 text-pl-text hover:bg-pl-sunken disabled:opacity-50" data-testid={`${testId}-check`}>
            {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Check sources
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="status" className={`rounded-md border border-pl-warning/40 bg-pl-warning-bg ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'} text-pl-warning-text space-y-2 flex-shrink-0`} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {title} ({list.length})</span>
        {onCheck && (
          <button type="button" onClick={onCheck} disabled={checking} className="inline-flex items-center gap-1 rounded border border-pl-warning/40 px-1.5 py-0.5 text-[10px] hover:bg-pl-surface disabled:opacity-50" data-testid={`${testId}-check`}>
            {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Check again
          </button>
        )}
      </div>
      {list.map((item) => {
        const t = noticeText(item, { usedBy });
        return (
          <div key={item.key} className="space-y-1 border-t border-pl-warning/30 pt-1.5 first-of-type:border-0" data-testid={`${testId}-item`} data-key={item.key} data-status={item.status}>
            <p className="font-medium text-pl-text">{t.headline}</p>
            {t.detail && <p className="text-pl-muted">{t.detail}</p>}
            {item.effect && <p className="font-medium text-pl-text" data-testid={`${testId}-effect`}>{item.effect}</p>}
            {failed[item.key] && <p className="text-pl-danger-text">{failed[item.key]}</p>}
            {canEdit ? (
              <div className="flex flex-wrap gap-1.5">
                {item.status === 'changed' && onRefresh && (
                  <button type="button" onClick={() => refresh(item)} disabled={busy != null} className="inline-flex items-center gap-1 rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-[11px] text-pl-text hover:bg-pl-sunken disabled:opacity-50" data-testid={`${testId}-refresh`}>
                    {busy === item.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh from source
                  </button>
                )}
                {onKeep && (
                  <button type="button" onClick={() => onKeep(item)} disabled={busy != null} className="inline-flex items-center gap-1 rounded border border-pl-border px-2 py-0.5 text-[11px] text-pl-text hover:bg-pl-surface disabled:opacity-50" data-testid={`${testId}-keep`}>
                    <Check className="w-3 h-3" /> Keep current values
                  </button>
                )}
              </div>
            ) : <p className="text-pl-muted">{readOnlyText}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** The mark on results computed from a changed source; renders nothing when there is none. */
export function StaleResultsMark({ text, testId = 'source-stale-results' }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-xs text-pl-warning-text" data-testid={testId}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span><strong>Source changed.</strong> {text}</span>
    </div>
  );
}
