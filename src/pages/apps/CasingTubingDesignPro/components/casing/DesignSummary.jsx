import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { fmtSF } from '../../services/ctRun';

// Summary across ALL load cases for the selected string: worst SF per
// mode with its governing load case.
const DesignSummary = ({ stringResult }) => {
  if (!stringResult || !stringResult.cases.length) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-xs text-pl-muted">
          Add casing load cases to see results.
        </CardContent>
      </Card>
    );
  }

  const worst = { burstSF: null, collapseSF: null, tensionSF: null, triaxSF: null };
  const worstCase = { burstSF: null, collapseSF: null, tensionSF: null, triaxSF: null };
  let status = 'PASS';
  for (const c of stringResult.cases) {
    if (c.status === 'FAIL') status = 'FAIL';
    else if (c.status === 'WARNING' && status !== 'FAIL') status = 'WARNING';
    for (const s of c.sections) {
      for (const k of Object.keys(worst)) {
        if (Number.isFinite(s[k]) && (worst[k] == null || s[k] < worst[k])) {
          worst[k] = s[k];
          worstCase[k] = c.name;
        }
      }
    }
  }

  const StatusIcon = status === 'PASS' ? CheckCircle2 : status === 'WARNING' ? AlertTriangle : XCircle;
  const statusColor = status === 'PASS' ? 'text-pl-success-text' : status === 'WARNING' ? 'text-pl-warning-text' : 'text-pl-danger-text';
  const borderColor = status === 'PASS' ? 'border-pl-success/40' : status === 'WARNING' ? 'border-pl-warning/40' : 'border-pl-danger/40';
  const bgColor = status === 'PASS' ? 'bg-pl-success-bg' : status === 'WARNING' ? 'bg-pl-warning-bg' : 'bg-pl-danger-bg';

  const cell = (label, key, threshold) => (
    <div className="bg-pl-sunken p-2 rounded border border-pl-border text-center">
      <span className="text-[10px] text-pl-muted block">{label}</span>
      <span className={`text-sm font-pl-mono tabular-nums font-bold ${worst[key] != null && worst[key] < threshold ? 'text-pl-danger-text' : 'text-pl-text'}`}>
        {fmtSF(worst[key])}
      </span>
      {worstCase[key] && (
        <span className="text-[9px] text-pl-muted block truncate" title={worstCase[key]}>{worstCase[key]}</span>
      )}
    </div>
  );

  return (
    <Card className={borderColor}>
      <CardContent className={`p-4 ${bgColor}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-pl-text">String Summary (all cases)</h3>
          <div className={`flex items-center ${statusColor}`} data-testid="ct-string-status">
            <StatusIcon className="w-5 h-5 mr-2" />
            <span className="font-bold">{status}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {cell('Min Burst', 'burstSF', 1.1)}
          {cell('Min Coll.', 'collapseSF', 1.0)}
          {cell('Min Tens.', 'tensionSF', 1.6)}
          {cell('Min Triax.', 'triaxSF', 1.25)}
        </div>
      </CardContent>
    </Card>
  );
};

export default DesignSummary;
