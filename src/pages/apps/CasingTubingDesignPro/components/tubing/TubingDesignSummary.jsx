import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, Wind } from 'lucide-react';
import { fmtSF, nToKN } from '../../services/ctRun';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// Summary across the tubing operating cases: worst total force, worst
// packer SF, buckling flags, and the API RP 14E erosional velocity.
const TubingDesignSummary = ({ tubingResult }) => {
  if (!tubingResult || !tubingResult.cases.length) {
    return (
      <Card>
        <CardContent className="p-3 text-center text-xs text-pl-muted">
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
  const statusColor = status === 'PASS' ? 'text-pl-success-text' : status === 'WARNING' ? 'text-pl-warning-text' : 'text-pl-danger-text';

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className={`flex items-center ${statusColor}`} data-testid="ct-tubing-status">
              <StatusIcon className="w-4 h-4 mr-1.5" />
              <span className="font-bold text-sm">{status}</span>
            </div>
            <div className="text-[10px] text-pl-muted">
              Worst packer force
              <span data-testid="ct-tubing-total-force" className="text-pl-text font-pl-mono tabular-nums font-bold block text-xs">
                {worstForce != null ? `${nToKN(worstForce).toFixed(1)} kN` : EMPTY_VALUE}
              </span>
            </div>
            <div className="text-[10px] text-pl-muted">
              Min packer SF
              <span data-testid="ct-packer-sf" className="text-pl-text font-pl-mono tabular-nums font-bold block text-xs">
                {fmtSF(worstPackerSF)}
              </span>
            </div>
            <div className="text-[10px] text-pl-muted">
              Buckling flags
              <span className="text-pl-text font-pl-mono tabular-nums font-bold block text-xs">{buckled} / {tubingResult.cases.length}</span>
            </div>
          </div>

          {tubingResult.erosional && (
            <div className="flex items-center text-pl-muted text-[10px]">
              <Wind className="w-3 h-3 mr-1" />
              <span>
                Erosional velocity
                <span data-testid="ct-erosional-ve" className="font-bold font-pl-mono tabular-nums block text-xs text-pl-text">
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
