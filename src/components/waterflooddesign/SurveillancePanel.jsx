// Left-rail inputs for the Surveillance tab (W6, absorbed from the retired
// Waterflood Dashboard): field history CSV import, engine config, sample
// data. All analytics come from the pure, jest-tested analyzeWaterflood
// engine; results recompute on any change.
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Beaker, Upload, Trash2, Download } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { sampleWaterfloodRows, sampleWaterfloodCSV } from '@/utils/waterfloodCalculations';
import { readSurveillanceTable, readBackLines, DOOR_PRESSURE_UNITS } from '@/utils/waterflooddesign/surveillanceImport';
import { Field, UField, SectionLabel } from './primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PvtIntakePanel from './PvtIntakePanel';
import VrrIntakePanel from './VrrIntakePanel';
import FvfTrackPanel from './FvfTrackPanel';

const FLUID_FIELDS = [
  { k: 'bo', label: 'Bo', kind: 'fvfOil' },
  { k: 'bw', label: 'Bw', kind: 'fvfOil' },
  // RB/Mscf in storage: the VRR core (engines/waterflood/vrr.js) takes
  // Gp in Mscf and Bg in RB/Mscf.
  { k: 'bg', label: 'Bg', kind: 'fvfGas' },
  { k: 'rs', label: 'Rs', kind: 'gor' },
];
const WINDOW_FIELDS = [
  { k: 'smooth_window_days', label: 'Smoothing', kind: 'days' },
  { k: 'vrr_window_days', label: 'VRR window (calendar days)', kind: 'days' },
  { k: 'target_vrr', label: 'Target VRR', kind: 'dimensionless' },
];

