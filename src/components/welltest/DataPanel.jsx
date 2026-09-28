// Left rail for the Data tab: test setup, unit system, reservoir and fluid
// properties, gauge CSV import, rate history editor and the deterministic
// sample test. All state is oilfield units; the unit system converts at the
// display layer (see utils/welltest/units.js). The gauge import finds the
// time and pressure columns from the headers and converts the file's units
// (utils/welltest/gaugeImport.js).
import React, { useRef, useState } from 'react';
import { Upload, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, displayInputString, storeInputString } from '@/utils/welltest/units';
import {
  readGaugeTable, detectGaugeMapping, convertGaugeRows, PRESSURE_UNITS, TIME_UNITS, PWF_SOURCE_TEXT, gaugeTime,
} from '@/utils/welltest/gaugeImport';
import { SectionLabel, Field, UnitField, fmt, valueWithUnit } from './primitives';

const defaultPressureUnit = (unitSystem) => (unitSystem === 'si' ? 'kpaa' : 'psia');

// Import a gauge file with automatic column and unit detection; rows come
// back oilfield (hr, psia).
export function parseGaugeCsv(text, { unitSystem = 'oilfield', mapping } = {}) {
  const table = readGaugeTable(text);
  const m = { ...detectGaugeMapping(table, { defaultPressure: defaultPressureUnit(unitSystem) }), ...(mapping || {}) };
  return convertGaugeRows(table, m).rows;
}

const columnName = (table, i) => table.headers?.[i] || `Column ${i + 1}`;

