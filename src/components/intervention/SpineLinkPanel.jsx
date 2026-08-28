// The spine link. This studio needs it more than any other in the
// module: without a production history there is no diagnosis, and
// without a diagnosis every water treatment is refused rather than
// guessed at.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import WellModelSpinePanel from '@/components/production/WellModelSpinePanel';
import { useIntervention } from '@/contexts/InterventionPlannerContext';

const SpineLinkPanel = () => {
  const {
    inputs, patchSection, fields, spineWells, linkWell, history, historyLoading,
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useIntervention();
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
          <p className="text-[11px] text-slate-600">
            {historyLoading
              ? 'Loading the production history...'
              : history.length
                ? `${history.length} producing days on the spine.`
                : 'No production history on the spine for this well. Import it in the Surveillance Studio; without it there is no diagnosis.'}
          </p>
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
