// Lab Data tab, left rail (SC4): core sample CRUD, rock/fluid properties
// with lab-system presets, and CSV import of kr and Pc tables per sample.
import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Upload, Download, Beaker } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useScalStudio, LAB_SYSTEM_PRESETS } from '@/contexts/ScalStudioContext';
import { parseKrCsv, parsePcCsv } from '@/utils/scalCalculations';
import { Field, SectionLabel } from '@/components/waterflooddesign/primitives';
import { buildDemoSamples, KR_CSV_TEMPLATE, PC_CSV_TEMPLATE } from './demoSamples';

const PROP_FIELDS = [
  { k: 'depth_ft', label: 'Depth (ft)' },
  { k: 'k_md', label: 'k — permeability (md)' },
  { k: 'phi', label: 'φ — porosity (frac)' },
  { k: 'sigma_dyncm', label: 'σ lab IFT (dyn/cm)' },
  { k: 'thetaDeg', label: 'θ lab contact angle (deg)' },
];

const downloadText = (text, filename) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const LabDataPanel = ({ selectedId, onSelect }) => {
  const {
    samples, addSample, updateSample, removeSample, setSamples, addNotification,
  } = useScalStudio();
  const krFileRef = useRef(null);
  const pcFileRef = useRef(null);
  const [importKind, setImportKind] = useState(null);
  const selected = samples.find((s) => s.id === selectedId) ?? null;

  const importCsv = async (file, kind) => {
    if (!file || !selected) return;
    const text = await file.text();
    const parsed = kind === 'kr' ? parseKrCsv(text) : parsePcCsv(text);
    if (parsed.rows.length === 0) {
      addNotification(parsed.errors[0] || 'No usable rows in that CSV.', 'error');
      return;
    }
    updateSample(selected.id, kind === 'kr' ? { krRows: parsed.rows } : { pcRows: parsed.rows });
    const note = parsed.errors.length ? ` ${parsed.errors.length} row(s) skipped.` : '';
    addNotification(`${parsed.rows.length} ${kind === 'kr' ? 'kr' : 'Pc'} rows imported for "${selected.name}".${note}`, 'success');
  };

  const applyPreset = (key) => {
    const preset = LAB_SYSTEM_PRESETS.find((p) => p.key === key);
    if (!preset || !selected) return;
    updateSample(selected.id, { sigma_dyncm: preset.sigma, thetaDeg: preset.theta });
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Core samples</SectionLabel>
        <div className="space-y-1.5">
          {samples.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer ${
                s.id === selectedId ? 'border-violet-500 bg-violet-500/10' : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
              }`}
              onClick={() => onSelect(s.id)}
            >
              <div className="text-xs text-slate-200 truncate">
                {s.name}
                <span className="text-slate-500 ml-1.5">
                  {s.krRows?.length ? `kr ${s.krRows.length}` : ''}{s.krRows?.length && s.pcRows?.length ? ' · ' : ''}{s.pcRows?.length ? `Pc ${s.pcRows.length}` : ''}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeSample(s.id); if (s.id === selectedId) onSelect(null); }}
                className="text-slate-500 hover:text-rose-400"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {samples.length === 0 && (
            <p className="text-xs text-slate-500">No samples yet. Add one, or load the synthetic demo pair.</p>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="h-8" onClick={() => onSelect(addSample())}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add sample
          </Button>
          <Button
            size="sm" variant="outline" className="h-8"
            onClick={() => {
              const demo = buildDemoSamples();
              setSamples((prev) => [...prev, ...demo.map((d, i) => ({ ...d, id: `demo-${Date.now()}-${i}` }))]);
              addNotification('Two synthetic demo cores loaded. They share one true J curve, so the Capillary tab shows the Leverett collapse.', 'info');
            }}
          >
            <Beaker className="w-3.5 h-3.5 mr-1" /> Demo pair
          </Button>
        </div>
      </section>

      {selected && (
        <>
          <section className="space-y-3">
            <SectionLabel>Sample properties</SectionLabel>
            <Field label="Name" value={selected.name} onChange={(v) => updateSample(selected.id, { name: v })} />
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Lab measurement system</Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Apply a preset (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {LAB_SYSTEM_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label} (σ {p.sigma}, θ {p.theta}°)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {PROP_FIELDS.map(({ k, label }) => (
              <Field key={k} label={label} value={selected[k] ?? ''} onChange={(v) => updateSample(selected.id, { [k]: v })} />
            ))}
          </section>

          <section className="space-y-2">
            <SectionLabel>Lab tables</SectionLabel>
            <input
              ref={krFileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { importCsv(e.target.files?.[0], 'kr'); e.target.value = ''; }}
            />
            <input
              ref={pcFileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { importCsv(e.target.files?.[0], 'pc'); e.target.value = ''; }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => krFileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1" /> kr CSV
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => pcFileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Pc CSV
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadText(KR_CSV_TEMPLATE, 'scal-kr-template.csv')}>
                <Download className="w-3 h-3 mr-1" /> kr template
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadText(PC_CSV_TEMPLATE, 'scal-pc-template.csv')}>
                <Download className="w-3 h-3 mr-1" /> Pc template
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              kr columns: Sw, krw, kro. Pc columns: Sw, Pc_psi. Rows with non-numeric cells are skipped and named
              in the notification.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default LabDataPanel;
