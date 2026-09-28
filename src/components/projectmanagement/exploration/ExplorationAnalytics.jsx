import React from 'react';
import NotTracked from '../NotTracked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartLogo from '@/components/charts/ChartLogo';
import { TOOLTIP_STYLE } from '@/utils/chartTheme';
import { AlertTriangle, Users, BarChart3, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

// --- KPI DASHBOARD ---
export const ExplorationKPIDashboard = () => (
    /* EC6-0: this chart plotted a fixed set of scores written into the
       source (Seismic Quality, Model Accuracy, Schedule Adherence, ...) against their targets, the same bars on every project of
       this type. The studio records no measurement against these KPIs. */
    <NotTracked
        title="Performance KPIs"
        icon={BarChart3}
        tracks={['Seismic Quality', 'Model Accuracy', 'Schedule Adherence', 'Budget Adherence']}
    />
);

// --- RISK MANAGER ---
export const ExplorationRiskManager = ({ risks }) => {
  const high = risks.filter(r => r.risk_score >= 15).length;
  const med = risks.filter(r => r.risk_score >= 8 && r.risk_score < 15).length;
  const low = risks.filter(r => r.risk_score < 8).length;

  const data = [
      { name: 'High', value: high, color: '#ef4444' },
      { name: 'Medium', value: med, color: '#f97316' },
      { name: 'Low', value: low, color: '#22c55e' }
  ];

  return (
    <ChartPanel
        title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Risk Profile</span>}
        bodyClassName="h-[250px] flex flex-col"
    >
            <div className="relative flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                </ResponsiveContainer>
                <ChartLogo />
            </div>
            <div className="flex justify-center gap-4 text-xs text-pl-muted">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: data[0].color }} aria-hidden="true" /> High ({high})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: data[1].color }} aria-hidden="true" /> Med ({med})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: data[2].color }} aria-hidden="true" /> Low ({low})</span>
            </div>
    </ChartPanel>
  );
};

// --- RESOURCE MANAGER ---
export const ExplorationResourceManager = ({ resources }) => {
  return (
    <Card>
        <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Users className="w-4 h-4 text-pl-muted"/> Team Structure</CardTitle></CardHeader>
        <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2">
                {resources.map((res, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-pl-sunken rounded border border-pl-border">
                        <div>
                            <div className="text-xs font-bold text-pl-text">{res.discipline}</div>
                            <div className="text-[10px] text-pl-muted">{res.type}</div>
                        </div>
                        <div className="text-xs text-pl-muted">{!res.name || String(res.name).includes('TBD') ? 'Unfilled' : res.name}</div>
                    </div>
                ))}
                {resources.length === 0 && <div className="text-center text-pl-muted text-xs py-4">No resources defined.</div>}
            </div>
        </CardContent>
    </Card>
  );
};