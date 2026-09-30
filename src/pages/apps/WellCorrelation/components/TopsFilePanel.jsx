// Tops file import (AppUpgrade WC-U2-004): read a Petrel, Kingdom or Petra
// tops file (or pasted rows), show what was read (columns, depth reference,
// unit, rows, what will be created or moved, what will not and why) and
// apply it to the shared geo_wells_tops rows. Presentational apart from the
// plan, which is the pure planTopsFile.

import React, { useEffect, useMemo, useState } from 'react';
import { planTopsFile, TOPS_FILE_REFS, TOPS_FILE_REF_LABEL } from '../services/topsFile';

const selCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const btnCls = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

/**
 * @param {Object} p
 * @param {Object[]} p.wells registry wells
 * @param {() => Promise<Object[]>} p.loadRows current tops as sheet rows
 * @param {'m'|'ft'} p.unit display unit (the default when the file states none)
 * @param {(plan: Object) => Promise<void>} p.onApply
 * @param {() => void} p.onClose
 */
export default function TopsFilePanel({ wells, loadRows, unit = 'm', onApply, onClose }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [ref, setRef] = useState('');       // '' = from the header
  const [unitSel, setUnitSel] = useState(''); // '' = from the header
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; loadRows().then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); }); return () => { live = false; }; }, [loadRows]);

  const plan = useMemo(() => (text.trim() && rows
    ? planTopsFile(text, { wells, rows, ref: ref || null, unit: unitSel || null })
    : null), [text, rows, wells, ref, unitSel]);
  const unitShown = plan?.unit || unitSel || unit;
  const readFile = (f) => {
    if (!f) return;
    setFileName(f.name);
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ''));
    r.readAsText(f);
  };
  const header = plan?.columns?.header;
  const n = plan && !plan.error ? plan.creates.length + plan.updates.length : 0;

  return (
    <div className="mt-1 mb-2 p-1.5 rounded border border-pl-border space-y-1" data-testid="corr-tops-import">
      <div className="flex items-center gap-1 flex-wrap">
        <label className={`${btnCls} cursor-pointer`}>
          Choose file
          <input type="file" accept=".csv,.txt,.tsv,.dat,text/*" className="hidden" data-testid="corr-tops-file" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        <span className="text-pl-muted truncate max-w-[10rem]" title={fileName}>{fileName || 'or paste rows below'}</span>
        <button type="button" className={`${btnCls} ml-auto`} onClick={onClose}>Close</button>
      </div>
      <textarea className={`${selCls} w-full h-16 font-mono`} placeholder={'Well,Top,MD (m)\nKETA-1,Top Sand,1523.5'} value={text}
        data-testid="corr-tops-paste" onChange={(e) => { setText(e.target.value); setFileName(''); }} />
      <div className="grid grid-cols-2 gap-1">
        <label className="flex items-center gap-1 text-pl-muted">depth
          <select className={`${selCls} min-w-0 flex-1`} value={ref} data-testid="corr-tops-ref" onChange={(e) => setRef(e.target.value)}>
            <option value="">{plan?.refFromHeader ? `from header: ${TOPS_FILE_REF_LABEL[plan.ref].split(' ')[0]}` : 'MD (header states none)'}</option>
            {TOPS_FILE_REFS.map((r) => <option key={r} value={r}>{TOPS_FILE_REF_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-pl-muted">unit
          <select className={selCls} value={unitSel} data-testid="corr-tops-unit" onChange={(e) => setUnitSel(e.target.value)}>
            <option value="">{plan?.unitFromHeader ? `from header: ${plan.unit}` : `${unit} (header states none)`}</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </label>
      </div>
      {plan && (
        <div className="text-[11px] leading-snug" data-testid="corr-tops-plan">
          {plan.error ? <p className="text-pl-danger-text">{plan.error}</p> : (
            <>
              {header && (
                <p className="text-pl-muted">
                  Read {plan.rowsRead} row{plan.rowsRead === 1 ? '' : 's'}: well from "{header[plan.columns.well]}", top from "{header[plan.columns.name]}",
                  depth from "{header[plan.columns.depth]}" as {TOPS_FILE_REF_LABEL[plan.ref]} in {unitShown}.
                </p>
              )}
              <p className="text-pl-text" data-testid="corr-tops-plan-summary">
                {plan.creates.length} new, {plan.updates.length} moved, {plan.unchanged} unchanged, {plan.problems.length} not applied.
              </p>
              {plan.notes.map((t) => <p key={t} className="text-pl-warning-text">{t}</p>)}
              {plan.problems.length > 0 && (
                <ul className="text-pl-warning-text list-disc pl-4 max-h-24 overflow-auto" data-testid="corr-tops-problems">
                  {plan.problems.map((q) => <li key={`${q.line}-${q.reason}`}>line {q.line}: {q.reason}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      <button type="button" className={btnCls} data-testid="corr-tops-apply" disabled={!n || busy}
        onClick={async () => { setBusy(true); try { await onApply(plan); setText(''); setFileName(''); } finally { setBusy(false); } }}>
        {n ? `Apply ${n} change${n === 1 ? '' : 's'}` : 'Apply'}
      </button>
    </div>
  );
}
