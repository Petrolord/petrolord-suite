// Left-rail inputs for the Layered Sweep tab: editable layer table (h, k),
// CSV import, and the Dykstra-Parsons / Stiles configuration.
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Upload, Beaker } from 'lucide-react';
import { useWaterfloodDesign, DEFAULT_LAYERS } from '@/contexts/WaterfloodDesignContext';
import { sampleLayeredData } from '@/utils/layeredSweepCalculations';
import { Field, SectionLabel, fmt } from './primitives';

const LayeredPanel = () => {
  const { layers, setLayers, layeredConfig, setLayeredField, displacement, addNotification, u, layeredResult, patternInputs } = useWaterfloodDesign();
  const fileRef = useRef(null);

  const setCell = (i, key, v) => {
    // thickness in the display unit, stored in ft (WF-U1, PL3); k is md in both systems
    const stored = key === 'h' ? u.toState('length', v) : v;
    if (stored == null) return;
    setLayers(layers.map((l, j) => (j === i ? { ...l, [key]: stored } : l)));
  };
  const addRow = () => setLayers([...layers, { h: '', k: '' }]);
  const removeRow = (i) => setLayers(layers.filter((_, j) => j !== i));

  const importCsv = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = String(e.target.result).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      // WF-U1 (PL2): the thickness unit from the header ("h (m)", "thickness_ft"), else the display unit
      const header = lines.find((line) => /^[hk]\b|thickness|perm/i.test(line)) || '';
      const hUnit = /\bm\b|\(m\)|_m\b|metre|meter/i.test(header) ? 'si' : /ft|feet/i.test(header) ? 'oilfield' : u.system;
      const toFt = (v) => (hUnit === 'si' ? String(parseFloat((v / 0.3048).toPrecision(10))) : String(v));
      const rows = lines
        .filter((line) => !/^[hk]\b|thickness|perm/i.test(line))
        .map((line) => {
          const parts = line.split(/[\s;\t]+|,(?=\s*-?\d)/).filter((x) => x !== '');
          return { h: fmt.num(parts[0]), k: fmt.num(parts[1]) };
        })
        .filter((r) => r.h > 0 && r.k > 0)
        .map((r) => ({ h: toFt(r.h), k: String(r.k) }));
      if (rows.length < 2) {
        addNotification('CSV needs at least 2 rows of h, k', 'error');
        return;
      }
      setLayers(rows);
      addNotification(`Imported ${rows.length} layers; thickness read in ${hUnit === 'si' ? 'm' : 'ft'}${header ? ' from the header' : ' (the display unit; no header)'}, permeability in md.`, 'success');
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    const s = sampleLayeredData();
    setLayers(s.layers.map((l) => ({ h: String(l.h), k: String(l.k) })));
    setLayeredField('M', String(s.M));
    setLayeredField('A', String(s.A));
    addNotification('Sample layer set loaded', 'info');
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Layers (h {u.label('length')}, k md)</SectionLabel>
        <div className="space-y-2">
          {layers.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={u.text('length', l.h)} onChange={(e) => setCell(i, 'h', e.target.value)} placeholder="h" aria-label={`Layer ${i + 1} thickness`} className="h-8 text-xs" />
              <Input value={l.k} onChange={(e) => setCell(i, 'k', e.target.value)} placeholder="k" aria-label={`Layer ${i + 1} permeability`} className="h-8 text-xs" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-danger-text shrink-0" onClick={() => removeRow(i)}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={addRow} className="flex-1">
            <Plus size={14} className="mr-1" /> Layer
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="flex-1">
            <Upload size={14} className="mr-1" /> CSV
          </Button>
          <input
            ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) importCsv(e.target.files[0]); e.target.value = ''; }}
          />
        </div>
      </section>

      <section>
        <SectionLabel>Mobility ratio M</SectionLabel>
        <Tabs value={layeredConfig.mSource} onValueChange={(v) => setLayeredField('mSource', v)}>
          <TabsList className="h-8 p-0.5 w-full">
            <TabsTrigger value="displacement" className="h-7 text-xs flex-1">From displacement</TabsTrigger>
            <TabsTrigger value="manual" className="h-7 text-xs flex-1">Manual</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-2">
          {layeredConfig.mSource === 'displacement' ? (
            <Label className="text-xs text-pl-muted">
              M = {fmt.f2(displacement?.M)} from the Displacement tab inputs.
            </Label>
          ) : (
            <Field label="M, endpoint mobility ratio" value={layeredConfig.M} onChange={(v) => setLayeredField('M', v)} />
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Stiles capacity ratio</SectionLabel>
        <Tabs value={layeredConfig.aSource === 'derived' ? 'derived' : 'manual'} onValueChange={(v) => setLayeredField('aSource', v)}>
          <TabsList className="h-8 p-0.5 w-full">
            <TabsTrigger value="derived" className="h-7 text-xs flex-1">From M and Bo/Bw</TabsTrigger>
            <TabsTrigger value="manual" className="h-7 text-xs flex-1">Manual</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-2">
          {layeredConfig.aSource === 'derived' ? (
            <Label className="text-xs text-pl-muted" data-testid="wds-stiles-a">
              A = M x Bo / Bw = {fmt.f2(layeredResult?.M)} x {String(patternInputs.Bo)} / {String(patternInputs.Bw)} = {fmt.f2(layeredResult?.A)} (endpoint M, Bo and Bw of the Pattern tab).
            </Label>
          ) : (
            <Field label="A = (krw/μw)/(kro/μo) · Bo/Bw" value={layeredConfig.A} onChange={(v) => setLayeredField('A', v)} />
          )}
        </div>
      </section>

      <section>
        <Button variant="outline" size="sm" onClick={loadSample} className="w-full">
          <Beaker className="w-4 h-4 mr-1" /> Sample layer set
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setLayers(DEFAULT_LAYERS)} className="w-full mt-1 text-pl-muted">
          Reset layers
        </Button>
      </section>
    </div>
  );
};

export default LayeredPanel;
