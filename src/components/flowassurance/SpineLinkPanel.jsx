// The spine link and the shared well model.
//
// The well comes from the shared per-well record, so the trajectory,
// fluid, inflow and completion are the ones every other production
// studio is using. What the well was FLOWING on the day stays with the
// study, because a rate and a line pressure are duty, not the well.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import WellModelSpinePanel from '@/components/production/WellModelSpinePanel';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';

const SpineLinkPanel = () => {
  const {
    inputs, patchSection, fields, spineWells, linkWell,
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useFlowAssurance();
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
            No fields on the spine yet. A study works fine without a link.
          </p>
        )}
      </div>

      {link.fieldId && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Well</Label>
          <Select value={link.wellId || ''} onValueChange={linkWell}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
              <SelectValue placeholder="Pick a well" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {spineWells.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}

      <WellModelSpinePanel
        wellName={link.wellName}
        savedModel={savedWellModel}
        isDirty={wellModelDirty}
        busy={wellModelBusy}
        onLoad={loadFromSpine}
        onSave={saveToSpine}
      />
    </div>
  );
};

export default SpineLinkPanel;