// Column and unit choices for the file just imported. Every change
// re-converts the file, so a wrong guess is one click to correct.
const ImportMapping = ({ imported, onChange }) => {
  const { table, mapping, fileName, skipped, count } = imported;
  const cols = Array.from({ length: table.columnCount }, (_, i) => i);
  const set = (k, v) => onChange({ ...mapping, [k]: v });
  const detected = [];
  if (mapping.detectedFrom?.time) detected.push('time');
  if (mapping.detectedFrom?.pressure) detected.push('pressure');
  return (
    <div className="rounded-md border border-pl-border p-3 space-y-2" data-testid="wts-import-mapping">
      <p className="text-[11px] text-pl-muted">
        <span className="text-pl-text font-medium">{fileName}</span>: {count} readings loaded{skipped ? `, ${skipped} rows skipped` : ''}.
        {' '}{detected.length ? `Columns found from the headers (${detected.join(' and ')}).` : 'No column headers recognised: check the columns below.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Time column</Label>
          <Select value={String(mapping.timeCol)} onValueChange={(v) => set('timeCol', Number(v))}>
            <SelectTrigger className="h-8" aria-label="Time column"><SelectValue /></SelectTrigger>
            <SelectContent>
              {cols.map((i) => <SelectItem key={i} value={String(i)}>{columnName(table, i)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Time unit</Label>
          <Select value={mapping.timeUnit} onValueChange={(v) => set('timeUnit', v)}>
            <SelectTrigger className="h-8" aria-label="Time unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIME_UNITS).map(([k, u]) => <SelectItem key={k} value={k}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Pressure column</Label>
          <Select value={String(mapping.pressureCol)} onValueChange={(v) => set('pressureCol', Number(v))}>
            <SelectTrigger className="h-8" aria-label="Pressure column"><SelectValue /></SelectTrigger>
            <SelectContent>
              {cols.map((i) => <SelectItem key={i} value={String(i)}>{columnName(table, i)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Pressure unit</Label>
          <Select value={mapping.pressureUnit} onValueChange={(v) => set('pressureUnit', v)}>
            <SelectTrigger className="h-8" aria-label="Pressure unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRESSURE_UNITS).map(([k, u]) => <SelectItem key={k} value={k}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-pl-muted">
        {PRESSURE_UNITS[mapping.pressureUnit]?.gauge
          ? 'Gauge readings are converted to absolute pressure by adding one standard atmosphere (14.696 psi, 101.325 kPa).'
          : 'Readings are taken as absolute pressure.'}
        {mapping.timeUnit === 'datetime' ? ' Date/time stamps are counted in hours from the first reading.' : ''}
      </p>
    </div>
  );
};

const DataPanel = () => {
  const {
    wellName, setWellName,
    fieldName, setFieldName,
    analyst, setAnalyst,
    prepared,
    reservoirInputs, setReservoirField,
    testConfig, setTestField,
    gaugeRows, setGaugeRows,
    rateRows, setRateRows,
    addNotification, loadSampleTest,
    unitSystem, setUnitSystem,
  } = useWellTestStudio();
  const fileRef = useRef(null);
  // the file just imported, held so its column/unit mapping can be changed
  const [imported, setImported] = useState(null);
  const isGas = reservoirInputs.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  const isBuildupFamily = testConfig.testType === 'buildup' || testConfig.testType === 'falloff';

  const applyImport = (table, mapping, fileName, announce) => {
    const { rows, skipped } = convertGaugeRows(table, mapping);
    if (rows.length < 5) {
      addNotification(`Could not read at least 5 (time, pressure) readings with the ${columnName(table, mapping.timeCol)} and ${columnName(table, mapping.pressureCol)} columns. Pick the time and pressure columns below.`, 'error');
      setImported({ table, mapping, fileName, skipped, count: rows.length });
      return;
    }
    setGaugeRows(rows);
    setImported({ table, mapping, fileName, skipped, count: rows.length });
    if (announce) {
      const pu = PRESSURE_UNITS[mapping.pressureUnit]?.label;
      const tu = TIME_UNITS[mapping.timeUnit]?.label;
      addNotification(`Loaded ${rows.length} gauge points from ${fileName} (time in ${tu}, pressure in ${pu}).`, 'success');
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const table = readGaugeTable(String(ev.target.result || ''));
      if (!table.rows.length) {
        addNotification('The file has no data rows.', 'error');
        return;
      }
      const mapping = detectGaugeMapping(table, { defaultPressure: defaultPressureUnit(unitSystem) });
      applyImport(table, mapping, file.name, true);
    };
    reader.onerror = () => addNotification('Could not read the file', 'error');
    reader.readAsText(file);
  };

  const setRate = (i, key, v) => setRateRows(rateRows.map((r, idx) => (idx === i
    ? { ...r, [key]: key === 'q' ? storeInputString(rateKind, v, unitSystem) : v }
    : r)));

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Test setup</SectionLabel>
        <div className="space-y-3">
          <Field label="Well name" value={wellName} onChange={setWellName} placeholder="Optional" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Field" value={fieldName} onChange={setFieldName} placeholder="Optional" />
            <Field label="Analyst" value={analyst} onChange={setAnalyst} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Unit system</Label>
            <Select value={unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield (psi, ft, STB/D)</SelectItem>
                <SelectItem value="si">SI / metric (kPa, m, m3/d)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Test type</Label>
            <Select value={testConfig.testType} onValueChange={(v) => setTestField('testType', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buildup">Pressure buildup</SelectItem>
                <SelectItem value="drawdown">Pressure drawdown</SelectItem>
                <SelectItem value="injection">Injection test</SelectItem>
                <SelectItem value="falloff">Injection falloff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isBuildupFamily && (
            <Field label={testConfig.testType === 'falloff' ? 'Injection time tp' : 'Producing time tp'} suffix="hr" value={testConfig.tp} onChange={(v) => setTestField('tp', v)} />
          )}
          <Field
            label={isBuildupFamily ? 'Shut-in time on the gauge clock' : 'Start of flow on the gauge clock'}
            suffix="hr, blank = 0"
            value={testConfig.testStartTime ?? ''}
            onChange={(v) => setTestField('testStartTime', v)}
          />
          {isBuildupFamily && (
            <>
              <UnitField
                kind="pressure" system={unitSystem}
                label={testConfig.testType === 'falloff' ? 'Injection pressure at shut-in, pwi at Δt = 0 hr' : 'Flowing pressure at shut-in, pwf at Δt = 0 hr'}
                suffixNote="blank = from data"
                value={testConfig.pwfShutIn} onChange={(v) => setTestField('pwfShutIn', v)}
              />
              {Number.isFinite(prepared.pwfShutIn) && (
                <p className="text-[11px] text-pl-muted" data-testid="wts-pwf-readout">
                  {testConfig.testType === 'falloff' ? 'pwi' : 'pwf'} at Δt = 0 hr (gauge time {gaugeTime(prepared.testStartTime)} hr): {valueWithUnit('pressure', prepared.pwfShutIn, unitSystem, fmt.f1)}, {PWF_SOURCE_TEXT[prepared.pwfSource?.kind] || 'from data'}.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Gauge data</SectionLabel>
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={onFile} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" onClick={loadSampleTest} title="Load a synthetic sample buildup">
              <FlaskConical className="w-4 h-4 mr-1" /> Sample
            </Button>
          </div>
          <p className="text-[11px] text-pl-muted">
            A time column and a pressure column, in any order: headers such as Time (hr), Elapsed (min), Date, Pressure (psig) or BHP (kPa) are recognised, and the units can be changed after import.
            {gaugeRows.length ? ` Loaded: ${gaugeRows.length} points.` : ' No data loaded yet.'}
          </p>
          {imported && (
            <ImportMapping
              imported={imported}
              onChange={(mapping) => applyImport(imported.table, mapping, imported.fileName, false)}
            />
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Reservoir and fluid</SectionLabel>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Fluid</Label>
            <Select value={reservoirInputs.fluid || 'oil'} onValueChange={(v) => setReservoirField('fluid', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oil">Oil (slightly compressible)</SelectItem>
                <SelectItem value="gas">Gas (pseudo-pressure)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <UnitField kind="length" system={unitSystem} label="Net thickness h" value={reservoirInputs.h} onChange={(v) => setReservoirField('h', v)} />
            <Field label="Porosity" suffix="frac" value={reservoirInputs.phi} onChange={(v) => setReservoirField('phi', v)} />
            <UnitField kind="length" system={unitSystem} label="Wellbore radius rw" value={reservoirInputs.rw} onChange={(v) => setReservoirField('rw', v)} />
            {isGas ? (
              <>
                <Field label="Gas gravity" suffix="air = 1" value={reservoirInputs.gasGravity} onChange={(v) => setReservoirField('gasGravity', v)} />
                <UnitField kind="temperature" system={unitSystem} label="Temperature" value={reservoirInputs.tempF} onChange={(v) => setReservoirField('tempF', v)} />
                <UnitField kind="compressibility" system={unitSystem} label="Total ct" suffixNote="blank = cg(pi)" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />
                <UnitField kind="gasRate" system={unitSystem} label="Rate q" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            ) : (
              <>
                <UnitField kind="compressibility" system={unitSystem} label="Total ct" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />
                <UnitField kind="fvf" system={unitSystem} label="Oil FVF B" value={reservoirInputs.B} onChange={(v) => setReservoirField('B', v)} />
                <UnitField kind="viscosity" system={unitSystem} label="Viscosity" value={reservoirInputs.mu} onChange={(v) => setReservoirField('mu', v)} />
                <UnitField kind="oilRate" system={unitSystem} label="Rate q" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            )}
            <UnitField kind="pressureAbs" system={unitSystem} label="Initial pressure pi" value={reservoirInputs.pi} onChange={(v) => setReservoirField('pi', v)} />
          </div>
          {isGas && (
            <p className="text-[11px] text-pl-muted">
              Analyses run in real-gas pseudo-pressure m(p). Gas viscosity and z come from the Lee-Gonzalez-Eakin and Papay correlations at reservoir temperature; leave ct blank to use the computed gas compressibility at pi.
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Rate history</SectionLabel>
        <div className="space-y-2">
          {rateRows.length === 0 && (
            <p className="text-[11px] text-pl-muted">Optional: step rate history for flow-period QC and equivalent producing time.</p>
          )}
          {rateRows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.t} onChange={(e) => setRate(i, 't', e.target.value)} placeholder="Start hr" className="h-8" />
              <Input value={displayInputString(rateKind, r.q, unitSystem)} onChange={(e) => setRate(i, 'q', e.target.value)} placeholder={unitLabel(rateKind, unitSystem)} className="h-8" />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-pl-muted" onClick={() => setRateRows(rateRows.filter((_, idx) => idx !== i))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="text-pl-muted" onClick={() => setRateRows([...rateRows, { t: '', q: '' }])}>
            <Plus className="w-4 h-4 mr-1" /> Add rate step
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Quality control</SectionLabel>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-pl-muted">Spike filter</Label>
            <Switch checked={!!testConfig.spikeTrimOn} onCheckedChange={(v) => setTestField('spikeTrimOn', v)} />
          </div>
          <Field label="Points per decade kept" value={testConfig.pointsPerDecade} onChange={(v) => setTestField('pointsPerDecade', v)} />
        </div>
      </section>
    </div>
  );
};

export default DataPanel;
