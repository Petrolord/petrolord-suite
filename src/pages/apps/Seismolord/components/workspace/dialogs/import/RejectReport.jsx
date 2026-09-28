// Which lines and columns of an imported file could not be read. The
// readers keep going past bad rows; this lists them (first PREVIEW_ROWS)
// with the total, so the user can fix the file or accept the import.

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

export const PREVIEW_ROWS = 25;

/**
 * @param {Object} p
 * @param {Array<{line: number, reason: string, column?: number,
 *   field?: string, text?: string}>} p.rejects stored rejects
 * @param {number} p.count total rejects (may exceed rejects.length)
 * @param {number} [p.read] rows that did read, for the summary
 */
export default function RejectReport({ rejects, count, read }) {
  const [open, setOpen] = useState(true);
  if (!count) return null;
  const shown = rejects.slice(0, PREVIEW_ROWS);
  return (
    <div
      className="rounded-lg border border-pl-warning/50 bg-pl-warning-bg text-sm"
      data-testid="sl-import-rejects"
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-pl-warning-text"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span data-testid="sl-import-rejects-summary">
          {`${count.toLocaleString()} line${count === 1 ? '' : 's'} could not be read`}
          {read != null ? ` (${read.toLocaleString()} read). ` : '. '}
          The rest of the file imports; fix these lines and import again to include them.
        </span>
      </button>
      {open && (
        <div className="max-h-48 overflow-auto border-t border-pl-warning/40">
          <table className="w-full text-xs">
            <thead className="text-pl-muted sticky top-0 bg-pl-surface">
              <tr>
                <th className="text-left font-medium px-2 py-1">Line</th>
                <th className="text-left font-medium px-2 py-1">Column</th>
                <th className="text-left font-medium px-2 py-1">Problem</th>
                <th className="text-left font-medium px-2 py-1">Text</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.line}-${r.column ?? ''}`} className="border-t border-pl-border/60 text-pl-text">
                  <td className="px-2 py-1 tabular-nums">{r.line}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {r.column != null ? `${r.column}${r.field ? ` (${r.field})` : ''}` : (r.field || '')}
                  </td>
                  <td className="px-2 py-1">{r.reason}</td>
                  <td className="px-2 py-1 font-mono text-pl-muted truncate max-w-[16rem]" title={r.text}>
                    {r.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > shown.length && (
            <p className="px-2 py-1 text-xs text-pl-muted">
              {`Showing the first ${shown.length} of ${count.toLocaleString()}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
