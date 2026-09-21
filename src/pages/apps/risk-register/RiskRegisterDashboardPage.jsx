import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRiskRegister } from './hooks/useRiskRegister';
import { RiskHeatmapMatrix } from './components/RiskHeatmapMatrix';
import { RiskScoreBadge, RiskStatusBadge } from './components/RiskBadges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, TrendingUp, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { RISK_LIVE_STATUSES } from '@/lib/riskScoring';
import { cellFilter } from './utils/registerFilter';
import { LIVE_SCOPE, liveRisks, registerCounts } from './utils/registerCounts';

const RiskRegisterDashboardPage = ({ onDrillDown }) => {
  const { risks, loading, error } = useRiskRegister();
  const navigate = useNavigate();

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
      );
  }

  if (error) {
      return (
          <div className="p-6 max-w-2xl mx-auto">
              <Card className="bg-slate-900 border-red-500/30">
                  <CardContent className="p-6 space-y-2">
                      <h3 className="text-lg font-semibold text-white">The register could not be loaded</h3>
                      <p className="text-sm text-slate-400">{error}</p>
                      <p className="text-xs text-slate-500">
                          Nothing is shown rather than an empty register, because an
                          empty register and a broken one are not the same thing.
                      </p>
                  </CardContent>
              </Card>
          </div>
      );
  }

  // ASC-0 (RC-6): one population for every live figure on this page,
  // the engine's RISK_LIVE_STATUSES, the same one the Heatmap tab plots.
  const live = liveRisks(risks);
  const counts = registerCounts(risks);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Quick Actions & High Level Metrics */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent data-testid="tile-live" className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-white">{counts.live}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Live risks</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{RISK_LIVE_STATUSES.join(', ')}</span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent data-testid="tile-live-critical" className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-red-500">{counts.liveCritical}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3 text-red-500"/> Live and Critical
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Inherent score in the Critical band</span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent data-testid="tile-mitigated" className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-green-500">{counts.liveMitigated}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500"/> Mitigated
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Still live, residual lowered</span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent data-testid="tile-not-live" className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-slate-300">{counts.notLive}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Draft or closed</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Of {counts.recorded} recorded</span>
              </CardContent>
            </Card>
        </div>
        <Button onClick={() => navigate('/dashboard/apps/assurance/risk-register/new')} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Record New Risk
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Heatmap Widget */}
          <Card className="lg:col-span-1 bg-slate-900 border-slate-800 flex flex-col">
              <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                      Inherent Risk Profile
                  </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-center py-6">
                  <RiskHeatmapMatrix 
                      risks={live}
                      onCellClick={(l, i) => onDrillDown(cellFilter(l, i, RISK_LIVE_STATUSES, LIVE_SCOPE))}
                  />
              </CardContent>
          </Card>

          {/* Top open risks. It was titled "Top Critical & High Risks" with
              no band filter, so Low and Medium risks appeared under that
              title (AS13). */}
          <Card className="lg:col-span-2 bg-slate-900 border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-red-500" />
                      Highest scoring live risks
                  </CardTitle>
                  <Button variant="link" className="text-indigo-400 text-sm" onClick={() => onDrillDown(null)}>
                      View All
                  </Button>
              </CardHeader>
              <CardContent>
                  <div className="space-y-2">
                      {[...live].sort((a,b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 5).map(risk => (
                          <div 
                              key={risk.id} 
                              onClick={() => navigate(`/dashboard/apps/assurance/risk-register/${risk.id}`)}
                              className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-800 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-mono text-slate-500">{risk.risk_id}</span>
                                      <RiskStatusBadge status={risk.status} className="text-[10px] px-1.5 py-0" />
                                  </div>
                                  <h4 className="text-sm font-medium text-slate-200 truncate">{risk.title}</h4>
                                  <p className="text-xs text-slate-400 truncate mt-1">{risk.category}</p>
                              </div>
                              <div className="shrink-0">
                                  <RiskScoreBadge score={risk.risk_score} />
                              </div>
                          </div>
                      ))}
                      {live.length === 0 && (
                          <div className="text-center py-8 text-slate-500">
                              No live risk: none is Open, Under Review, Mitigated or Realized.
                          </div>
                      )}
                  </div>
              </CardContent>
          </Card>
      </div>

    </div>
  );
};

export default RiskRegisterDashboardPage;