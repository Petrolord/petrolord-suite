// Left rail for the Data tab: test setup, unit system, reservoir and fluid
// properties, gauge CSV import, rate history editor and the deterministic
// sample test. All state is oilfield units; the unit system converts at the
// display layer (see utils/welltest/units.js).
import React, { useRef } from 'react';
import Papa from 'papaparse';
import { Upload, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, toOilfield, displayInputString, storeInputString } from '@/utils/welltest/units';
import { SectionLabel, Field, UnitField } from './primitives';

// Accept the first two numeric columns as (time hr, pressure in the active
// display system); pressures are converted to oilfield psi before they reach
// state.
export function parseGaugeCsv(text, { unitSystem = 'oilfield' } = {}) {
  const { data } = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = [];
  for (const raw of data) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const t = parseFloat(raw[0]);
    const p = parseFloat(raw[1]);
    if (Number.isFinite(t) && Number.isFinite(p) && t > 0) {
      rows.push({ t, p: toOilfield('pressure', p, unitSystem) });
    }
  }
  return rows;
}

const DataPanel = () => {
  const {
    wellName, setWellName,
    reservoirInputs, setReservoirField,
    testConfig, setTestField,
    gaugeRows, setGaugeRows,
    rateRows, setRateRows,
    addNotification, loadSampleTest,
    unitSystem, setUnitSystem,
  } = useWellTestStudio();
  const fileRef = useRef(null);
  const isGas = reservoirInputs.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseGaugeCsv(String(ev.target.result || ''), { unitSystem });
      if (rows.length < 5) {
        addNotification(`Could not read at least 5 (time, pressure) rows from the file. Expected two numeric columns: elapsed hours, pressure ${unitLabel('pressure', unitSystem)}.`, 'error');
        return;
      }
      setGaugeRows(rows);
      addNotification(`Loaded ${rows.length} gauge points from ${file.name}.`, 'success');
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
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Unit system</Label>
            <Select value={unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield (psi, ft, STB/D)</SelectItem>
                <SelectItem value="si">SI / metric (kPa, m, m3/d)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Test type</Label>
            <Select value={testConfig.testType} onValueChange={(v) => setTestField('testType', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buildup">Pressure buildup</SelectItem>
                <SelectItem value="drawdown">Pressure drawdown</SelectItem>
                <SelectItem value="injection">Injection test</SelectItem>
                <SelectItem value="falloff">Injection falloff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(testConfig.testType === 'buildup' || testConfig.testType === 'falloff') && (
            <>
              <Field label={testConfig.testType === 'falloff' ? 'Injection time tp' : 'Producing time tp'} suffix="hr" value={testConfig.tp} onChange={(v) => setTestField('tp', v)} />
              <UnitField
                kind="pressure" system={unitSystem}
                label={testConfig.testType === 'falloff' ? 'Injection pressure at shut-in' : 'Flowing pressure at shut-in'}
                suffixNote="blank = from data"
                value={testConfig.pwfShutIn} onChange={(v) => setTestField('pwfShutIn', v)}
              />
            </>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Gauge data</SectionLabel>
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={onFile} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 border-slate-700" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" className="border-slate-700" onClick={loadSampleTest} title="Load a synthetic sample buildup">
              <FlaskConical className="w-4 h-4 mr-1" /> Sample
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Two numeric columns: elapsed time in hours ({testConfig.testType === 'buildup' || testConfig.testType === 'falloff' ? 'shut-in time' : 'flowing time'}) and gauge pressure in {unitLabel('pressure', unitSystem)}.
            {gaugeRows.length ? ` Loaded: ${gaugeRows.length} points.` : ' No data loaded yet.'}
          </p>
        </div>
      </section>

      <section>
        <SectionLabel>Reservoir and fluid</SectionLabel>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Fluid</Label>
            <Select value={reservoirInputs.fluid || 'oil'} onValueChange={(v) => setReservoirField('fluid', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
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
            <p className="text-[11px] text-slate-500">
              Analyses run in real-gas pseudo-pressure m(p). Gas viscosity and z come from the Lee-Gonzalez-Eakin and Papay correlations at reservoir temperature; leave ct blank to use the computed gas compressibility at pi.
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Rate history</SectionLabel>
        <div className="space-y-2">
          {rateRows.length === 0 && (
            <p className="text-[11px] text-slate-500">Optional: step rate history for flow-period QC and equivalent producing time.</p>
          )}
          {rateRows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.t} onChange={(e) => setRate(i, 't', e.target.value)} placeholder="Start hr" className="h-8 bg-slate-800 border-slate-700" />
              <Input value={displayInputString(rateKind, r.q, unitSystem)} onChange={(e) => setRate(i, 'q', e.target.value)} placeholder={unitLabel(rateKind, unitSystem)} className="h-8 bg-slate-800 border-slate-700" />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-slate-500" onClick={() => setRateRows(rateRows.filter((_, idx) => idx !== i))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setRateRows([...rateRows, { t: '', q: '' }])}>
            <Plus className="w-4 h-4 mr-1" /> Add rate step
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Quality control</SectionLabel>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Spike filter</Label>
            <Switch checked={!!testConfig.spikeTrimOn} onCheckedChange={(v) => setTestField('spikeTrimOn', v)} />
          </div>
          <Field label="Points per decade kept" value={testConfig.pointsPerDecade} onChange={(v) => setTestField('pointsPerDecade', v)} />
        </div>
      </section>
    </div>
  );
};

export default DataPanel;
