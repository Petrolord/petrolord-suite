// Column mapping + preview for delimited well data (deviation, tops,
// checkshots): one <select> per field over the detected columns and a
// six-row preview. Extracted from WellImport (PT1, 2026-09-03) so the
// add-well form and the replace-from-paste editors share the same mapper
// and the same test ids (`well-map-<field>`, `well-import-preview`,
// `well-import-rowcount`).

import React from 'react';

const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

/**
 * @param {Object} p
 * @param {{header: ?string[], rows: string[][]}} p.parsed  parseDelimited output
 * @param {string[]} p.fields  field keys in display order
 * @param {Object<string,string>} p.labels  field -> label
 * @param {Object<string,number>} p.map  field -> column index (-1 = unmapped)
 * @param {(field: string, index: number) => void} p.onMap
 * @param {number} p.nCols
 * @param {Array<{label: string, cell: (row: string[], i: number) => React.ReactNode}>} [p.extraColumns]
 *   computed preview columns appended to the right (e.g. the stored TVDSS/TWT)
 * @param {string} [p.testIdPrefix='well']
 */
export default function ColumnMapper({ parsed, fields, labels, map, onMap, nCols, extraColumns = [], testIdPrefix = 'well' }) {
  const previewRows = parsed.rows.slice(0, 6);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {fields.map((f) => (
          <label key={f} className="text-xs text-slate-400 flex items-center gap-1">
            {labels[f] || f}
            <select
              className={inputCls}
              value={String(map[f])}
              onChange={(e) => onMap(f, Number(e.target.value))}
              data-testid={`${testIdPrefix}-map-${f}`}
            >
              <option value="-1">—</option>
              {Array.from({ length: nCols }, (_, i) => (
                <option key={i} value={String(i)}>
                  {parsed.header?.[i] ? `${parsed.header[i]}` : `column ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="text-xs text-slate-500" data-testid={`${testIdPrefix}-import-rowcount`}>
          {parsed.rows.length} rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs text-slate-300 font-mono" data-testid={`${testIdPrefix}-import-preview`}>
          {extraColumns.length > 0 && (
            <thead>
              <tr>
                {fields.map((f) => <th key={f} className="pr-4 text-left font-medium text-slate-500">{labels[f] || f}</th>)}
                {extraColumns.map((c) => <th key={c.label} className="pr-4 text-left font-medium text-cyan-700">{c.label}</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {previewRows.map((r, i) => (
              // preview only — row order is the file's, index keys fine
               
              <tr key={i}>
                {fields.map((f) => (
                  <td key={f} className="pr-4 whitespace-nowrap">
                    {map[f] >= 0 ? r[map[f]] : '—'}
                  </td>
                ))}
                {extraColumns.map((c) => (
                  <td key={c.label} className="pr-4 whitespace-nowrap text-cyan-700" data-testid={`${testIdPrefix}-import-preview-stored`}>
                    {c.cell(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
