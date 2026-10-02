// The datum editor every app shares (Well Data Manager Header, Wellsite
// Config): depth reference kind and elevation, environment, ground level
// or water depth, vertical datum name, in the display unit. All checks,
// conversions and the "what moves" text come from src/lib/wellDatum.js;
// this file is the form only.

import React from 'react';
import {
  DEPTH_REF_KINDS, DEPTH_REF_LABELS, COMMON_VERTICAL_DATUMS, datumLine, datumChangeLine,
} from '@/lib/wellDatum';

const inp = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const lab = 'block text-[11px] uppercase tracking-wider text-pl-muted';

/** Blank fields for a well with no datum (the editor's empty state). */
export const EMPTY_DATUM_FIELDS = Object.freeze({ refKind: '', refLabel: '', refElev: '', environment: '', groundElev: '', waterDepth: '', verticalDatum: '' });

/**
 * @param {Object} p
 * @param {Object} p.fields {refKind, refLabel, refElev, environment, groundElev, waterDepth, verticalDatum} as typed
 * @param {(next: Object) => void} p.onChange
 * @param {'m'|'ft'} p.unit display unit of the elevation fields
 * @param {boolean} [p.columns=true] false when the registry has no datum
 *   columns yet: only the elevation can be saved, and the form says so
 * @param {string} [p.testIdPrefix='datum'] @param {string} [p.elevTestId]
 */
