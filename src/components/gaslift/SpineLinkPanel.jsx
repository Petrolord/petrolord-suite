// Optional link to the production data spine (left rail). A design is
// for a well, and the spine already knows the wells and their tests, so
// this saves retyping and keeps the design attached to a real well
// rather than a free-text name. Nothing here changes the design math:
// the link stores ids, and applying a test simply fills the inputs.
import React from 'react';
import { Link2, Download, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const SpineLinkPanel = () => {
  const {
    inputs, patchSection, fields, spineWells, linkWell, latestTestForLinkedWell,
    applyLatestTest, legacyDesigns, loadLegacyDesigns, importLegacyDesign,
  } = useGasLift();
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
            {fields.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!fields.length && (
          <p className="text-[11px] text-slate-600">
            No fields on the spine yet. A design works fine without a link.
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
              {spineWells.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
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
                {' '}{Number(latestTestForLinkedWell.oil_rate_stbd || 0).toLocaleString()} stb/d oil.
              </p>
              <Button size="sm" variant="outline" className="w-full h-8" onClick={applyLatestTest}>
                <Download className="w-3 h-3 mr-1" /> Use this test
              </Button>
            </>
          ) : (
            <p className="text-[11px] text-slate-600">No valid test on the spine for this well.</p>
          )}
        </div>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-2">
        <Label className="text-xs text-slate-400">Old Artificial Lift Designer saves</Label>
        {legacyDesigns.length === 0 ? (
          <Button size="sm" variant="outline" className="w-full h-8" onClick={loadLegacyDesigns}>
            <History className="w-3 h-3 mr-1" /> Look for old gas lift inputs
          </Button>
        ) : (
          <Select onValueChange={importLegacyDesign}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
              <SelectValue placeholder={`${legacyDesigns.length} save${legacyDesigns.length === 1 ? '' : 's'} found`} />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {legacyDesigns.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.design_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-[11px] text-slate-600">
          The old designer's gas lift tab was screening grade and was removed, but its inputs were
          kept. Importing brings across the well and injection numbers; the spacing safety factor
          has no equivalent here and is not carried.
        </p>
      </div>
    </div>
  );
};

export default SpineLinkPanel;
