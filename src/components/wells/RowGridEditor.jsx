// Small editable grid for well child data (deviation stations, checkshot
// rows, tops) used by the Well Data Manager edit modes (PT1, 2026-09-03).
// Presentation only: the parent owns the rows and validates on save.
// Test ids: `${prefix}-cell-${row}-${key}`, `${prefix}-add`, `${prefix}-del-${row}`.

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

const cellCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs w-24';

/**
 * @param {Object} p
 * @param {Array<{key: string, label: string, type?: 'number'|'text', readOnly?: boolean, width?: number}>} p.columns
 * @param {Array<Object>} p.rows  plain objects keyed by column key (strings while editing)
 * @param {(rows: Array<Object>) => void} p.onChange
 * @param {string} p.testIdPrefix
 * @param {boolean} [p.canAddRemove=true]
 */
export default function RowGridEditor({ columns, rows, onChange, testIdPrefix, canAddRemove = true }) {
  const setCell = (ri, key, value) => onChange(rows.map((r, i) => (i === ri ? { ...r, [key]: value } : r)));
  const addRow = () => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))]);
  const delRow = (ri) => onChange(rows.filter((_, i) => i !== ri));
  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-grid`}>
      <table className="text-xs">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className="text-left font-medium text-slate-500 pr-3 pb-1">{c.label}</th>)}
            {canAddRemove && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            // rows are positional while editing; index keys are correct here
             
            <tr key={ri}>
              {columns.map((c) => (
                <td key={c.key} className="pr-3 py-0.5">
                  {c.readOnly ? (
                    <span className="text-slate-500 font-mono" data-testid={`${testIdPrefix}-cell-${ri}-${c.key}`}>{r[c.key] ?? '—'}</span>
                  ) : (
                    <input
                      className={cellCls}
                      style={c.width ? { width: c.width } : undefined}
                      value={r[c.key] ?? ''}
                      inputMode={c.type === 'number' ? 'decimal' : undefined}
                      onChange={(e) => setCell(ri, c.key, e.target.value)}
                      data-testid={`${testIdPrefix}-cell-${ri}-${c.key}`}
                    />
                  )}
                </td>
              ))}
              {canAddRemove && (
                <td>
                  <button type="button" className="text-slate-500 hover:text-red-400" title="Remove row"
                    onClick={() => delRow(ri)} data-testid={`${testIdPrefix}-del-${ri}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canAddRemove && (
        <button type="button" data-testid={`${testIdPrefix}-add`}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 text-xs"
          onClick={addRow}
        >
          <Plus className="w-3 h-3" /> Row
        </button>
      )}
    </div>
  );
}
