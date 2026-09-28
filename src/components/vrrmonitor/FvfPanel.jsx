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
          <Label htmlFor={`vrr-fvf-${key}`} className="text-xs text-pl-muted">{label}</Label>
          <Input
            id={`vrr-fvf-${key}`}
            value={inputs.fvf[key]}
            onChange={(e) => setFvfField(key, e.target.value)}
            className="h-9 font-pl-mono tabular-nums"
          />
        </div>
      ))}
      <p className="text-xs text-pl-muted leading-relaxed">
        All volumes convert to reservoir barrels before the ratio is taken. Solution gas (Rs x oil)
        is already carried in Bo, so only free produced gas adds voidage.
      </p>
    </div>
  );
};

export default FvfPanel;
