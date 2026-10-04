// Left rail for the Data tab: test setup, unit system, reservoir and fluid
// properties, gauge CSV import, rate history editor and the deterministic
// sample test. All state is oilfield units; the unit system converts at the
// display layer (see utils/welltest/units.js). The gauge import finds the
// time and pressure columns from the headers and converts the file's units
// (utils/welltest/gaugeImport.js).
import React, { useRef, useState } from 'react';
import ProjectUnitSystemNote from '@/components/units/ProjectUnitSystemNote';
import { Upload, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, displayInputString, storeInputString } from '@/utils/welltest/units';
import {
  readGaugeTable, detectGaugeMapping, convertGaugeRows, PRESSURE_UNITS, TIME_UNITS, TEMPERATURE_UNITS, PWF_SOURCE_TEXT, gaugeTime,
} from '@/utils/welltest/gaugeImport';
import { SectionLabel, Field, UnitField, fmt, valueWithUnit } from './primitives';
import { IdentificationFields, CompletionFields, InputSourcesFields } from './ReportInputsFields';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { readFluidProjectPvt } from '@/lib/pvtSource';
import { WELLTEST_PVT_FIELDS } from '@/utils/welltest/reportModel';

const defaultPressureUnit = (unitSystem) => (unitSystem === 'si' ? 'kpaa' : 'psia');
const defaultTemperatureUnit = (unitSystem) => (unitSystem === 'si' ? 'degC' : 'degF');

// Import a gauge file with automatic column and unit detection; rows come
// back oilfield (hr, psia).
export function parseGaugeCsv(text, { unitSystem = 'oilfield', mapping } = {}) {
  const table = readGaugeTable(text);
  const m = { ...detectGaugeMapping(table, { defaultPressure: defaultPressureUnit(unitSystem), defaultTemperature: defaultTemperatureUnit(unitSystem) }), ...(mapping || {}) };
  return convertGaugeRows(table, m).rows;
}

const columnName = (table, i) => table.headers?.[i] || `Column ${i + 1}`;

