// Registry inventory (AppUpgrade WDM-U2-006): every well against its
// logs, tops, survey, checkshots, CRS and KB, with QC flags that say what
// is missing and why it matters. The flag chips at the top filter the
// table; a row opens the well. Depths in the display unit.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, AlertTriangle, Info } from 'lucide-react';
import { registryInventory, QC_FLAGS, FLAG_BY_CODE, inventoryCsv, inventoryDepth } from '../engine/inventory';
import { unitText } from '../engine/displayUnits';
import { downloadText } from '@/lib/fullPrecision';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const thCls = 'sticky top-0 bg-pl-surface text-left font-medium text-pl-muted px-2 py-1 border-b border-pl-border whitespace-nowrap';
const tdCls = 'px-2 py-0.5 text-pl-text whitespace-nowrap';

/**
 * @param {Object} p
 * @param {Object[]} p.wells registry rows (the tree's list)
 * @param {number} [p.reloadKey] bump to re-read the child tables
 */
export default function InventoryView({ backend, wells, unit = 'm', onOpen, onStatus, reloadKey = 0 }) {
  const u = unitText(unit);
  const [data, setData] = useState(null); // {logs, tops}
  const [error, setError] = useState(null);
  const [flag, setFlag] = useState(null);  // filter by one flag code
  const [warnOnly, setWarnOnly] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    (async () => {
      try {
        const [logs, tops] = await Promise.all([backend.listAllLogMeta(), backend.listAllTops()]);
        if (live) setData({ logs, tops });
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => { live = false; };
  }, [backend, reloadKey]);

  const inv = useMemo(() => (data ? registryInventory(wells, data.logs, data.tops) : null), [wells, data]);
  const rows = useMemo(() => (inv ? inv.rows.filter((r) => (!flag || r.flags.includes(flag)) && (!warnOnly || r.warnings > 0)) : []), [inv, flag, warnOnly]);

  if (error) return <p className="p-3 text-xs text-pl-danger-text" data-testid="wdm-inventory-error">{error}</p>;
  if (!inv) {
    return (
      <div className="p-3 text-xs text-pl-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading the registry…</div>
    );
  }

  const clean = inv.rows.filter((r) => r.warnings === 0).length;
  return (
    <div className="p-3 space-y-2" data-testid="wdm-inventory">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-pl-text font-medium">Registry inventory</span>
        <span className="text-pl-muted" data-testid="wdm-inventory-summary">
          {inv.rows.length} well{inv.rows.length === 1 ? '' : 's'}, {clean} with no warning
          {inv.frame ? `; most are in ${inv.frame}` : ''}
        </span>
        <label className="ml-auto flex items-center gap-1 text-pl-muted">
          <input type="checkbox" checked={warnOnly} onChange={(e) => setWarnOnly(e.target.checked)} data-testid="wdm-inventory-warn-only" />
          only wells with warnings
        </label>
        <button type="button" className="flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
          data-testid="wdm-inventory-csv"
          onClick={() => { downloadText('well_inventory.csv', inventoryCsv(inv.rows, u), 'text/csv'); onStatus?.(`Inventory CSV written (${inv.rows.length} wells, depths in ${u}).`); }}>
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>
      <div className="flex flex-wrap gap-1" data-testid="wdm-inventory-flags">
        {QC_FLAGS.filter((f) => inv.counts[f.code] > 0).map((f) => (
          <button key={f.code} type="button" title={`${f.why} Fix: ${f.fix}`}
            data-testid={`wdm-flag-${f.code}`}
            onClick={() => setFlag((cur) => (cur === f.code ? null : f.code))}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] border
              ${flag === f.code ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text'
                : f.level === 'warn' ? 'border-pl-warning/60 text-pl-warning-text' : 'border-pl-border text-pl-muted'}`}>
            {f.level === 'warn' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
            {f.label}: {inv.counts[f.code]}
          </button>
        ))}
        {QC_FLAGS.every((f) => !inv.counts[f.code]) && <span className="text-[11px] text-pl-muted">No flags raised.</span>}
      </div>
      <div className="overflow-auto max-h-[70vh] border border-pl-border rounded">
        <table className="text-xs min-w-full" data-testid="wdm-inventory-table">
          <thead>
            <tr>
              <th className={thCls}>Well</th>
              <th className={thCls}>CRS</th>
              <th className={thCls}>KB ({u})</th>
              <th className={thCls}>TD ({u} MD)</th>
              <th className={thCls}>Survey</th>
              <th className={thCls}>Checkshots</th>
              <th className={thCls}>Curves</th>
              <th className={thCls}>Tops</th>
              <th className={thCls}>Logged ({u} MD)</th>
              <th className={thCls}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="wdm-inventory-row" data-well-name={r.name}
                className="cursor-pointer hover:bg-pl-sunken" onClick={() => onOpen(r.id)}>
                <td className={`${tdCls} font-medium`}>{r.name}</td>
                <td className={tdCls}>{r.crs || EMPTY_VALUE}</td>
                <td className={tdCls}>{inventoryDepth(r.kbM, u)}</td>
                <td className={tdCls}>{inventoryDepth(r.tdM, u)}</td>
                <td className={tdCls}>{r.stations ? `${r.stations} stations` : 'vertical'}</td>
                <td className={tdCls}>{r.checkshots || EMPTY_VALUE}</td>
                <td className={tdCls} title={r.curveNames.join(', ')}>{r.nCurves}</td>
                <td className={tdCls}>{r.nTops}</td>
                <td className={tdCls}>{r.logTopM === null ? EMPTY_VALUE : `${inventoryDepth(r.logTopM, u)} to ${inventoryDepth(r.logBaseM, u)}`}</td>
                <td className="px-2 py-0.5">
                  <span className="flex flex-wrap gap-1">
                    {r.flags.map((c) => (
                      <span key={c} title={`${FLAG_BY_CODE[c].why} Fix: ${FLAG_BY_CODE[c].fix}`}
                        data-testid={`wdm-row-flag-${c}`}
                        className={`rounded px-1 text-[10px] ${FLAG_BY_CODE[c].level === 'warn' ? 'bg-pl-warning-bg text-pl-warning-text' : 'bg-pl-sunken text-pl-muted'}`}>
                        {FLAG_BY_CODE[c].label}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={10} className="px-2 py-2 text-pl-muted">{inv.rows.length ? 'No well matches the filter.' : 'No wells yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
