import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import { depthStore, depthLabel } from '../../services/ctRun';

// Schematic-only completion hardware (the packer that drives the force
// system is configured on the packer panel; component depths feed the
// visualizer, not the engine). D7 Completion Design absorbs this.
const COMPONENT_TYPES = [
  'Safety Valve (SSSV)', 'Landing Nipple', 'Flow Coupling', 'Blast Joint',
  'Expansion Joint', 'Side Pocket Mandrel', 'Sliding Sleeve', 'Perforations',
];

const AddCompletionComponentDialog = ({ open, onOpenChange, stringId }) => {
  const { setStrings, addLog, depthUnit } = useCasingTubingDesign();
  const unit = depthLabel(depthUnit);

  const [form, setForm] = useState({
    type: 'Safety Valve (SSSV)',
    depthDisp: 150,
    odIn: 3.5,
    description: '',
  });

  const handleSubmit = () => {
    if (!stringId) return;
    const newComponent = {
      id: `comp-${Date.now()}`,
      type: form.type,
      depthMdM: depthStore(parseFloat(form.depthDisp) || 0, depthUnit),
      odIn: parseFloat(form.odIn) || null,
      description: form.description,
    };
    setStrings((prev) => ({
      ...prev,
      tubingStrings: prev.tubingStrings.map((str) => (str.id !== stringId ? str : {
        ...str,
        components: [...(str.components || []), newComponent],
      })),
    }));
    addLog(`Added component: ${form.type}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Completion Component</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 space-y-2">
            <Label>Component Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {COMPONENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Depth MD ({unit})</Label>
            <Input
              type="number"
              value={form.depthDisp}
              onChange={(e) => setForm({ ...form, depthDisp: e.target.value })}
              className="bg-slate-900 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label>OD (in)</Label>
            <Input
              type="number"
              step="0.125"
              value={form.odIn}
              onChange={(e) => setForm({ ...form, odIn: e.target.value })}
              className="bg-slate-900 border-slate-700"
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-slate-900 border-slate-700 h-20"
              placeholder="Optional details..."
            />
          </div>
          <p className="col-span-2 text-[10px] text-slate-500">
            Components are schematic markers for the string drawing. The production packer that drives the force analysis is configured on the packer panel.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-lime-600 hover:bg-lime-700 text-white">
            Add Component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCompletionComponentDialog;
