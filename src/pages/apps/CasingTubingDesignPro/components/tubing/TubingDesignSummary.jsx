import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, Wind } from 'lucide-react';
import { fmtSF, nToKN } from '../../services/ctRun';

// Summary across the tubing operating cases: worst total force, worst
// packer SF, buckling flags, and the API RP 14E erosional velocity.
const TubingDesignSummary = ({ tubingResult }) => {
  if (!tubingResult || !tubingResult.cases.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-3 text-center text-xs text-slate-500">
          Add tubing load cases (and a packer) to see the force system.
        </CardContent>
      </Card>
    );
  }

  let status = 'PASS';
  let worstForce = null;
  let worstPackerSF = null;
  let buckled = 0;
  for (const c of tubingResult.cases) {
    if (c.status === 'FAIL') status = 'FAIL';
    else if (c.status === 'WARNING' && status !== 'FAIL') status = 'WARNING';
    const f = c.loads.forces.totalN;
    if (worstForce == null || Math.abs(f) > Math.abs(worstForce)) worstForce = f;
    const sf = c.loads.packer.sf;
    if (sf != null && (worstPackerSF == null || sf < worstPackerSF)) worstPackerSF = sf;
    if (c.loads.buckling.state !== 'none') buckled += 1;
  }

  const StatusIcon = status === 'PASS' ? CheckCircle2 : status === 'WARNING' ? AlertTriangle : XCircle;
  const statusColor = status === 'PASS' ? 'text-emerald-400' : status === 'WARNING' ? 'text-amber-400' : 'text-red-400';

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className={`flex items-center ${statusColor}`} data-testid="ct-tubing-status">
              <StatusIcon className="w-4 h-4 mr-1.5" />
              <span className="font-bold text-sm">{status}</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Worst packer force
              <span data-testid="ct-tubing-total-force" className="text-slate-200 font-mono font-bold block text-xs">
                {worstForce != null ? `${nToKN(worstForce).toFixed(1)} kN` : '—'}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Min packer SF
              <span data-testid="ct-packer-sf" className="text-slate-200 font-mono font-bold block text-xs">
                {fmtSF(worstPackerSF)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Buckling flags
              <span className="text-slate-200 font-mono font-bold block text-xs">{buckled} / {tubingResult.cases.length}</span>
            </div>
          </div>

          {tubingResult.erosional && (
            <div className="flex items-center text-cyan-400 text-[10px]">
              <Wind className="w-3 h-3 mr-1" />
              <span>
                Erosional velocity
                <span data-testid="ct-erosional-ve" className="font-bold font-mono block text-xs">
                  {tubingResult.erosional.veMs.toFixed(1)} m/s
                </span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TubingDesignSummary;
