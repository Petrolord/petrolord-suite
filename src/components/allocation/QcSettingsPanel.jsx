// Well test QC thresholds (left rail, Tests tab).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_TEST_QC_SETTINGS } from '@/utils/production/allocation';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const FIELDS = [
  { key: 'minDurationHours', label: 'Minimum test duration (hours)' },
  { key: 'outlierPct', label: 'Outlier against test history (%)' },
  { key: 'ledgerTolerancePct', label: 'Tolerance against the ledger (%)' },
  { key: 'watercutTolerancePts', label: 'Watercut tolerance (points)' },
];

const QcSettingsPanel = () => {
  const { inputs, setQcField } = useAllocation();
  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            type="number"
            value={inputs.qc[key] ?? ''}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              setQcField(key, Number.isFinite(n) ? n : e.target.value);
            }}
            className="h-9 bg-slate-800 border-slate-700"
          />
        </div>
      ))}
      <Button
        variant="ghost" size="sm" className="text-xs text-slate-400"
        onClick={() => Object.entries(DEFAULT_TEST_QC_SETTINGS).forEach(([k, v]) => setQcField(k, v))}
      >
        <RotateCcw size={12} className="mr-1" /> Reset to defaults
      </Button>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Every check runs against data the spine already holds: the well's own test history and the
        daily ledger on the test date. Rejecting a test excludes it from allocation.
      </p>
    </div>
  );
};

export default QcSettingsPanel;
