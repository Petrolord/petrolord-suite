// The line under "Prognosis from" (2026-10-14): whether this design keeps a
// record of the prognosis the mud window shows, with the button that records
// it (services/ppfgSource). A changed or deleted record points at the
// "Prognosis changed" notice above the views.
import React from 'react';
import { reviewedText } from '../services/ppfgSource';

/**
 * @param {{reference: ?object, status: ?string, canEdit: boolean, ready: boolean, recording?: boolean,
 *   onRecord: function(): void, unit?: 'ft'|'m'}} props
 */
export default function PpfgReviewStatus({ reference, status, canEdit, ready, recording = false, onRecord, unit = 'ft' }) {
  return (
    <div className="border-b border-slate-200 px-3 py-1 text-[10px] text-slate-600" data-testid="wd-ppfg-review">
      {!reference ? (
        <span className="flex items-center gap-2">
          <span>Not recorded with this design yet, so a republish would go unnoticed.</span>
          {canEdit && (
            <button type="button" data-testid="wd-ppfg-record" onClick={onRecord} disabled={recording || !ready}
              className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              {recording ? 'Recording…' : 'Review against this prognosis'}
            </button>
          )}
        </span>
      ) : status === 'changed' || status === 'deleted' ? (
        <span className="text-amber-700" data-testid="wd-ppfg-reviewed-stale">Reviewed against an earlier publish: see Prognosis changed above the views.</span>
      ) : (
        <span data-testid="wd-ppfg-reviewed">{reviewedText(reference, { unit })}</span>
      )}
    </div>
  );
}
