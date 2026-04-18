import React from 'react';
import { useRiskRegister } from './hooks/useRiskRegister';
import { RiskHeatmapMatrix } from './components/RiskHeatmapMatrix';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Info } from 'lucide-react';

const RiskHeatmapPage = ({ setActiveTab }) => {
  const { risks, loading } = useRiskRegister();

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
      );
  }

  // Usually heatmaps focus on open risks
  const activeRisks = risks.filter(r => r.status !== 'Closed' && r.status !== 'Draft');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
          <h2 className="text-2xl font-bold text-white mb-2">Corporate Risk Heatmap</h2>
          <p className="text-slate-400">Visual distribution of all active risks across probability and impact dimensions.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="border-b border-slate-800/50">
              <CardTitle className="flex items-center gap-2">
                  Inherent Risk Matrix
              </CardTitle>
              <CardDescription>Click any cell to drill down into the specific risks.</CardDescription>
          </CardHeader>
          <CardContent className="p-12 flex flex-col items-center justify-center min-h-[500px]">
              <RiskHeatmapMatrix 
                  risks={activeRisks} 
                  onCellClick={(l, i) => setActiveTab('register')}
              />
          </CardContent>
      </Card>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 text-blue-400 text-sm">
          <Info className="w-5 h-5 shrink-0" />
          <p><strong>Note:</strong> This heatmap represents inherent risk (before mitigation). Residual risk mapping is configured in the advanced reporting module.</p>
      </div>
    </div>
  );
};

export default RiskHeatmapPage;