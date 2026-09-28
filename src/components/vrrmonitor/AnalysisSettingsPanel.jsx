// Operator analysis settings (V2, left rail): target VRR band + rolling
// window. These drive the flagPeriods / computeRollingVRR layers and, since
// senior test T1, the status headline (vrrBand.js); the engine's fixed
// classifyVRR bands are shown beneath it as a screening reading.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { useStudioTheme } from '@/components/studio/studioTheme';

const FIELDS = [
  { key: 'targetBandMin', label: 'Target VRR min' },
  { key: 'targetBandMax', label: 'Target VRR max' },
  { key: 'rollingWindow', label: 'Rolling window (periods)' },
];

const AnalysisSettingsPanel = () => {
  const { inputs, setSettingsField } = useVrrMonitor();
  const { tc } = useStudioTheme();
  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`vrr-set-${key}`} className={tc('text-xs text-slate-400', 'text-xs text-pl-muted')}>{label}</Label>
          <Input
            id={`vrr-set-${key}`}
            value={inputs.settings[key]}
            onChange={(e) => setSettingsField(key, e.target.value)}
            className={tc('h-9 bg-slate-800 border-slate-700', 'h-9 font-pl-mono tabular-nums')}
          />
        </div>
      ))}
      <p className={tc('text-[11px] text-slate-500 leading-relaxed', 'text-xs text-pl-muted leading-relaxed')}>
        Many operators hold VRR slightly above 1 after fill-up (for example 1.0 to 1.2). Periods
        outside the band flag as Under or Over on the ledger and dashboard.
      </p>
    </div>
  );
};

export default AnalysisSettingsPanel;