// Column and unit choices for the file just imported. Every change
// re-converts the file, so a wrong guess is one click to correct.
const ImportMapping = ({ imported, onChange }) => {
  const { table, mapping, fileName, skipped, count, temperatureCount } = imported;
  const cols = Array.from({ length: table.columnCount }, (_, i) => i);
  const set = (k, v) => onChange({ ...mapping, [k]: v });
  const detected = [];
  if (mapping.detectedFrom?.time) detected.push('time');
  if (mapping.detectedFrom?.pressure) detected.push('pressure');
  return (
    <div className="rounded-md border border-pl-border p-3 space-y-2" data-testid="wts-import-mapping">
      <p className="text-[11px] text-pl-muted">
        <span className="text-pl-text font-medium">{fileName}</span>: {count} readings loaded{skipped ? `, ${skipped} rows skipped` : ''}{mapping.temperatureCol >= 0 ? `, ${temperatureCount ?? 0} with a temperature` : ''}.
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
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Temperature column</Label>
          <Select value={String(mapping.temperatureCol ?? -1)} onValueChange={(v) => set('temperatureCol', Number(v))}>
            <SelectTrigger className="h-8" aria-label="Temperature column"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="-1">None</SelectItem>
              {cols.map((i) => <SelectItem key={i} value={String(i)}>{columnName(table, i)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Temperature unit</Label>
          <Select value={mapping.temperatureUnit || 'degF'} onValueChange={(v) => set('temperatureUnit', v)} disabled={!(mapping.temperatureCol >= 0)}>
            <SelectTrigger className="h-8" aria-label="Temperature unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPERATURE_UNITS).map(([k, u]) => <SelectItem key={k} value={k}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-pl-muted">
        {mapping.temperatureCol >= 0
          ? 'The temperature column is plotted on the test overview. '
          : 'No temperature column was found from the headers; pick one above if the file has it. '}
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
    unitSystem, setUnitSystem, profileUnitSystem, reservoirSpec,
    pvtIntake,
  } = useWellTestStudio();
  const fileRef = useRef(null);
  // the file just imported, held so its column/unit mapping can be changed
  const [imported, setImported] = useState(null);
  const isGas = reservoirInputs.fluid === 'gas';
  const ctComponents = reservoirInputs.ctMode === 'components';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  const isBuildupFamily = testConfig.testType === 'buildup' || testConfig.testType === 'falloff';

  const applyImport = (table, mapping, fileName, announce) => {
    const { rows, skipped, temperatureCount } = convertGaugeRows(table, mapping);
    if (rows.length < 5) {
      addNotification(`Could not read at least 5 (time, pressure) readings with the ${columnName(table, mapping.timeCol)} and ${columnName(table, mapping.pressureCol)} columns. Pick the time and pressure columns below.`, 'error');
      setImported({ table, mapping, fileName, skipped, count: rows.length, temperatureCount });
      return;
    }
    setGaugeRows(rows);
    setImported({ table, mapping, fileName, skipped, count: rows.length, temperatureCount });
    if (announce) {
      const pu = PRESSURE_UNITS[mapping.pressureUnit]?.label;
      const tu = TIME_UNITS[mapping.timeUnit]?.label;
      const temp = mapping.temperatureCol >= 0 ? `, temperature in ${TEMPERATURE_UNITS[mapping.temperatureUnit]?.label || 'degF'}` : '';
      addNotification(`Loaded ${rows.length} gauge points from ${fileName} (time in ${tu}, pressure in ${pu}${temp}).`, 'success');
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
      const mapping = detectGaugeMapping(table, { defaultPressure: defaultPressureUnit(unitSystem), defaultTemperature: defaultTemperatureUnit(unitSystem) });
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
          <IdentificationFields />
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Unit system</Label>
            <Select value={unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield (psi, ft, STB/D)</SelectItem>
                <SelectItem value="si">SI / metric (kPa, m, m3/d)</SelectItem>
              </SelectContent>
            </Select>
            <ProjectUnitSystemNote system={unitSystem} profileSystem={profileUnitSystem} />
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
            A time column and a pressure column, in any order: headers such as Time (hr), Elapsed (min), Date, Pressure (psig) or BHP (kPa) are recognised, and the units can be changed after import. A temperature column (Temperature, Temp, BHT, in degF or degC) is read too when the file has one.
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
          {/* FLUID-U2-005: the shared card of the PVT taken from Fluid Systems Studio (display only; the report is unchanged) */}
          {pvtIntake && <PvtIntakeCard intake={pvtIntake} current={reservoirInputs} fields={WELLTEST_PVT_FIELDS} readLatest={readFluidProjectPvt} />}
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
                {!ctComponents && <UnitField kind="compressibility" system={unitSystem} label="Total ct" suffixNote="blank = cg(pi)" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />}
                <UnitField kind="gasRate" system={unitSystem} label="Rate q" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            ) : (
              <>
                {!ctComponents && <UnitField kind="compressibility" system={unitSystem} label="Total ct" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />}
                <UnitField kind="fvf" system={unitSystem} label="Oil FVF B" value={reservoirInputs.B} onChange={(v) => setReservoirField('B', v)} />
                <UnitField kind="viscosity" system={unitSystem} label="Viscosity" value={reservoirInputs.mu} onChange={(v) => setReservoirField('mu', v)} />
                <UnitField kind="oilRate" system={unitSystem} label="Rate q" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            )}
            <UnitField kind="pressureAbs" system={unitSystem} label="Initial pressure pi" value={reservoirInputs.pi} onChange={(v) => setReservoirField('pi', v)} />
            {ctComponents
              ? <Field label="Water saturation Sw" suffix="frac" value={reservoirInputs.sw ?? ''} onChange={(v) => setReservoirField('sw', v)} />
              : <Field label="Water saturation Sw" suffix="frac, optional" value={reservoirInputs.sw ?? ''} onChange={(v) => setReservoirField('sw', v)} />}
            {!isGas && (
              <>
                <Field label="API gravity" suffix="degAPI, optional" value={reservoirInputs.apiGravity ?? ''} onChange={(v) => setReservoirField('apiGravity', v)} />
                <UnitField kind="gor" system={unitSystem} label="Solution GOR" suffixNote="optional" value={reservoirInputs.gor ?? ''} onChange={(v) => setReservoirField('gor', v)} />
                <Field label="Gas gravity" suffix="air = 1, optional" value={reservoirInputs.solutionGasGravity ?? ''} onChange={(v) => setReservoirField('solutionGasGravity', v)} />
                <UnitField kind="temperature" system={unitSystem} label="Reservoir temperature" suffixNote="optional" value={reservoirInputs.reservoirTempF ?? ''} onChange={(v) => setReservoirField('reservoirTempF', v)} />
              </>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Total compressibility ct</Label>
            <Select value={ctComponents ? 'components' : 'total'} onValueChange={(v) => setReservoirField('ctMode', v)}>
              <SelectTrigger className="h-9" aria-label="Total compressibility entry"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Entered as total</SelectItem>
                <SelectItem value="components">Built from components</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ctComponents && (
            <div className="space-y-2" data-testid="wts-ct-components">
              <div className="grid grid-cols-2 gap-3">
                <UnitField kind="compressibility" system={unitSystem} label="Formation cf" value={reservoirInputs.cf ?? ''} onChange={(v) => setReservoirField('cf', v)} />
                <span />
                <Field label="Oil saturation So" suffix="frac" value={reservoirInputs.so ?? ''} onChange={(v) => setReservoirField('so', v)} />
                <UnitField kind="compressibility" system={unitSystem} label="Oil co" value={reservoirInputs.co ?? ''} onChange={(v) => setReservoirField('co', v)} />
                <p className="text-xs text-pl-muted self-end pb-2">Sw {reservoirInputs.sw || 'not entered'} (the field above)</p>
                <UnitField kind="compressibility" system={unitSystem} label="Water cw" value={reservoirInputs.cw ?? ''} onChange={(v) => setReservoirField('cw', v)} />
                <Field label="Gas saturation Sg" suffix="frac" value={reservoirInputs.sg ?? ''} onChange={(v) => setReservoirField('sg', v)} />
                <UnitField kind="compressibility" system={unitSystem} label="Gas cg" suffixNote={isGas ? 'blank = cg(pi)' : undefined} value={reservoirInputs.cg ?? ''} onChange={(v) => setReservoirField('cg', v)} />
              </div>
              <p className="text-[11px] text-pl-muted" data-testid="wts-ct-readout">
                {reservoirSpec.ctInfo?.breakdown
                  ? `ct = cf + So co + Sw cw + Sg cg = ${valueWithUnit('compressibility', reservoirSpec.ctInfo.ct, unitSystem, fmt.sci)}. The analysis uses this value.`
                  : (reservoirSpec.ctInfo?.error || 'Enter cf and each saturation with its compressibility; the saturations must sum to 1.')}
              </p>
            </div>
          )}
          {isGas && (
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Gas z-factor</Label>
              <Select value={reservoirInputs.gasZMethod || 'papay'} onValueChange={(v) => setReservoirField('gasZMethod', v)}>
                <SelectTrigger className="h-9" aria-label="Gas z-factor method" data-testid="wts-z-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dranchuk_abou_kassem">Dranchuk-Abou-Kassem (default)</SelectItem>
                  <SelectItem value="hall_yarborough">Hall-Yarborough</SelectItem>
                  <SelectItem value="papay">Papay (projects saved before 2026-10-04)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-pl-muted" data-testid="wts-z-note">
                Analyses run in real-gas pseudo-pressure m(p). z comes from {reservoirInputs.gasZMethod === 'hall_yarborough' ? 'Hall-Yarborough' : reservoirInputs.gasZMethod === 'dranchuk_abou_kassem' ? 'Dranchuk-Abou-Kassem' : 'Papay'} with Sutton pseudo-criticals and the viscosity from Lee-Gonzalez-Eakin, at reservoir temperature; leave ct blank to use the computed gas compressibility at pi.
                {(reservoirInputs.gasZMethod || 'papay') === 'papay' && ' Papay is kept so a project interpreted with it reproduces its numbers; Dranchuk-Abou-Kassem, the Fluid Systems Studio default, holds the Standing-Katz chart more closely at high pressure.'}
              </p>
            </div>
          )}
        </div>
      </section>

      <CompletionFields />

      <InputSourcesFields />

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
