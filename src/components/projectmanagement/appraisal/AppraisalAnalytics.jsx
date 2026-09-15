import React from 'react';
import NotTracked from '../NotTracked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Users, BarChart3, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

// --- KPI DASHBOARD ---
export const AppraisalKPIDashboard = () => (
    /* EC6-0: this chart plotted a fixed set of scores written into the
       source (Well Plan Quality, Drilling Safety (TRIR), Data Quality, ...) against their targets, the same bars on every project of
       this type. The studio records no measurement against these KPIs. */
    <NotTracked
        title="Appraisal KPIs"
        icon={BarChart3}
        tracks={['Well Plan Quality', 'Drilling Safety (TRIR)', 'Data Quality', 'Model Match', 'Budget Adherence']}
    />
);

// --- RISK MANAGER ---
export const AppraisalRiskManager = ({ risks }) => {
  const high = risks.filter(r => r.risk_score >= 15).length;
  const med = risks.filter(r => r.risk_score >= 8 && r.risk_score < 15).length;
  const low = risks.filter(r => r.risk_score < 8).length;

  const data = [
      { name: 'High', value: high, color: '#ef4444' },
      { name: 'Medium', value: med, color: '#f97316' },
      { name: 'Low', value: low, color: '#22c55e' }
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Risk Profile</CardTitle></CardHeader>
        <CardContent className="h-[250px] flex flex-col">
            <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{backgroundColor: '#1e293b', border: 'none', color: '#fff'}} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div> High ({high})</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-500 rounded-full"></div> Med ({med})</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Low ({low})</span>
            </div>
        </CardContent>
    </Card>
  );
};

// --- RESOURCE MANAGER ---
export const AppraisalResourceManager = ({ resources }) => {
  return (
    <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Users className="w-4 h-4"/> Team Structure</CardTitle></CardHeader>
        <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2">
                {resources.map((res, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-slate-800/50 rounded border border-slate-700">
                        <div>
                            <div className="text-xs font-bold text-slate-200">{res.discipline}</div>
                            <div className="text-[10px] text-slate-500">{res.type}</div>
                        </div>
                        <div className="text-xs text-slate-400">{res.name.includes('TBD') ? 'Unfilled' : 'Assigned'}</div>
                    </div>
                ))}
                {resources.length === 0 && <div className="text-center text-slate-500 text-xs py-4">No resources defined.</div>}
            </div>
        </CardContent>
    </Card>
  );
};