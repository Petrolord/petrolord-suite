// Operator analysis settings (V2, left rail): target VRR band + rolling
// window. The engine's classifyVRR interpretation bands stay fixed; these
// drive the flagPeriods / computeRollingVRR layers.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const FIELDS = [
  { key: 'targetBandMin', label: 'Target VRR min' },
  { key: 'targetBandMax', label: 'Target VRR max' },
  { key: 'rollingWindow', label: 'Rolling window (periods)' },
];

const AnalysisSettingsPanel = () => {
  const { inputs, setSettingsField } = useVrrMonitor();
  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            value={inputs.settings[key]}
            onChange={(e) => setSettingsField(key, e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
        </div>
      ))}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Many operators hold VRR slightly above 1 after fill-up (for example 1.0 to 1.2). Periods
        outside the band flag as Under or Over on the ledger and dashboard.
      </p>
    </div>
  );
};

export default AnalysisSettingsPanel;
