// Replace a well's deviation / tops / checkshots from pasted text (PT1,
// 2026-09-03): the same parse + column mapper the add-well form uses,
// with the convention selectors, so Petrel users paste exactly what
// they copied. Emits the PARSED rows and the convention; the parent
// converts and saves.

import React, { useMemo, useState } from 'react';
import { parseDelimited, guessMapping, guessCheckshotConvention } from '@/lib/wellImport';
import ColumnMapper from './ColumnMapper';

const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export const CHECKSHOT_FIELD_LABELS = (conv) => ({
  depth: `Depth (${{ md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' }[conv.depthRef]}, ${conv.depthUnit})`,
  time: `Time (${conv.time === 'owt' ? 'OWT' : 'TWT'}, ms)`,
});

/** Convention selector row shared by the add-well form and the editors. */
export function CheckshotConventionRow({ conv, onChange, testIdPrefix = 'well-import' }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400" data-testid={`${testIdPrefix}-cs-convention`}>
      Checkshots are
      <select className={inputCls} value={conv.depthRef} onChange={(e) => onChange({ ...conv, depthRef: e.target.value })}
        data-testid={`${testIdPrefix}-cs-depthref`} title="Depth reference of the pasted depth column. Petrel exports MD.">
        <option value="md">MD (measured depth)</option>
        <option value="tvd">TVD (below KB)</option>
        <option value="tvdss">TVDSS (below datum)</option>
      </select>
      in
      <select className={inputCls} value={conv.depthUnit} onChange={(e) => onChange({ ...conv, depthUnit: e.target.value })}
        data-testid={`${testIdPrefix}-cs-unit`}>
        <option value="m">metres</option>
        <option value="ft">feet</option>
      </select>
      with
      <select className={inputCls} value={conv.time} onChange={(e) => onChange({ ...conv, time: e.target.value })}
        data-testid={`${testIdPrefix}-cs-time`} title="One-way time (Petrel checkshots) or two-way time.">
        <option value="owt">one-way time (ms)</option>
        <option value="twt">two-way time (ms)</option>
      </select>
    </div>
  );
}

/** Unit selector for a single MD column (deviation, tops). */
export function MdUnitSelect({ value, onChange, testId, label = 'MD in' }) {
  return (
    <label className="text-xs text-slate-400 flex items-center gap-1">
      {label}
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        <option value="m">metres</option>
        <option value="ft">feet</option>
      </select>
    </label>
  );
}

/**
 * @param {Object} p
 * @param {'deviation'|'tops'|'checkshots'} p.kind
 * @param {string[]} p.fields
 * @param {Object<string,string>} p.labels
 * @param {Object} p.convention   {mdUnit} or {depthRef,time,depthUnit}
 * @param {(c: Object) => void} p.onConvention
 * @param {(state: {parsed, map, header}) => void} p.onParsed  fires on every change
 * @param {Array} [p.extraColumns]
 * @param {string} p.testIdPrefix  e.g. 'wdm-checkshots'
 */
export default function PasteReplacePanel({ kind, fields, labels, convention, onConvention, onParsed, extraColumns = [], testIdPrefix }) {
  const [text, setText] = useState('');
  const [mapOverride, setMapOverride] = useState({});
  const [touched, setTouched] = useState(false);
  const state = useMemo(() => {
    const parsed = parseDelimited(text);
    const guessed = guessMapping(parsed.header, fields);
    const map = { ...guessed, ...mapOverride };
    if (!parsed.header) fields.forEach((f, i) => { if (map[f] < 0 && mapOverride[f] === undefined) map[f] = i; });
    const nCols = parsed.rows.reduce((m, r) => Math.max(m, r.length), parsed.header?.length || 0);
    return { parsed, map, nCols };
  }, [text, fields, mapOverride]);

  const onText = (v) => {
    setText(v);
    if (kind === 'checkshots' && !touched) {
      const p = parseDelimited(v);
      const hint = guessCheckshotConvention(p.header);
      if (Object.keys(hint).length) onConvention({ ...convention, ...hint });
    }
    onParsed(null);
  };
  React.useEffect(() => { onParsed(state.parsed.rows.length ? state : null); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-paste`}>
      {kind === 'checkshots' ? (
        <CheckshotConventionRow conv={convention} onChange={(c) => { setTouched(true); onConvention(c); }} testIdPrefix={testIdPrefix} />
      ) : (
        <MdUnitSelect value={convention.mdUnit} onChange={(u) => onConvention({ ...convention, mdUnit: u })} testId={`${testIdPrefix}-mdunit`} />
      )}
      <textarea
        className={`${inputCls} w-full h-24 font-mono`}
        placeholder={kind === 'deviation' ? 'Paste the survey (MD, inclination, azimuth)'
          : kind === 'tops' ? 'Paste tops (name, MD)'
            : 'Paste checkshots as exported (depth, time); the selectors above say how to read them'}
        value={text}
        onChange={(e) => onText(e.target.value)}
        data-testid={`${testIdPrefix}-paste-text`}
      />
      {state.parsed.rows.length > 0 && (
        <ColumnMapper parsed={state.parsed} fields={fields} labels={labels} map={state.map} nCols={state.nCols}
          onMap={(f, i) => setMapOverride((m) => ({ ...m, [f]: i }))} extraColumns={extraColumns} testIdPrefix={testIdPrefix} />
      )}
    </div>
  );
}