const SurveillancePanel = () => {
  const {
    surveillanceRows, setSurveillanceRows,
    surveillanceConfig, setSurveillanceField,
    addNotification, u, surveillanceImport, setSurveillanceImport,
  } = useWaterfloodDesign();
  const fileRef = useRef(null);
  // WF-U1 import door: units chosen at the door for columns whose header
  // names none, and a pending file while a question (date order, decimal
  // mark) waits for an answer
  const [rateSystem, setRateSystem] = React.useState(u.system);
  const [pressureUnit, setPressureUnit] = React.useState(u.system === 'si' ? 'kPa' : 'psi');
  const [pending, setPending] = React.useState(null);

  const runDoor = (text, fileName, answers = {}) => {
    const res = readSurveillanceTable(text, { fileName, rateSystem, pressureUnit, ...answers });
    if (res.needsAnswer) { setPending({ text, fileName, questions: res.questions, answers }); return; }
    setPending(null);
    if (!res.ok) { addNotification(res.errors[0] || 'Could not read the file', 'error'); return; }
    setSurveillanceRows(res.rows);
    setSurveillanceImport({ ...res.readBack, readAt: new Date().toISOString() });
    addNotification(readBackLines(res.readBack)[0], 'success');
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => runDoor(String(ev.target.result || ''), file.name);
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadSample = () => {
    setSurveillanceRows(sampleWaterfloodRows());
    setSurveillanceImport({ fileName: 'Sample field history (synthetic, built into the app)', sample: true, readAt: new Date().toISOString() });
    addNotification('Sample field history loaded', 'info');
  };

  const downloadTemplate = () => {
    const blob = new Blob([sampleWaterfloodCSV()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'waterflood_surveillance_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Field history</SectionLabel>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={onFile} data-testid="wds-surveillance-file" />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-pl-muted">Rates in the file (no unit in header)</Label>
            <select data-testid="wds-door-rates" value={rateSystem} onChange={(e) => setRateSystem(e.target.value)} className="h-8 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text">
              <option value="oilfield">STB/d, bbl/d, Mscf/d</option>
              <option value="si">m3/d (gas sm3/d)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-pl-muted">Pressure in the file</Label>
            <select data-testid="wds-door-pressure" value={pressureUnit} onChange={(e) => setPressureUnit(e.target.value)} className="h-8 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text">
              {DOOR_PRESSURE_UNITS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="w-full">
            <Upload className="w-4 h-4 mr-1" /> Import CSV
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}>
              <Beaker className="w-4 h-4 mr-1" /> Sample
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-1" /> Template
            </Button>
          </div>
          <VrrIntakePanel />
          {surveillanceRows.length > 0 && (
            <div className="flex items-center justify-between text-xs text-pl-muted pt-1">
              <span>{surveillanceRows.length.toLocaleString()} rows loaded</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-pl-muted hover:text-pl-danger-text" onClick={() => { setSurveillanceRows([]); setSurveillanceImport(null); }}>
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          )}
        </div>
        {pending && (
          <div className="mt-2 rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2 text-xs text-pl-warning-text space-y-2" data-testid="wds-door-question">
            {pending.questions.map((q) => (
              <div key={`${q.kind}-${q.column ?? ''}`} className="space-y-1">
                <p>{q.text}</p>
                {q.kind === 'dateOrder' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => runDoor(pending.text, pending.fileName, { ...pending.answers, dateOrder: 'dmy' })}>Day first</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => runDoor(pending.text, pending.fileName, { ...pending.answers, dateOrder: 'mdy' })}>Month first</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => runDoor(pending.text, pending.fileName, { ...pending.answers, decimal: ',' })}>Decimal comma</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => runDoor(pending.text, pending.fileName, { ...pending.answers, decimal: '.' })}>Thousands comma</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {surveillanceImport && !surveillanceImport.sample && surveillanceRows.length > 0 && (
          <ul className="mt-2 rounded-md border border-pl-border bg-pl-sunken p-2 text-[11px] text-pl-text space-y-1" data-testid="wds-door-readback">
            {readBackLines(surveillanceImport).map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
          Columns are found by header in any order: date, well, daily oil, water and gas rates, water injection rate,
          and optionally the injection pressure (enables the Hall plot). A unit in the header ("Oil rate (sm3/d)",
          "Pressure (kPa)") wins over the choice above. Dates may be ISO, day first or month first; when the file
          cannot tell, you are asked. Decimal commas are read. Volumes and cumulatives are refused: the engine reads
          daily rates. Wells with injection classify as injectors.
        </Label>
      </section>

      <section>
        <SectionLabel>Analysis window</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date (optional)" value={surveillanceConfig.start_date} onChange={(v) => setSurveillanceField('start_date', v)} placeholder="YYYY-MM-DD" />
          <Field label="End date (optional)" value={surveillanceConfig.end_date} onChange={(v) => setSurveillanceField('end_date', v)} placeholder="YYYY-MM-DD" />
        </div>
      </section>

      <section>
        <SectionLabel>Fluid properties</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {FLUID_FIELDS.map((f) => <UField key={f.k} label={f.label} kind={f.kind} u={u} testId={`wds-s-${f.k}`} value={surveillanceConfig[f.k]} onChange={(v) => setSurveillanceField(f.k, v)} />)}
        </div>
        <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
          Voidage is in reservoir barrels: oil x Bo, water x Bw, free gas (produced gas less Rs x oil) x Bg, against
          injected water x Bw. Bo and Bw are reservoir barrels per stock-tank barrel at the reservoir pressure of the
          period; one value serves the whole history. Bg and Rs feed the free-gas term; set Bg to 0 for liquid-only voidage.
        </Label>
      </section>

      <PvtIntakePanel target="surveillance" />

      <FvfTrackPanel />

      <section data-testid="wds-pressure-basis">
        <SectionLabel>Injection pressure basis</SectionLabel>
        <Tabs value={surveillanceConfig.pressure_basis === 'bottomhole' ? 'bottomhole' : 'wellhead'} onValueChange={(v) => setSurveillanceField('pressure_basis', v)}>
          <TabsList className="h-8 p-0.5 w-full">
            <TabsTrigger value="wellhead" className="h-7 text-xs flex-1">Wellhead (WHP)</TabsTrigger>
            <TabsTrigger value="bottomhole" className="h-7 text-xs flex-1">Bottomhole (BHP)</TabsTrigger>
          </TabsList>
        </Tabs>
        <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
          What the pressure column of the file holds. The Hall plot integrates it as given: no hydrostatic head,
          friction or reservoir pressure is added or subtracted, and the report says which it was.
        </Label>
      </section>

      <section>
        <SectionLabel>Diagnostics</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {WINDOW_FIELDS.map((f) => <UField key={f.k} label={f.label} kind={f.kind} u={u} value={surveillanceConfig[f.k]} onChange={(v) => setSurveillanceField(f.k, v)} />)}
        </div>
      </section>
    </div>
  );
};

export default SurveillancePanel;
