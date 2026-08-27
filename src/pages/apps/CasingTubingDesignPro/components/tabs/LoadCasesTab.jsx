import React, { useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import {
  PlusCircle, Edit2, Trash2, AlertCircle, Layers, Ruler,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

// Canonical load-case kinds. Every parameter is type-specific and feeds the
// engine profile generator directly — nothing here is decorative.
const CASING_KINDS = [
  {
    kind: 'gasKickBurst',
    label: 'Gas Kick (Burst)',
    blurb: 'Gas to surface from the shoe control pressure (frac EMW or reservoir override), water backup outside.',
    params: [
      { key: 'gasGradPaPerM', label: 'Gas gradient', suffix: 'Pa/m', step: 100 },
      { key: 'reservoirPressurePa', label: 'Reservoir pressure override', suffix: 'Pa', step: 1e6, optional: true },
    ],
  },
  {
    kind: 'pressureTestBurst',
    label: 'Pressure Test (Burst)',
    blurb: 'Surface test pressure on the mud column, water backup outside.',
    params: [{ key: 'testPressurePa', label: 'Test pressure', suffix: 'Pa', step: 1e6 }],
  },
  {
    kind: 'fullEvacuationCollapse',
    label: 'Full Evacuation (Collapse)',
    blurb: 'Empty string, full mud column outside — the classic worst-case collapse.',
    params: [],
  },
  {
    kind: 'partialEvacuationCollapse',
    label: 'Partial Evacuation (Collapse)',
    blurb: 'Gas above a fluid level inside, mud outside.',
    params: [
      { key: 'evacuationFraction', label: 'Evacuated fraction', suffix: '0-1', step: 0.05 },
      { key: 'packerFluidKgM3', label: 'Remaining fluid density', suffix: 'kg/m³', step: 10, optional: true },
    ],
  },
  {
    kind: 'cementingCollapse',
    label: 'Cementing (Collapse)',
    blurb: 'Wet cement outside, displacement water inside.',
    params: [{ key: 'cementKgM3', label: 'Slurry density override', suffix: 'kg/m³', step: 10, optional: true }],
  },
  {
    kind: 'runningAxial',
    label: 'Running (Axial)',
    blurb: 'Buoyed string weight plus surface overpull.',
    params: [{ key: 'overpullN', label: 'Overpull', suffix: 'N', step: 1e4 }],
  },
  {
    kind: 'customGradient',
    label: 'Custom Gradients',
    blurb: 'Free-form internal/external fluid gradients with surface pressure.',
    params: [
      { key: 'internalKgM3', label: 'Internal density', suffix: 'kg/m³', step: 10 },
      { key: 'externalKgM3', label: 'External density', suffix: 'kg/m³', step: 10 },
      { key: 'surfacePressurePa', label: 'Surface pressure', suffix: 'Pa', step: 1e5 },
    ],
  },
];

const TUBING_KINDS = [
  {
    kind: 'production',
    label: 'Production',
    blurb: 'Light produced column plus WHP; string heats toward the linear profile mean.',
    params: [
      { key: 'surfacePressurePa', label: 'Tubing head pressure', suffix: 'Pa', step: 1e6 },
      { key: 'internalKgM3', label: 'Produced fluid density', suffix: 'kg/m³', step: 10 },
      { key: 'deltaOpC', label: 'ΔT override', suffix: '°C', step: 5, optional: true },
    ],
  },
  {
    kind: 'injection',
    label: 'Injection',
    blurb: 'Injection pressure on a water column; string cools.',
    params: [
      { key: 'surfacePressurePa', label: 'Injection pressure', suffix: 'Pa', step: 1e6 },
      { key: 'internalKgM3', label: 'Injected fluid density', suffix: 'kg/m³', step: 10 },
      { key: 'deltaOpC', label: 'Mean ΔT', suffix: '°C', step: 5 },
    ],
  },
  {
    kind: 'stimulation',
    label: 'Stimulation',
    blurb: 'High treating pressure, strong cooling — the seal-stroke test.',
    params: [
      { key: 'surfacePressurePa', label: 'Treating pressure', suffix: 'Pa', step: 1e6 },
      { key: 'internalKgM3', label: 'Treating fluid density', suffix: 'kg/m³', step: 10 },
      { key: 'deltaOpC', label: 'Mean ΔT', suffix: '°C', step: 5 },
      { key: 'annulusSurfacePressurePa', label: 'Annulus pressure', suffix: 'Pa', step: 1e6, optional: true },
    ],
  },
  {
    kind: 'shutIn',
    label: 'Shut-in',
    blurb: 'Shut-in tubing head pressure on the produced column.',
    params: [
      { key: 'surfacePressurePa', label: 'SITHP', suffix: 'Pa', step: 1e6 },
      { key: 'internalKgM3', label: 'Fluid density', suffix: 'kg/m³', step: 10 },
      { key: 'deltaOpC', label: 'Mean ΔT', suffix: '°C', step: 5, optional: true },
    ],
  },
];

const kindMeta = (kind) => [...CASING_KINDS, ...TUBING_KINDS].find((k) => k.kind === kind) || null;

const badgeClass = (target) => (target === 'tubing'
  ? 'bg-purple-900/20 text-purple-300 border-purple-900/50'
  : 'bg-blue-900/20 text-blue-300 border-blue-900/50');

const LoadCasesTab = () => {
  const { caseDoc, saveLoadCase, deleteLoadCase } = useCasingTubingDesign();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState(null);

  const loadCases = caseDoc?.loadCases || [];

  const openNew = () => {
    setForm({
      id: null,
      name: `Load Case ${loadCases.length + 1}`,
      target: 'casing',
      kind: 'gasKickBurst',
      params: {},
    });
    setIsEditorOpen(true);
  };

  const openEdit = (lc) => {
    setForm({ ...lc, params: { ...(lc.params || {}) } });
    setIsEditorOpen(true);
  };

  const handleSave = () => {
    saveLoadCase({ ...form, id: form.id || `lc-${Date.now()}` });
    setIsEditorOpen(false);
  };

  const kinds = form?.target === 'tubing' ? TUBING_KINDS : CASING_KINDS;
  const meta = form ? kindMeta(form.kind) : null;

  return (
    <div className="h-full flex flex-col space-y-6 p-1">
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-800">
        <div>
          <h3 className="text-lg font-medium text-white">Design Load Cases</h3>
          <p className="text-sm text-slate-400">Canonical burst, collapse, axial and tubing operating scenarios. Every parameter feeds the engine directly.</p>
        </div>
        <Button data-testid="ct-add-load-case" onClick={openNew} className="bg-lime-600 hover:bg-lime-700 text-white shadow-lg shadow-lime-900/20">
          <PlusCircle className="w-4 h-4 mr-2" /> Add Load Case
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-10">
          {loadCases.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
              <AlertCircle className="w-10 h-10 text-slate-600 mb-4" />
              <p className="text-slate-500 font-medium">No load cases defined yet.</p>
              <Button variant="link" onClick={openNew} className="text-blue-400">Create your first case</Button>
            </div>
          )}

          {loadCases.map((lc) => {
            const m = kindMeta(lc.kind);
            return (
              <Card key={lc.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-all hover:bg-slate-800/30 group">
                <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-800/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-sm font-bold text-white flex items-center">
                        {lc.name}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1.5 flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center ${badgeClass(lc.target)}`}>
                          {lc.target === 'tubing' ? <Ruler className="w-3 h-3 mr-1" /> : <Layers className="w-3 h-3 mr-1" />}
                          {(m?.label || lc.kind).toUpperCase()}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => openEdit(lc)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-slate-700" onClick={() => deleteLoadCase(lc.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 px-4 pb-4 text-xs space-y-2">
                  <p className="text-[10px] text-slate-500">{m?.blurb}</p>
                  {m && m.params.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {m.params.map((p) => (
                        lc.params?.[p.key] != null && (
                          <div key={p.key} className="bg-slate-950/50 p-2 rounded border border-slate-800/50">
                            <span className="text-[10px] text-slate-500 block">{p.label}</span>
                            <span className="text-slate-200 font-mono font-medium">
                              {Number(lc.params[p.key]).toLocaleString()} {p.suffix !== '0-1' ? p.suffix : ''}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit Load Case' : 'New Load Case'}</DialogTitle>
          </DialogHeader>

          {form && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-900 border-slate-700 focus:border-lime-500" />
                </div>
                <div className="space-y-2">
                  <Label>Applies to</Label>
                  <Select
                    value={form.target}
                    onValueChange={(v) => setForm({
                      ...form,
                      target: v,
                      kind: v === 'tubing' ? 'production' : 'gasKickBurst',
                      params: {},
                    })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="casing">Casing string</SelectItem>
                      <SelectItem value="tubing">Tubing / packer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scenario</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(v) => setForm({ ...form, kind: v, params: {} })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {kinds.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {meta && (
                <div className="p-4 border border-slate-800 bg-slate-900/30 rounded-md space-y-4">
                  <p className="text-xs text-slate-400">{meta.blurb}</p>
                  {meta.params.length === 0 ? (
                    <p className="text-[10px] text-slate-500">This scenario has no extra parameters — it uses the case environment (mud, backup water) directly.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {meta.params.map((p) => (
                        <div key={p.key} className="space-y-1">
                          <Label className="text-xs text-slate-400">
                            {p.label} {p.optional && <span className="text-slate-600">(optional)</span>}
                          </Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="number"
                              step={p.step}
                              value={form.params[p.key] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                const params = { ...form.params };
                                if (v === undefined || Number.isNaN(v)) delete params[p.key];
                                else params[p.key] = v;
                                setForm({ ...form, params });
                              }}
                              className="bg-slate-900 border-slate-700 h-9 font-mono text-right"
                            />
                            <span className="text-[10px] text-slate-500 w-14">{p.suffix}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">Cancel</Button>
            <Button onClick={handleSave} className="bg-lime-600 hover:bg-lime-700 text-white">Save Case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoadCasesTab;
