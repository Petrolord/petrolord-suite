import React from 'react';
import { useRiskRegister } from './hooks/useRiskRegister';
import { RiskHeatmapMatrix } from './components/RiskHeatmapMatrix';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Info } from 'lucide-react';
import { RISK_LIVE_STATUSES } from '@/lib/riskScoring';
import { cellFilter } from './utils/registerFilter';
import { LIVE_SCOPE, liveRisks } from './utils/registerCounts';

const RiskHeatmapPage = ({ onDrillDown }) => {
  const { risks, loading } = useRiskRegister();

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
      );
  }

  // The risks an organization still carries, from the one status split.
  const activeRisks = liveRisks(risks);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
          <h2 className="text-2xl font-bold text-white mb-2">Corporate Risk Heatmap</h2>
          <p className="text-slate-400">Every live risk ({RISK_LIVE_STATUSES.join(', ')}) by likelihood and impact.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="border-b border-slate-800/50">
              <CardTitle className="flex items-center gap-2">
                  Inherent Risk Matrix
              </CardTitle>
              <CardDescription>Click a cell to list its risks in the register.</CardDescription>
          </CardHeader>
          <CardContent className="p-12 flex flex-col items-center justify-center min-h-[500px]">
              <RiskHeatmapMatrix 
                  risks={activeRisks} 
                  onCellClick={(l, i) => onDrillDown(cellFilter(l, i, RISK_LIVE_STATUSES, LIVE_SCOPE))}
              />
          </CardContent>
      </Card>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 text-blue-400 text-sm">
          <Info className="w-5 h-5 shrink-0" />
          <p><strong>Note:</strong> This heatmap plots inherent risk, before mitigation. Each risk&apos;s residual score is shown on its own page, and the Residual Score column can be added to a report in Advanced Reports.</p>
      </div>
    </div>
  );
};

export default RiskHeatmapPage;