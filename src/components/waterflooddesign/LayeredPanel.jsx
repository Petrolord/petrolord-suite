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
  const { layers, setLayers, layeredConfig, setLayeredField, displacement, addNotification } = useWaterfloodDesign();
  const fileRef = useRef(null);

  const setCell = (i, key, v) => setLayers(layers.map((l, j) => (j === i ? { ...l, [key]: v } : l)));
  const addRow = () => setLayers([...layers, { h: '', k: '' }]);
  const removeRow = (i) => setLayers(layers.filter((_, j) => j !== i));

  const importCsv = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = String(e.target.result)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^[hk]\b|thickness|perm/i.test(line))
        .map((line) => {
          const parts = line.split(/[\s,;\t]+/);
          return { h: parts[0], k: parts[1] };
        })
        .filter((r) => fmt.num(r.h) > 0 && fmt.num(r.k) > 0);
      if (rows.length < 2) {
        addNotification('CSV needs at least 2 rows of h, k', 'error');
        return;
      }
      setLayers(rows);
      addNotification(`Imported ${rows.length} layers`, 'success');
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
        <SectionLabel>Layers (h ft, k md)</SectionLabel>
        <div className="space-y-2">
          {layers.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={l.h} onChange={(e) => setCell(i, 'h', e.target.value)} placeholder="h" className="h-8 bg-slate-800 border-slate-700 text-xs" />
              <Input value={l.k} onChange={(e) => setCell(i, 'k', e.target.value)} placeholder="k" className="h-8 bg-slate-800 border-slate-700 text-xs" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400 shrink-0" onClick={() => removeRow(i)}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={addRow} className="flex-1 bg-slate-800 border-slate-700">
            <Plus size={14} className="mr-1" /> Layer
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="flex-1 bg-slate-800 border-slate-700">
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
          <TabsList className="h-8 bg-slate-800/50 border border-slate-700 p-0.5 w-full">
            <TabsTrigger value="displacement" className="h-7 text-xs flex-1 data-[state=active]:bg-slate-700">From displacement</TabsTrigger>
            <TabsTrigger value="manual" className="h-7 text-xs flex-1 data-[state=active]:bg-slate-700">Manual</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-2">
          {layeredConfig.mSource === 'displacement' ? (
            <Label className="text-xs text-slate-500">
              M = {fmt.f2(displacement?.M)} from the Displacement tab inputs.
            </Label>
          ) : (
            <Field label="M — endpoint mobility ratio" value={layeredConfig.M} onChange={(v) => setLayeredField('M', v)} />
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Stiles capacity ratio</SectionLabel>
        <Field label="A = (krw/μw)/(kro/μo) · Bo/Bw" value={layeredConfig.A} onChange={(v) => setLayeredField('A', v)} />
      </section>

      <section>
        <Button variant="outline" size="sm" onClick={loadSample} className="w-full bg-slate-800 border-slate-700">
          <Beaker className="w-4 h-4 mr-1" /> Sample layer set
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setLayers(DEFAULT_LAYERS)} className="w-full mt-1 text-slate-500">
          Reset layers
        </Button>
      </section>
    </div>
  );
};

export default LayeredPanel;
