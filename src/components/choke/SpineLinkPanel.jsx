// The spine link and the shared well model.
//
// The link earns its keep here more than anywhere: the well tests it
// exposes are what the choke coefficients get fitted to, so a linked
// well can run on its own correlation rather than a published set.
import React from 'react';
import { Link2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import WellModelSpinePanel from '@/components/production/WellModelSpinePanel';
import { useChoke } from '@/contexts/ChokePerformanceContext';

const SpineLinkPanel = () => {
  const {
    inputs, patchSection, fields, spineWells, linkWell, chokePoints,
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useChoke();
  const { link } = inputs;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Field</Label>
        <Select
          value={link.fieldId || ''}
          onValueChange={(v) => patchSection('link', { fieldId: v || null, wellId: null, wellName: '' })}
        >
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Not linked" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {fields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
          </SelectContent>
        </Select>
        {!fields.length && (
          <p className="text-[11px] text-slate-600">
            No fields on the spine yet. An analysis works fine without a link, on a published
            coefficient set.
          </p>
        )}
      </div>

      {link.fieldId && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Well</Label>
          <Select value={link.wellId || ''} onValueChange={linkWell}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
              <SelectValue placeholder="The whole field" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {spineWells.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-slate-600">
            {chokePoints.length} usable test{chokePoints.length === 1 ? '' : 's'} in scope
            {link.wellId ? ' for this well' : ' across the field'}. A field-wide fit is reasonable
            on wells that complete alike; pick a well to keep it to one.
          </p>
        </div>
      )}

      {link.wellId && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <Link2 className="w-3 h-3" /> Linked to {link.wellName}
        </p>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-2">
        <Label className="text-xs text-slate-400">Well model</Label>
        <WellModelSpinePanel
          wellName={link.wellName}
          savedModel={savedWellModel}
          isDirty={wellModelDirty}
          onLoad={loadFromSpine}
          onSave={saveToSpine}
          busy={wellModelBusy}
        />
      </div>
    </div>
  );
};

export default SpineLinkPanel;
