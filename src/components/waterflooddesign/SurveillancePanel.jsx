// Left-rail inputs for the Surveillance tab (W6, absorbed from the retired
// Waterflood Dashboard): field history CSV import, engine config, sample
// data. All analytics come from the pure, jest-tested analyzeWaterflood
// engine; results recompute on any change.
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Beaker, Upload, Trash2, Download } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { parseWaterfloodCSV, sampleWaterfloodRows, sampleWaterfloodCSV } from '@/utils/waterfloodCalculations';
import { Field, SectionLabel } from './primitives';

const FLUID_FIELDS = [
  { k: 'bo', label: 'Bo (rb/stb)' },
  { k: 'bw', label: 'Bw (rb/stb)' },
  { k: 'bg', label: 'Bg (rb/scf)' },
  { k: 'rs', label: 'Rs (scf/stb)' },
];
const WINDOW_FIELDS = [
  { k: 'smooth_window_days', label: 'Smoothing (days)' },
  { k: 'vrr_window_days', label: 'VRR window (days)' },
  { k: 'target_vrr', label: 'Target VRR' },
];

const SurveillancePanel = () => {
  const {
    surveillanceRows, setSurveillanceRows,
    surveillanceConfig, setSurveillanceField,
    addNotification,
  } = useWaterfloodDesign();
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseWaterfloodCSV(ev.target.result);
        if (!rows.length) throw new Error('No data rows found in the file.');
        setSurveillanceRows(rows);
        addNotification(`Loaded ${rows.length.toLocaleString()} rows from ${file.name}`, 'success');
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
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="w-full bg-slate-800 border-slate-700">
            <Upload className="w-4 h-4 mr-1" /> Import CSV
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={loadSample} className="bg-slate-800 border-slate-700">
              <Beaker className="w-4 h-4 mr-1" /> Sample
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="bg-slate-800 border-slate-700">
              <Download className="w-4 h-4 mr-1" /> Template
            </Button>
          </div>
          {surveillanceRows.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span>{surveillanceRows.length.toLocaleString()} rows loaded</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-slate-500 hover:text-red-400" onClick={() => setSurveillanceRows([])}>
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          )}
        </div>
        <Label className="text-[11px] text-slate-500 leading-snug block mt-2">
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
          {FLUID_FIELDS.map((f) => <Field key={f.k} label={f.label} value={surveillanceConfig[f.k]} onChange={(v) => setSurveillanceField(f.k, v)} />)}
        </div>
        <Label className="text-[11px] text-slate-500 leading-snug block mt-2">
          Bg and Rs feed free-gas voidage in the reservoir-barrel VRR. Set Bg to 0 for liquid-only voidage.
        </Label>
      </section>

      <section>
        <SectionLabel>Diagnostics</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {WINDOW_FIELDS.map((f) => <Field key={f.k} label={f.label} value={surveillanceConfig[f.k]} onChange={(v) => setSurveillanceField(f.k, v)} />)}
        </div>
      </section>
    </div>
  );
};

export default SurveillancePanel;
