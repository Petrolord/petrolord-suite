// Reservoir-pressure surveys + PVT mode (V3, left rail on the Pressure tab;
// VRR-U1: units, the pressure door on the shared reader, the datum, and the
// Fluid project table as a third FVF mode).
import React, { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import { parsePressureCSV, PRESSURE_UNITS } from '@/utils/vrr/csvImport';
import { FLUID_FIELDS } from '@/utils/vrr/workspace';
import UnitInput from './UnitInput';

const FLUID_KIND = { api: 'api', gasSg: 'gasSg', gor: 'rs', salinityPpm: 'salinity', tempF: 'temperature' };
/** Two surveys over the sample ledger (2025-01 to 2025-03), for the demo and the report sample. */
export const SAMPLE_SURVEYS = Object.freeze([{ date: '2025-01-15', p_psia: 3000 }, { date: '2025-03-15', p_psia: 2900 }]);

const PressurePanel = () => {
  const {
    inputs, pvt, u, canWrite,
    setPressureSurveys, updateSurvey, addSurvey, removeSurvey, setDatumField,
    setPvtMode, setFluidField, addNotification,
  } = useVrrMonitor();
  const fileRef = useRef(null);
  const [door, setDoor] = useState(null); // { name, text, unit, dateOrder }
  const modeBtn = (on) => (on ? 'bg-pl-primary/10 border-pl-primary text-pl-primary-text hover:bg-pl-primary/15' : '');
  const read = door ? parsePressureCSV(door.text, { unit: door.unit, dateOrder: door.dateOrder, system: u.system }) : null;

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDoor({ name: file.name, text: String(ev.target.result) });
    reader.readAsText(file);
    e.target.value = '';
  };

  const acceptDoor = () => {
    if (!read?.surveys.length) return;
    setPressureSurveys(read.surveys, { file: door.name, column: read.report.colMap.p_psia, unit: read.unit, unitFrom: read.unitFrom, rows: read.surveys.length, skipped: read.report.skipped.length });
    addNotification(`Loaded ${read.surveys.length} pressure surveys from ${door.name}${read.report.skipped.length ? ` (${read.report.skipped.length} rows left out)` : ''}`, 'success');
    setDoor(null);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-pl-muted mb-0">Surveys (date, {u.label('pressure')} absolute)</Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => fileRef.current?.click()} title="Import surveys CSV" disabled={!canWrite}>
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addSurvey} title="Add survey" disabled={!canWrite}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={onFile} data-testid="vrr-pressure-file" />
          </div>
        </div>
        {read && (
          <div className="rounded border border-pl-border p-2 text-xs space-y-1" data-testid="vrr-pressure-readback">
            <div>{door.name}: {read.surveys.length} surveys{read.report.colMap.p_psia ? ` from "${read.report.colMap.p_psia}"` : ''}</div>
            <label className="flex items-center gap-1">
              Unit
              <select aria-label="Pressure unit" data-testid="vrr-pressure-unit" className="bg-pl-surface border border-pl-border rounded px-1" value={read.unit || ''} onChange={(e) => setDoor((d) => ({ ...d, unit: e.target.value }))}>
                {PRESSURE_UNITS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <span className="text-pl-muted">({read.unitFrom === 'header' ? 'from the header' : read.unitFrom === 'chosen' ? 'chosen' : 'assumed: no unit in the header'})</span>
            </label>
            {read.questions.map((q, i) => (
              <div key={i} className={`border rounded px-2 py-1 ${THEMED_TONE.warn}`}>
                {q.text}
                {q.kind === 'dateOrder' && (
                  <span className="ml-1 inline-flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setDoor((d) => ({ ...d, dateOrder: 'dmy' }))}>Day first</Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setDoor((d) => ({ ...d, dateOrder: 'mdy' }))}>Month first</Button>
                  </span>
                )}
              </div>
            ))}
            {read.report.warnings.map((w, i) => <div key={i} className="text-pl-warning-text">{w}</div>)}
            {read.report.skipped.slice(0, 4).map((s, i) => <div key={i} className="text-pl-muted">Line {s.row}: {s.reason}</div>)}
            {read.refusal && <div className="text-pl-danger-text">{read.refusal}</div>}
            <div className="flex gap-1">
              <Button size="sm" className="h-7" onClick={acceptDoor} disabled={!read.surveys.length} data-testid="vrr-pressure-accept">Use these surveys</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setDoor(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {inputs.pressureSurveys.length === 0 && (
          <div className="space-y-1">
            <p className="text-xs text-pl-muted">
              No surveys yet. Add rows here or import a table with date and pressure columns.
            </p>
            {inputs.mode === 'imported' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!canWrite} onClick={() => setPressureSurveys(SAMPLE_SURVEYS.map((s) => ({ ...s })), { sample: true })}>
                Sample surveys
              </Button>
            )}
          </div>
        )}
        {inputs.pressureSurveys.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={s.date}
              onChange={(e) => updateSurvey(i, 'date', e.target.value)}
              placeholder="YYYY-MM-DD"
              className="h-8 flex-1 min-w-0 font-pl-mono tabular-nums"
              aria-label={`Survey ${i + 1} date`}
            />
            <UnitInput
              kind="pressure"
              value={s.p_psia}
              onChange={(v) => updateSurvey(i, 'p_psia', v)}
              placeholder={u.label('pressure')}
              className="h-8 w-24 text-right font-pl-mono tabular-nums"
              aria-label={`Survey ${i + 1} pressure (${u.label('pressure')})`}
            />
            <button onClick={() => removeSurvey(i)} className="shrink-0 rounded text-pl-muted hover:text-pl-danger-text" title="Remove survey" disabled={!canWrite}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="vrr-datum-depth" className="text-xs text-pl-muted">Datum depth ({u.label('depth')})</Label>
            <UnitInput
              id="vrr-datum-depth" className="h-8 font-pl-mono" kind="depth"
              value={inputs.datum?.depth ?? ''}
              onChange={(v) => setDatumField('depth', v)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vrr-datum-ref" className="text-xs text-pl-muted">Datum reference</Label>
            <Input id="vrr-datum-ref" className="h-8" placeholder="TVDSS" value={inputs.datum?.reference ?? ''} onChange={(e) => setDatumField('reference', e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-pl-muted">The datum is stated in the report; pressures are used as given, with no correction to it.</p>
      </section>

      <section className="space-y-2">
        <Label className="text-xs text-pl-muted">Fluid properties per period</Label>
        <div className="grid grid-cols-3 gap-1">
          {[['constant', 'Constant FVF'], ['track', 'Pressure track'], ['table', 'Fluid table']].map(([mode, label]) => (
            <Button
              key={mode}
              variant="outline" size="sm"
              className={`${modeBtn(inputs.pvtMode === mode)} px-1 text-xs`}
              aria-pressed={inputs.pvtMode === mode}
              onClick={() => setPvtMode(mode)}
              disabled={!canWrite}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-pl-muted leading-relaxed">
          Pressure track derives Bo, Bw, Bg and Rs per period from black-oil correlations (Standing, Papay Z, McCain Bw)
          at the interpolated period pressure. Fluid table reads them from the PVT table taken from a Fluid Systems
          Studio project (Data &amp; PVT tab). Periods without a pressure keep the constant FVF set.
        </p>
        {pvt.withheld && inputs.pvtMode !== 'constant' && (
          <div className={`text-xs border rounded px-2 py-1.5 ${THEMED_TONE.warn}`} data-testid="vrr-pvt-withheld">{pvt.withheld}</div>
        )}
      </section>

      {inputs.pvtMode === 'track' && (
        <section className="space-y-2">
          {FLUID_FIELDS.map(({ key, label }) => {
            const kind = FLUID_KIND[key];
            return (
              <div key={key} className="space-y-1">
                <Label htmlFor={`vrr-fluid-${key}`} className="text-xs text-pl-muted">{label} ({u.label(kind)})</Label>
                <UnitInput
                  kind={kind}
                  value={inputs.fluid[key]}
                  id={`vrr-fluid-${key}`}
                  onChange={(v) => setFluidField(key, v)}
                  className="h-8 font-pl-mono tabular-nums"
                />
              </div>
            );
          })}
        </section>
      )}
      {pvt.warnings?.length > 0 && (
        <div className={`text-xs border rounded px-2 py-1.5 space-y-0.5 ${THEMED_TONE.warn}`}>
          {pvt.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
    </div>
  );
};

export default PressurePanel;
