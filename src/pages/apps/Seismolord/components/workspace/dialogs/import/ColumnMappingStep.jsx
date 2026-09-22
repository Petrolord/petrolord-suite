// Column mapping for generic ASCII interpretation files (the Well Design
// survey-import pattern): a preview of the first rows as the chosen
// delimiter splits them, and one picker per field. The engine reader
// (importText.parseMappedColumns) reads the whole file with the same
// mapping and names every row it cannot read.

import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { DELIMITERS, splitDelimited, detectHeader } from '@/lib/tabularFile';

const PICK_FIELDS = [
  { key: 'x', label: 'X (easting)' },
  { key: 'y', label: 'Y (northing)' },
  { key: 'z', label: 'Z (time)', required: true },
  { key: 'il', label: 'Inline' },
  { key: 'xl', label: 'Crossline' },
  { key: 'name', label: 'Horizon name' },
];

const FAULT_FIELDS = [
  { key: 'x', label: 'X (easting)' },
  { key: 'y', label: 'Y (northing)' },
  { key: 'z', label: 'Z (time)', required: true },
  { key: 'stick', label: 'Stick number' },
  { key: 'name', label: 'Fault name' },
  { key: 'il', label: 'Inline' },
  { key: 'xl', label: 'Crossline' },
];

export const mappingFieldsFor = (kind) => (kind === 'faults' ? FAULT_FIELDS : PICK_FIELDS);

/** Does a mapping place points (Z plus X/Y or inline/crossline)? */
export const mappingComplete = (columns = {}) => Number.isInteger(columns.z)
  && ((Number.isInteger(columns.x) && Number.isInteger(columns.y))
    || (Number.isInteger(columns.il) && Number.isInteger(columns.xl)));

const PREVIEW_LINES = 60;
const PREVIEW_ROWS = 6;

/**
 * @param {Object} p
 * @param {string} p.text file text
 * @param {'picks'|'faults'} p.kind
 * @param {{columns: Object, delimiter: string}} p.mapping
 * @param {(m: Object) => void} p.onChange
 */
export default function ColumnMappingStep({
  text, kind, mapping, onChange,
}) {
  const fields = mappingFieldsFor(kind);
  const table = useMemo(() => {
    const head = String(text || '').split(/\r\n|\r|\n/).slice(0, PREVIEW_LINES).join('\n');
    const { rows, delimiter } = splitDelimited(head, mapping.delimiter || 'auto');
    const { header, rows: data } = detectHeader(rows);
    const width = Math.max(0, ...data.map((r) => r.length), header ? header.length : 0);
    return {
      header, rows: data.slice(0, PREVIEW_ROWS), width, delimiter,
    };
  }, [text, mapping.delimiter]);

  const columnLabel = (i) => {
    const h = table.header?.[i];
    return h ? `Column ${i + 1}: ${h}` : `Column ${i + 1}`;
  };

  const setField = (key, value) => {
    const columns = { ...mapping.columns };
    if (value === '') delete columns[key];
    else columns[key] = Number(value);
    onChange({ ...mapping, columns });
  };

  const complete = mappingComplete(mapping.columns);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-3" data-testid="sl-import-mapping">
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm text-slate-300 flex-1 min-w-[12rem]">
          Map the file&apos;s columns. Z plus either X and Y or inline and crossline places each point.
          {kind === 'faults' && ' Without a stick column, a blank line ends each stick.'}
        </p>
        <div>
          <Label className="text-slate-300 text-xs">Delimiter</Label>
          <select
            className="block mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-1.5 text-xs"
            value={mapping.delimiter || 'auto'}
            onChange={(e) => onChange({ ...mapping, delimiter: e.target.value })}
          >
            {DELIMITERS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {fields.map((f) => (
          <div key={f.key}>
            <Label className="text-slate-400 text-xs">
              {f.label}{f.required ? ' *' : ''}
            </Label>
            <select
              aria-label={f.label}
              data-testid={`sl-map-${f.key}`}
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-1.5 text-xs"
              value={Number.isInteger(mapping.columns?.[f.key]) ? String(mapping.columns[f.key]) : ''}
              onChange={(e) => setField(f.key, e.target.value)}
            >
              <option value="">Not in file</option>
              {Array.from({ length: table.width }, (_, i) => (
                <option key={i} value={String(i)}>{columnLabel(i)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {table.rows.length > 0 && (
        <div className="overflow-auto max-h-40">
          <table className="text-xs text-slate-300">
            <thead className="text-slate-500">
              <tr>
                {Array.from({ length: table.width }, (_, i) => (
                  <th key={i} className="px-2 py-0.5 text-left font-medium whitespace-nowrap">
                    {table.header?.[i] || `Column ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, k) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={k} className="border-t border-slate-800/60">
                  {Array.from({ length: table.width }, (_, i) => (
                    <td key={i} className="px-2 py-0.5 font-mono whitespace-nowrap">{r[i] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!complete && (
        <p className="text-xs text-amber-300">
          Map Z and either X and Y or inline and crossline to read the file.
        </p>
      )}
    </div>
  );
}
