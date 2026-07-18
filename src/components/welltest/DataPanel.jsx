// Left rail for the Data tab: test setup, reservoir and fluid properties,
// gauge CSV import, rate history editor and the deterministic sample test.
import React, { useRef } from 'react';
import Papa from 'papaparse';
import { Upload, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, Field } from './primitives';

// Accept the first two numeric columns as (time hr, pressure psi); headers
// are optional and flexible.
export function parseGaugeCsv(text) {
  const { data } = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = [];
  for (const raw of data) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const t = parseFloat(raw[0]);
    const p = parseFloat(raw[1]);
    if (Number.isFinite(t) && Number.isFinite(p) && t > 0) rows.push({ t, p });
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
  } = useWellTestStudio();
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseGaugeCsv(String(ev.target.result || ''));
      if (rows.length < 5) {
        addNotification('Could not read at least 5 (time, pressure) rows from the file. Expected two numeric columns: elapsed hours, pressure psi.', 'error');
        return;
      }
      setGaugeRows(rows);
      addNotification(`Loaded ${rows.length} gauge points from ${file.name}.`, 'success');
    };
    reader.onerror = () => addNotification('Could not read the file', 'error');
    reader.readAsText(file);
  };

  const setRate = (i, key, v) => setRateRows(rateRows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Test setup</SectionLabel>
        <div className="space-y-3">
          <Field label="Well name" value={wellName} onChange={setWellName} placeholder="Optional" />
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
              <Field label={testConfig.testType === 'falloff' ? 'Injection pressure at shut-in' : 'Flowing pressure at shut-in'} suffix="psi, blank = from data" value={testConfig.pwfShutIn} onChange={(v) => setTestField('pwfShutIn', v)} />
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
            Two numeric columns: elapsed time in hours ({testConfig.testType === 'buildup' || testConfig.testType === 'falloff' ? 'shut-in time' : 'flowing time'}) and gauge pressure in psi.
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
            <Field label="Net thickness h" suffix="ft" value={reservoirInputs.h} onChange={(v) => setReservoirField('h', v)} />
            <Field label="Porosity" suffix="frac" value={reservoirInputs.phi} onChange={(v) => setReservoirField('phi', v)} />
            <Field label="Wellbore radius rw" suffix="ft" value={reservoirInputs.rw} onChange={(v) => setReservoirField('rw', v)} />
            {reservoirInputs.fluid === 'gas' ? (
              <>
                <Field label="Gas gravity" suffix="air = 1" value={reservoirInputs.gasGravity} onChange={(v) => setReservoirField('gasGravity', v)} />
                <Field label="Temperature" suffix="degF" value={reservoirInputs.tempF} onChange={(v) => setReservoirField('tempF', v)} />
                <Field label="Total ct" suffix="1/psi, blank = cg(pi)" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />
                <Field label="Rate q" suffix="Mscf/D" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            ) : (
              <>
                <Field label="Total ct" suffix="1/psi" value={reservoirInputs.ct} onChange={(v) => setReservoirField('ct', v)} />
                <Field label="Oil FVF B" suffix="RB/STB" value={reservoirInputs.B} onChange={(v) => setReservoirField('B', v)} />
                <Field label="Viscosity" suffix="cp" value={reservoirInputs.mu} onChange={(v) => setReservoirField('mu', v)} />
                <Field label="Rate q" suffix="STB/D" value={reservoirInputs.q} onChange={(v) => setReservoirField('q', v)} />
              </>
            )}
            <Field label="Initial pressure pi" suffix="psia" value={reservoirInputs.pi} onChange={(v) => setReservoirField('pi', v)} />
          </div>
          {reservoirInputs.fluid === 'gas' && (
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
              <Input value={r.q} onChange={(e) => setRate(i, 'q', e.target.value)} placeholder={reservoirInputs.fluid === 'gas' ? 'Mscf/D' : 'STB/D'} className="h-8 bg-slate-800 border-slate-700" />
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
