// Left-rail inputs for the Surveillance tab (W6, absorbed from the retired
// Waterflood Dashboard): field history CSV import, engine config, sample
// data. All analytics come from the pure, jest-tested analyzeWaterflood
// engine; results recompute on any change.
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Beaker, Upload, Trash2, Download } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { parseWaterfloodCSVDetailed, sampleWaterfloodRows, sampleWaterfloodCSV } from '@/utils/waterfloodCalculations';
import { Field, UField, SectionLabel } from './primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PvtIntakePanel from './PvtIntakePanel';

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
    addNotification, u,
  } = useWaterfloodDesign();
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { rows, mapped, unrecognised } = parseWaterfloodCSVDetailed(ev.target.result);
        if (!rows.length) throw new Error('No data rows found in the file.');
        setSurveillanceRows(rows);
        const read = mapped.length ? ` Read ${mapped.map(([h, c]) => `${h} as ${c}`).join(', ')}.` : '';
        const skipped = unrecognised.length ? ` Ignored: ${unrecognised.join(', ')}.` : '';
        addNotification(`Loaded ${rows.length.toLocaleString()} rows from ${file.name}.${read}${skipped}`, 'success');
      } catch (err) {
        addNotification(err.message || 'Could not parse the CSV', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadSample = () => {
    setSurveillanceRows(sampleWaterfloodRows());
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
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
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
          {surveillanceRows.length > 0 && (
            <div className="flex items-center justify-between text-xs text-pl-muted pt-1">
              <span>{surveillanceRows.length.toLocaleString()} rows loaded</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-pl-muted hover:text-pl-danger-text" onClick={() => setSurveillanceRows([])}>
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          )}
        </div>
        <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
          Columns: date, well, oil_bbl, water_bbl, gas_mcf, inj_bbl, and optionally whp_psi (enables Hall plot
          injectivity diagnostics). Wells with non-zero inj_bbl classify as injectors.
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
