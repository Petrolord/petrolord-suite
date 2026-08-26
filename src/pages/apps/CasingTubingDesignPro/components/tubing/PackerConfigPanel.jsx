import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import { depthDisp, depthStore, depthLabel } from '../../services/ctRun';

// Packer definition drives the Lubinski force system: setting depth (MD),
// seal bore, rating and PBR stroke all feed the engine. Other completion
// hardware lives in the schematic components list.
const PackerConfigPanel = () => {
  const { caseDoc, setPacker, depthUnit } = useCasingTubingDesign();
  const packer = caseDoc?.packer;
  const unit = depthLabel(depthUnit);
  if (!packer) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="py-2 px-4 border-b border-slate-800 bg-slate-950/50">
        <CardTitle className="text-xs font-bold text-slate-300 uppercase">Production Packer</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-lime-400 font-bold">Packer set</Label>
            <Switch
              checked={packer.hasPacker}
              onCheckedChange={(c) => setPacker({ hasPacker: c })}
              className="scale-75"
            />
          </div>

          {packer.hasPacker && (
            <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-slate-800">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Setting MD ({unit})</Label>
                <Input
                  data-testid="ct-packer-depth"
                  type="number"
                  value={Math.round(depthDisp(packer.depthMdM, depthUnit))}
                  onChange={(e) => setPacker({ depthMdM: depthStore(parseFloat(e.target.value) || 0, depthUnit) })}
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Type</Label>
                <Select value={packer.type} onValueChange={(v) => setPacker({ type: v })}>
                  <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Permanent">Permanent</SelectItem>
                    <SelectItem value="Retrievable">Retrievable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Seal Bore (in)</Label>
                <Input
                  type="number"
                  step="0.125"
                  value={packer.sealBoreIn}
                  onChange={(e) => setPacker({ sealBoreIn: parseFloat(e.target.value) })}
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Rating (kN)</Label>
                <Input
                  type="number"
                  value={Math.round((packer.ratingN || 0) / 1000)}
                  onChange={(e) => setPacker({ ratingN: (parseFloat(e.target.value) || 0) * 1000 })}
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">PBR Stroke (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={packer.strokeM}
                  onChange={(e) => setPacker({ strokeM: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>
            </div>
          )}
          {!packer.hasPacker && (
            <p className="text-[10px] text-slate-500">
              Without a packer there is no tubing-to-packer force system; the tubing load cases are skipped.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PackerConfigPanel;
