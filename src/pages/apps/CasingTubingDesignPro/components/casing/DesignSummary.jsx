import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { fmtSF } from '../../services/ctRun';

// Summary across ALL load cases for the selected string: worst SF per
// mode with its governing load case.
const DesignSummary = ({ stringResult }) => {
  if (!stringResult || !stringResult.cases.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4 text-center text-xs text-slate-500">
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
  const statusColor = status === 'PASS' ? 'text-emerald-400' : status === 'WARNING' ? 'text-amber-400' : 'text-red-400';
  const borderColor = status === 'PASS' ? 'border-emerald-500/20' : status === 'WARNING' ? 'border-amber-500/20' : 'border-red-500/20';
  const bgColor = status === 'PASS' ? 'bg-emerald-500/5' : status === 'WARNING' ? 'bg-amber-500/5' : 'bg-red-500/5';

  const cell = (label, key, threshold) => (
    <div className="bg-slate-950/50 p-2 rounded border border-slate-800 text-center">
      <span className="text-[10px] text-slate-500 block">{label}</span>
      <span className={`text-sm font-mono font-bold ${worst[key] != null && worst[key] < threshold ? 'text-red-400' : 'text-white'}`}>
        {fmtSF(worst[key])}
      </span>
      {worstCase[key] && (
        <span className="text-[9px] text-slate-600 block truncate" title={worstCase[key]}>{worstCase[key]}</span>
      )}
    </div>
  );

  return (
    <Card className={`bg-slate-900 border-slate-800 ${borderColor}`}>
      <CardContent className={`p-4 ${bgColor}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-200">String Summary (all cases)</h3>
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
