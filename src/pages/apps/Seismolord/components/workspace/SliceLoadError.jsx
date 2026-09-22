// Section window load failure (stability, 2026-09-22): brick requests
// now time out instead of spinning forever, so a failed slice lands
// here with the reason and a Retry, instead of an endless spinner.

import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * @param {Object} p
 * @param {?string} p.error
 * @param {() => void} p.onRetry
 */
export default function SliceLoadError({ error, onRetry }) {
  if (!error) return null;
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 max-w-sm
        rounded-lg border border-red-900/70 bg-slate-950/95 p-3 text-xs text-slate-300 shadow-lg"
      role="alert"
      data-testid="sl-slice-error"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
        <div className="min-w-0">
          <div className="font-medium text-red-300">The slice did not load</div>
          <div className="mt-0.5 break-words">{error}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        data-testid="sl-slice-retry"
        className="mt-2 inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1
          text-slate-200 hover:bg-slate-800"
      >
        <RotateCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}
