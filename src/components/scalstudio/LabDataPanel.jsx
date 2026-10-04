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
import { readLabFile, importRecord, PC_FILE_UNITS, SATURATION_FILE_UNITS } from '@/utils/scalstudio/labImport';
import { readTabularFile } from '@/lib/tabularFile';
import { SectionLabel } from '@/components/waterflooddesign/primitives';
import ScalField from './ScalField';
import { PEDIGREE_OPTIONS, LAB_SYSTEM_FLUIDS } from '@/utils/scalstudio/model';
import { buildDemoSamples, KR_CSV_TEMPLATE, PC_CSV_TEMPLATE, GO_CSV_TEMPLATE } from './demoSamples';

const PROP_FIELDS = [
  { k: 'depth_ft', label: 'Sample depth', kind: 'length' },
  { k: 'k_md', label: 'k, permeability', kind: 'permeability' },
  { k: 'phi', label: 'φ, porosity', kind: 'fraction' },
  { k: 'sigma_dyncm', label: 'σ lab IFT', kind: 'ift' },
  { k: 'thetaDeg', label: 'θ lab contact angle', kind: 'angle' },
];

// The sample pedigree (SCAL-U1, RL4): what a reviewer asks of a core result
// before trusting it. Saved on the sample; printed in the report and carried
// in the kr-1 block.
const PEDIGREE_SELECTS = [
  { k: 'origin', label: 'Lab or analog', list: 'origin' },
  { k: 'depthRef', label: 'Depth reference', list: 'depthRef' },
  { k: 'krMethod', label: 'kr test method', list: 'krMethod' },
  { k: 'krProcess', label: 'kr test: drainage or imbibition', list: 'process' },
  { k: 'pcMethod', label: 'Pc test method', list: 'pcMethod' },
  { k: 'pcProcess', label: 'Pc test: drainage or imbibition', list: 'process' },
  { k: 'wettability', label: 'Wettability', list: 'wettability' },
  { k: 'condition', label: 'Core condition', list: 'condition' },
];
const NONE = '__none__';

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
  const goFileRef = useRef(null);
  const [importKind, setImportKind] = useState(null);
  const selected = samples.find((s) => s.id === selectedId) ?? null;

  // SCAL-U1-007: the lab table doors on the shared typed reader, the unit of
  // Pc and of Sw chosen at the door when the file does not say, and a
  // read-back kept with the sample (columns, units, rows read, rows left out).
  const { unitSystem } = useScalStudio();
  const [pcUnit, setPcUnit] = useState(unitSystem === 'si' ? 'kPa' : 'psi');
  const [satUnit, setSatUnit] = useState('auto');
  const importCsv = async (file, kind) => {
    if (!file || !selected) return;
    // SCAL-U2-011: text files and Excel workbooks through the shared reader
    let loaded;
    try {
      loaded = await readTabularFile(file);
    } catch (e) {
      addNotification(`${file.name}: ${e.message}`, 'error');
      return;
    }
    const res = readLabFile(loaded, kind, kind === 'pc' ? { pc: pcUnit, saturation: satUnit } : { saturation: satUnit });
    if (!res.ok) {
      addNotification(`${file.name}: ${res.error} ${res.summary || ''}`.trim(), 'error');
      return;
    }
    const record = { ...importRecord(res, file.name), ...(res.sheet ? { sheet: res.sheet } : {}) };
    updateSample(selected.id, kind === 'kr' ? { krRows: res.rows, krImport: record }
      : kind === 'go' ? { goRows: res.rows, goImport: record } : { pcRows: res.rows, pcImport: record });
    addNotification(`${file.name}: ${res.summary}`, res.skipped.length ? 'info' : 'success');
  };

  const applyPreset = (key) => {
    const preset = LAB_SYSTEM_PRESETS.find((p) => p.key === key);
    if (!preset || !selected) return;
    updateSample(selected.id, { sigma_dyncm: preset.sigma, thetaDeg: preset.theta, fluids: LAB_SYSTEM_FLUIDS[key] });
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
                s.id === selectedId ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border bg-pl-sunken hover:border-pl-border-strong'
              }`}
              onClick={() => onSelect(s.id)}
            >
              <div className="text-xs text-pl-text truncate">
                {s.name}
                <span className="text-pl-muted ml-1.5">
                  {[s.krRows?.length ? `kr ${s.krRows.length}` : '', s.goRows?.length ? `gas-oil ${s.goRows.length}` : '', s.pcRows?.length ? `Pc ${s.pcRows.length}` : ''].filter(Boolean).join(' · ')}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeSample(s.id); if (s.id === selectedId) onSelect(null); }}
                className="text-pl-muted hover:text-pl-danger-text"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {samples.length === 0 && (
            <p className="text-xs text-pl-muted">No samples yet. Add one, or load the synthetic demo pair.</p>
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
            <ScalField label="Name" value={selected.name} onChange={(v) => updateSample(selected.id, { name: v })} />
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Lab measurement system</Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="h-9">
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
            {PROP_FIELDS.map(({ k, label, kind }) => (
              <ScalField key={k} label={label} kind={kind} testId={`sample-${k}`} value={selected[k] ?? ''} onChange={(v) => updateSample(selected.id, { [k]: v })} />
            ))}
            <ScalField label="Lab fluids" value={selected.fluids ?? ''} placeholder="e.g. Oil and brine" onChange={(v) => updateSample(selected.id, { fluids: v })} />
          </section>

          <section className="space-y-3" data-testid="sample-pedigree">
            <SectionLabel>Sample pedigree</SectionLabel>
            {PEDIGREE_SELECTS.map(({ k, label, list }) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs text-pl-muted">{label}</Label>
                <Select value={selected[k] || NONE} onValueChange={(v) => updateSample(selected.id, { [k]: v === NONE ? '' : v })}>
                  <SelectTrigger className="h-9" aria-label={label} data-testid={`pedigree-${k}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PEDIGREE_OPTIONS[list].map(([value, text]) => <SelectItem key={value || NONE} value={value || NONE}>{text}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {selected.origin === 'analog' && (
              <ScalField label="Analog of what" value={selected.analogNote ?? ''} placeholder="Field, well or published set" onChange={(v) => updateSample(selected.id, { analogNote: v })} />
            )}
            <ScalField label="Test temperature" kind="temperature" testId="sample-testTempF" value={selected.testTempF ?? ''} onChange={(v) => updateSample(selected.id, { testTempF: v })} />
            <ScalField label="Laboratory" value={selected.laboratory ?? ''} onChange={(v) => updateSample(selected.id, { laboratory: v })} />
            <ScalField label="Lab report number" value={selected.labReport ?? ''} onChange={(v) => updateSample(selected.id, { labReport: v })} />
          </section>

          <section className="space-y-2">
            <SectionLabel>Lab tables</SectionLabel>
            <input
              ref={krFileRef} type="file" accept=".csv,.txt,.tsv,.dat,.prn,.xlsx,.xlsm,.xls,text/csv,text/plain" className="hidden"
              onChange={(e) => { importCsv(e.target.files?.[0], 'kr'); e.target.value = ''; }}
            />
            <input
              ref={goFileRef} type="file" accept=".csv,.txt,.tsv,.dat,.prn,.xlsx,.xlsm,.xls,text/csv,text/plain" className="hidden" data-testid="import-go-file"
              onChange={(e) => { importCsv(e.target.files?.[0], 'go'); e.target.value = ''; }}
            />
            <input
              ref={pcFileRef} type="file" accept=".csv,.txt,.tsv,.dat,.prn,.xlsx,.xlsm,.xls,text/csv,text/plain" className="hidden"
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
              <Button size="sm" variant="outline" className="h-8" onClick={() => goFileRef.current?.click()} data-testid="import-go">
                <Upload className="w-3.5 h-3.5 mr-1" /> Gas-oil kr
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadText(GO_CSV_TEMPLATE, 'scal-gas-oil-template.csv')}>
                <Download className="w-3 h-3 mr-1" /> Gas-oil template
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2" data-testid="fit-endpoints">
              <ScalField label="Swc for the kr fit" kind="fraction" testId="sample-fitSwc" value={selected.fitSwc ?? ''} placeholder="From the table" onChange={(v) => updateSample(selected.id, { fitSwc: v })} />
              <ScalField label="Sor for the kr fit" kind="fraction" testId="sample-fitSor" value={selected.fitSor ?? ''} placeholder="From the table" onChange={(v) => updateSample(selected.id, { fitSor: v })} />
              <ScalField label="Sgc for the gas-oil fit" kind="fraction" testId="sample-goSgc" value={selected.goSgc ?? ''} placeholder="From the table" onChange={(v) => updateSample(selected.id, { goSgc: v })} />
              <ScalField label="Sorg for the gas-oil fit" kind="fraction" testId="sample-goSorg" value={selected.goSorg ?? ''} placeholder="From the table" onChange={(v) => updateSample(selected.id, { goSorg: v })} />
            </div>
            <p className="text-[11px] text-pl-muted">
              A lab table that stops short of an end point (unsteady-state data seldom reach residual oil) is fitted
              with the two end point saturations stated here; the kr end point the table does not reach is then a
              fitted value. Leave both blank to take them from the table.
            </p>
            <ScalField
              label="Swc of the gas-oil test" kind="fraction" testId="sample-goSwc" value={selected.goSwc ?? ''}
              placeholder="Blank: the working gas-oil Swc" onChange={(v) => updateSample(selected.id, { goSwc: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-pl-muted">Pc unit if the file does not say</Label>
                <Select value={pcUnit} onValueChange={setPcUnit}>
                  <SelectTrigger className="h-8" aria-label="Pc unit if the file does not say" data-testid="import-pc-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PC_FILE_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-pl-muted">Sw in the file</Label>
                <Select value={satUnit} onValueChange={setSatUnit}>
                  <SelectTrigger className="h-8" aria-label="Sw in the file" data-testid="import-sat-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SATURATION_FILE_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-pl-muted">
              CSV, tab, semicolon or space separated text, or an Excel workbook (the first sheet that holds the
              table is read and named); columns found by name in any order (Sw, krw, kro; Sw, Pc;
              Sg, krg, krog for the gas-oil table at connate water),
              or by position when there is no header; comma decimals read. A unit in the header, such as Pc (kPa) or
              Sw (%), wins over the choice above.
            </p>
            {['krImport', 'goImport', 'pcImport'].map((k) => selected[k] && (
              <div key={k} className="rounded-md border border-pl-border bg-pl-sunken px-2.5 py-2 text-[11px] text-pl-text space-y-1" data-testid={`readback-${k}`}>
                <p className="font-semibold">{{ krImport: 'kr table', goImport: 'Gas-oil kr table', pcImport: 'Pc table' }[k]} read from {selected[k].file || 'a file'}</p>
                <p>{selected[k].summary}</p>
                {selected[k].skipped?.length > 0 && (
                  <ul className="list-disc list-inside text-pl-muted">
                    {selected[k].skipped.slice(0, 8).map((x) => <li key={`${x.line}-${x.reason}`}>Line {x.line}: {x.reason}</li>)}
                    {selected[k].skippedCount > 8 && <li>and {selected[k].skippedCount - 8} more</li>}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
};

export default LabDataPanel;
