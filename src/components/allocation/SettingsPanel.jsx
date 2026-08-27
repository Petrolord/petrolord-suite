// Allocation basis and thresholds (left rail). Analysis state: these
// live in the saved project payload, not in the shared spine, so two
// engineers can allocate the same field on different assumptions and
// compare.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const NUMERIC = [
  { key: 'maxTestAgeDays', label: 'Test valid for (days)', hint: 'Past this age a test no longer carries its well.' },
  { key: 'factorWarnLow', label: 'Factor warning, low', step: '0.05' },
  { key: 'factorWarnHigh', label: 'Factor warning, high', step: '0.05' },
];

const SettingsPanel = () => {
  const { inputs, setSettingsField, setRangeField } = useAllocation();
  const { settings, range } = inputs;
  const isTestBasis = settings.basis !== 'ledger';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Allocation basis</Label>
        <Select value={settings.basis} onValueChange={(v) => setSettingsField('basis', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="test">Well test times uptime</SelectItem>
            <SelectItem value="ledger">Prorate the wells own meters</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-600">
          {isTestBasis
            ? 'Each well is carried by its latest valid test, scaled by the hours it was on.'
            : 'Each well is carried by its own ledger volumes, reconciled to the metered total.'}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-slate-400">Scale by hours on stream</Label>
          <p className="text-[11px] text-slate-600">A well on 12 hours carries half a day.</p>
        </div>
        <Switch
          checked={!!settings.useUptime}
          onCheckedChange={(c) => setSettingsField('useUptime', c)}
        />
      </div>

      {isTestBasis && (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-slate-400">Use tests that failed QC</Label>
            <p className="text-[11px] text-slate-600">Off by default: rejected tests carry nothing.</p>
          </div>
          <Switch
            checked={!!settings.includeInvalidTests}
            onCheckedChange={(c) => setSettingsField('includeInvalidTests', c)}
          />
        </div>
      )}

      {NUMERIC.map(({ key, label, hint, step }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            type="number"
            step={step}
            value={settings[key] ?? ''}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              setSettingsField(key, Number.isFinite(n) ? n : e.target.value);
            }}
            className="h-9 bg-slate-800 border-slate-700"
          />
          {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
        </div>
      ))}

      <div className="border-t border-slate-800 pt-3 space-y-2">
        <Label className="text-xs text-slate-400">Period</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date" value={range.from}
            onChange={(e) => setRangeField('from', e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
          <Input
            type="date" value={range.to}
            onChange={(e) => setRangeField('to', e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
        </div>
        <p className="text-[11px] text-slate-600">
          Leave both blank to allocate every metered date in the field.
        </p>
      </div>
    </div>
  );
};

export default SettingsPanel;
