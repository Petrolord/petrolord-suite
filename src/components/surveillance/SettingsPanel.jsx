// Exception thresholds (left rail). These are analysis state: they live
// in the saved project payload, not in the shared spine, so two
// engineers can surveil the same field with different triggers.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_SURVEILLANCE_SETTINGS } from '@/utils/production/surveillance';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const FIELDS = [
  { key: 'recentDays', label: 'Test window (days)', hint: 'Widens automatically on monthly data.' },
  { key: 'baselineDays', label: 'Baseline window (days)' },
  { key: 'rateDropPct', label: 'Rate drop trigger (%)' },
  { key: 'watercutRisePts', label: 'Watercut rise trigger (points)' },
  { key: 'gorRisePct', label: 'GOR rise trigger (%)' },
  { key: 'downtimeHours', label: 'Downtime threshold (hours on)' },
  { key: 'staleDays', label: 'Stale data after (days)' },
  { key: 'minOilRate', label: 'Minimum baseline rate (stb/d)', hint: 'Wells below this skip the ratio checks.' },
];

const SettingsPanel = () => {
  const { inputs, setSettingsField } = useSurveillance();
  const resetAll = () => {
    Object.entries(DEFAULT_SURVEILLANCE_SETTINGS).forEach(([k, v]) => setSettingsField(k, v));
  };

  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label, hint }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            type="number"
            value={inputs.settings[key] ?? ''}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              setSettingsField(key, Number.isFinite(n) ? n : e.target.value);
            }}
            className="h-9 bg-slate-800 border-slate-700"
          />
          {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
        </div>
      ))}
      <Button variant="ghost" size="sm" className="text-xs text-slate-400" onClick={resetAll}>
        <RotateCcw size={12} className="mr-1" /> Reset to defaults
      </Button>
    </div>
  );
};

export default SettingsPanel;
