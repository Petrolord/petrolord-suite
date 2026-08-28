// Optional link to the production data spine, and the shared well model.
import React from 'react';
import { Link2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import WellModelSpinePanel from '@/components/production/WellModelSpinePanel';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';

const SpineLinkPanel = () => {
  const {
    inputs, patchSection, fields, spineWells, linkWell, latestTestForLinkedWell,
    applyLatestTest, savedWellModel, wellModelDirty, loadFromSpine, saveToSpine,
    wellModelBusy,
  } = useGasWell();
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
            No fields on the spine yet. An analysis works fine without a link.
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

      {link.wellId && (
        <div className="rounded-md border border-slate-800 bg-slate-950/40 p-2 space-y-2">
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Linked to {link.wellName}
          </p>
          {latestTestForLinkedWell ? (
            <>
              <p className="text-[11px] text-slate-500">
                Latest valid test {latestTestForLinkedWell.test_date}:
                {' '}{Number(latestTestForLinkedWell.gas_rate_mscfd || 0).toLocaleString()} Mscf/d gas.
              </p>
              <Button size="sm" variant="outline" className="w-full h-8" onClick={applyLatestTest}>
                <Download className="w-3 h-3 mr-1" /> Use this test
              </Button>
              <p className="text-[11px] text-slate-600">
                The test rate is a measurement to compare the deliverability against, not an input
                to it, so it is reported rather than written into the inflow.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-600">No valid test on the spine for this well.</p>
          )}
        </div>
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