export function DatumFields({ fields, onChange, unit = 'm', columns = true, testIdPrefix = 'datum', elevTestId = null, disabled = false }) {
  const f = fields || EMPTY_DATUM_FIELDS;
  const set = (k) => (e) => onChange({ ...f, [k]: e.target.value });
  const u = unit === 'ft' ? 'ft' : 'm';
  const off = disabled || !columns;
  const listId = `${testIdPrefix}-vdatum-list`;
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-fields`}>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
        <label>
          <span className={lab}>Depths measured from</span>
          <select className={inp} value={columns ? f.refKind : (f.refElev.trim() === '' ? '' : 'KB')} onChange={set('refKind')} disabled={off} data-testid={`${testIdPrefix}-kind`}>
            <option value="">not set</option>
            {DEPTH_REF_KINDS.map((k) => <option key={k} value={k}>{DEPTH_REF_LABELS[k]}</option>)}
          </select>
        </label>
        {columns && f.refKind === 'OTHER' && (
          <label>
            <span className={lab}>Reference name</span>
            <input className={`${inp} w-36`} value={f.refLabel} onChange={set('refLabel')} disabled={off} maxLength={80} data-testid={`${testIdPrefix}-label`} />
          </label>
        )}
        <label>
          <span className={lab}>Reference elevation ({u})</span>
          <input className={`${inp} w-24`} value={f.refElev} onChange={set('refElev')} disabled={disabled} inputMode="decimal"
            placeholder="not set" data-testid={elevTestId || `${testIdPrefix}-elev`}
            title="Elevation of the depth reference above the vertical datum. Leave blank when it is not known: blank is kept as not set, never as 0." />
        </label>
        <label>
          <span className={lab}>Vertical datum</span>
          <input className={`${inp} w-28`} value={f.verticalDatum} onChange={set('verticalDatum')} disabled={off} list={listId} maxLength={80}
            placeholder="MSL, LAT, ..." data-testid={`${testIdPrefix}-vdatum`} />
          <datalist id={listId}>{COMMON_VERTICAL_DATUMS.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
        <label>
          <span className={lab}>Environment</span>
          <select className={inp} value={f.environment} onChange={set('environment')} disabled={off} data-testid={`${testIdPrefix}-env`}>
            <option value="">not set</option>
            <option value="onshore">Onshore</option>
            <option value="offshore">Offshore</option>
          </select>
        </label>
        {f.environment !== 'offshore' && (
          <label>
            <span className={lab}>Ground level ({u})</span>
            <input className={`${inp} w-24`} value={f.groundElev} onChange={set('groundElev')} disabled={off} inputMode="decimal" placeholder="not set"
              data-testid={`${testIdPrefix}-ground`} title="Ground elevation above the vertical datum (onshore wells)" />
          </label>
        )}
        {f.environment !== 'onshore' && (
          <label>
            <span className={lab}>Water depth ({u})</span>
            <input className={`${inp} w-24`} value={f.waterDepth} onChange={set('waterDepth')} disabled={off} inputMode="decimal" placeholder="not set"
              data-testid={`${testIdPrefix}-water`} title="Vertical datum to mudline, positive down (offshore wells)" />
          </label>
        )}
      </div>
      {!columns && (
        <p className="text-[11px] text-pl-warning-text" data-testid={`${testIdPrefix}-legacy-note`}>
          The registry on this server keeps one elevation per well for now, read as the KB. The reference kind, environment, ground level, water depth
          and datum name can be saved once the pending database upgrade is applied. A blank elevation is stored as 0 until then.
        </p>
      )}
    </div>
  );
}

/** Errors and warnings from validateDatum, as the form shows them. */
export function DatumProblems({ errors = [], warnings = [], testIdPrefix = 'datum' }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="space-y-0.5">
      {errors.map((e) => <div key={e} className="text-xs text-pl-danger-text" data-testid={`${testIdPrefix}-error`}>{e}</div>)}
      {warnings.map((w) => <div key={w} className="text-xs text-pl-warning-text" data-testid={`${testIdPrefix}-warning`}>{w}</div>)}
    </div>
  );
}

/**
 * What a correction moves, with the reason field and the confirm button.
 * Shown only when the change touches a well that has data.
 */
export function DatumImpact({ impact, reason, onReason, onConfirm, onCancel, busy = false, testIdPrefix = 'datum' }) {
  if (!impact || !impact.lines.length) return null;
  return (
    <div className="rounded border border-pl-warning/40 bg-pl-warning-bg p-2 space-y-1.5 max-w-2xl" data-testid={`${testIdPrefix}-impact`} role="alertdialog" aria-label="Datum change">
      <div className="text-xs font-semibold text-pl-text">This changes the depth reference of a well that has data.</div>
      <ul className="list-disc pl-4 text-xs text-pl-text space-y-0.5">
        {impact.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <label className="block">
        <span className={lab}>Reason (kept with the change)</span>
        <input className={`${inp} w-full max-w-md`} value={reason} onChange={(e) => onReason(e.target.value)} maxLength={200}
          placeholder="for example: rig survey report, operator correction" data-testid={`${testIdPrefix}-reason`} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={onConfirm} data-testid={`${testIdPrefix}-confirm`}
          className="px-2 py-0.5 rounded text-xs bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg">Confirm and save</button>
        <button type="button" disabled={busy} onClick={onCancel} data-testid={`${testIdPrefix}-cancel`}
          className="px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken">Go back</button>
      </div>
    </div>
  );
}

/** The well's datum as read-only text, with the reason when it is not set and the change history. */
export function DatumSummary({ datum, unit = 'm', testIdPrefix = 'datum', history = 3 }) {
  if (!datum) return null;
  const changes = (datum.changes || []).slice(-history).reverse();
  return (
    <div className="space-y-0.5 text-xs" data-testid={`${testIdPrefix}-summary`}>
      <div className={datum.tvdssOk ? 'text-pl-text' : 'text-pl-warning-text'} data-testid={`${testIdPrefix}-line`}>{datumLine(datum, unit, 2)}</div>
      {!datum.tvdssOk && <div className="text-pl-warning-text" data-testid={`${testIdPrefix}-unset`}>{datum.tvdssReason}</div>}
      {datum.note && <div className="text-pl-warning-text" data-testid={`${testIdPrefix}-note`}>{datum.note}</div>}
      {changes.length > 0 && (
        <ul className="text-[11px] text-pl-muted" data-testid={`${testIdPrefix}-history`}>
          {changes.map((c) => <li key={`${c.at}-${c.by || ''}`}>{datumChangeLine(c, unit)}</li>)}
        </ul>
      )}
    </div>
  );
}
