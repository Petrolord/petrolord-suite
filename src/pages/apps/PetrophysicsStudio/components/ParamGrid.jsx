// Parameter grid (Petrophysics Studio PT9c/PT9g): parameters down the
// side, a read-only Global column, then one editable column per case
// (zones in the zone table, low/high in the scenarios dialog). Cells edit
// in place; a cell that differs from Global is highlighted; a cell whose
// field does not apply under that column's models is greyed. The parent
// owns the draft (columnId -> merged parameter draft) and decides what a
// column's edits mean.

import React from 'react';
import { FIELDS, visibleField } from '../services/paramFields';

const cellCls = 'w-full min-w-[5.5rem] rounded bg-slate-950 border px-1 py-0.5 text-xs text-slate-200';
export const fmtVal = (v) => (typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v ?? ''));

/**
 * @param {Object} p
 * @param {Array} p.rows buildZoneTable rows
 * @param {Array<{id: string, name: string}>} p.columns editable columns
 * @param {Object} p.params the global set
 * @param {Object} p.draft columnId -> draft
 * @param {Object} p.invalid columnId -> keys whose text is not a number
 * @param {(colId, key, value) => void} p.onCell
 * @param {string} p.testPrefix test id prefix, cells are `${prefix}-${column.name}-${key}`
 * @param {(col) => React.ReactNode} [p.columnHeader] extra header content per column
 */
export default function ParamGrid({ rows, columns, params, draft, invalid = {}, onCell, testPrefix, columnHeader = null, globalLabel = 'Global' }) {
  const isOverride = (colId, key) => {
    const v = draft[colId]?.[key];
    const g = params[key];
    if (typeof g === 'number') return Number(v) !== g;
    return String(v) !== String(g);
  };
  let section = null;
  return (
    <div className="max-h-[60vh] overflow-auto rounded border border-slate-800">
      <table className="text-xs border-collapse min-w-full">
        <thead className="sticky top-0 bg-slate-900 z-10">
          <tr>
            <th className="text-left px-2 py-1 text-slate-400 font-normal">Parameter</th>
            <th className="text-left px-2 py-1 text-slate-400 font-normal">{globalLabel}</th>
            {columns.map((c) => (
              <th key={c.id} className="text-left px-2 py-1 font-normal">
                <div className="text-slate-200">{c.name}</div>
                {columnHeader?.(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const header = r.section !== section ? r.section : null;
            section = r.section;
            const f = FIELDS.find((x) => x.key === r.key);
            return (
              <React.Fragment key={r.key}>
                {header && (
                  <tr>
                    <td colSpan={2 + columns.length} className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500">{header}</td>
                  </tr>
                )}
                <tr className="border-t border-slate-800/60">
                  <td className="px-2 py-0.5 text-slate-400 whitespace-nowrap">{r.label}</td>
                  <td className="px-2 py-0.5 text-slate-500 whitespace-nowrap" data-testid={`${testPrefix}-global-${r.key}`}>{fmtVal(r.global)}</td>
                  {columns.map((c) => {
                    const d = draft[c.id] || {};
                    const applies = visibleField(f, d);
                    const over = applies && isOverride(c.id, r.key);
                    const bad = invalid[c.id]?.includes(r.key);
                    const border = bad ? 'border-red-500/70' : over ? 'border-cyan-500/70 bg-cyan-500/10' : 'border-slate-800';
                    return (
                      <td key={c.id} className="px-1 py-0.5">
                        {!applies ? (
                          <span className="block px-1 text-slate-600" title="Not used by this column's models">·</span>
                        ) : r.options ? (
                          <select className={`${cellCls} ${border}`} value={String(d[r.key] ?? '')} data-testid={`${testPrefix}-${c.name}-${r.key}`} onChange={(e) => onCell(c.id, r.key, e.target.value)}>
                            {r.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input className={`${cellCls} ${border}`} value={typeof d[r.key] === 'number' ? fmtVal(d[r.key]) : String(d[r.key] ?? '')} data-testid={`${testPrefix}-${c.name}-${r.key}`} onChange={(e) => onCell(c.id, r.key, e.target.value)} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
