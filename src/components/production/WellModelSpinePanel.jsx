// Load and save the well's model on the production spine (P6.5).
//
// The well description belongs to the WELL, so once a well is linked
// this panel lets a studio pull the description the field already
// agreed on, or push the one it is working with back. That is what
// stops three studios describing one well three ways.
//
// It deliberately does not sync automatically. A design is entitled to
// try a different inflow without rewriting the field's record, so
// loading and saving are both explicit, and the panel says when the two
// have diverged.
import React from 'react';
import { Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeWellModel } from '@/utils/production/wellModel';

const WellModelSpinePanel = ({
  wellName, savedModel, isDirty, onLoad, onSave, busy,
}) => {
  if (!wellName) {
    return (
      <p className="text-[11px] text-slate-600">
        Link a well on the spine to share its description with the other production studios.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {savedModel ? (
        <>
          <p className="text-[11px] text-slate-500 flex items-start gap-1">
            {isDirty
              ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
              : <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />}
            <span>
              {wellName} has a saved model
              {savedModel.updated_at ? ` from ${String(savedModel.updated_at).slice(0, 10)}` : ''}
              {isDirty
                ? '. What you have here differs from it.'
                : '. This design matches it.'}
            </span>
          </p>
          <p className="text-[11px] text-slate-600">{describeWellModel(savedModel.inputs)}</p>
        </>
      ) : (
        <p className="text-[11px] text-slate-600">
          {wellName} has no model on the spine yet. Saving one lets every production studio design
          against the same well.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm" variant="outline" className="h-8"
          onClick={onLoad} disabled={!savedModel || busy}
        >
          <Download className="w-3 h-3 mr-1" /> Load
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSave} disabled={busy}>
          <Upload className="w-3 h-3 mr-1" /> Save to well
        </Button>
      </div>
      <p className="text-[11px] text-slate-600">
        Only the well itself moves: trajectory, fluid, inflow and completion. The duty this design
        is run at stays with the design.
      </p>
    </div>
  );
};

export default WellModelSpinePanel;
