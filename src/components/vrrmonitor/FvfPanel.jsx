// Global fluid-property (FVF/PVT) inputs for the VRR Monitor left rail.
// One set applies to every period; per-period overrides arrive in V3.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const FIELDS = [
  { key: 'Bo', label: 'Bo (RB/STB)' },
  { key: 'Bw', label: 'Bw (RB/STB)' },
  { key: 'Bg', label: 'Bg (RB/Mscf)' },
  { key: 'Rs', label: 'Rs (scf/STB)' },
];

const FvfPanel = () => {
  const { inputs, setFvfField } = useVrrMonitor();
  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            value={inputs.fvf[key]}
            onChange={(e) => setFvfField(key, e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
        </div>
      ))}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        All volumes convert to reservoir barrels before the ratio is taken. Solution gas (Rs x oil)
        is already carried in Bo, so only free produced gas adds voidage.
      </p>
    </div>
  );
};

export default FvfPanel;
