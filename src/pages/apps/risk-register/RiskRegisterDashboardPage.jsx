import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRiskRegister } from './hooks/useRiskRegister';
import { RiskHeatmapMatrix } from './components/RiskHeatmapMatrix';
import { RiskScoreBadge, RiskStatusBadge } from './components/RiskBadges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, TrendingUp, AlertOctagon, CheckCircle2 } from 'lucide-react';

const RiskRegisterDashboardPage = ({ setActiveTab }) => {
  const { risks, loading } = useRiskRegister();
  const navigate = useNavigate();

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
      );
  }

  const openRisks = risks.filter(r => r.status === 'Open' || r.status === 'Under Review');
  const criticalRisks = openRisks.filter(r => r.risk_score >= 15);
  const mitigatedRisks = risks.filter(r => r.status === 'Mitigated' || r.status === 'Closed');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Quick Actions & High Level Metrics */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-white">{risks.length}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total Risks</span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-blue-400">{openRisks.length}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Open</span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-red-500">{criticalRisks.length}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3 text-red-500"/> Critical
                  </span>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                  <span className="text-3xl font-bold text-green-500">{mitigatedRisks.length}</span>
                  <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500"/> Mitigated
                  </span>
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
                      risks={openRisks} 
                      onCellClick={(l, i) => setActiveTab('register')}
                  />
              </CardContent>
          </Card>

          {/* Top Critical Risks List */}
          <Card className="lg:col-span-2 bg-slate-900 border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-red-500" />
                      Top Critical & High Risks
                  </CardTitle>
                  <Button variant="link" className="text-indigo-400 text-sm" onClick={() => setActiveTab('register')}>
                      View All
                  </Button>
              </CardHeader>
              <CardContent>
                  <div className="space-y-2">
                      {openRisks.sort((a,b) => b.risk_score - a.risk_score).slice(0, 5).map(risk => (
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
                      {openRisks.length === 0 && (
                          <div className="text-center py-8 text-slate-500">
                              No open risks found. Great job!
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