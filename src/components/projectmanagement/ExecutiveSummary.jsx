import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, DollarSign, Activity, PieChart } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { calculateEVM } from '@/utils/projectManagementCalculations';

const MetricCard = ({ title, value, subtext, icon: Icon, testId }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-pl-muted">{title}</p>
          <h3 className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text mt-2" data-testid={testId}>{value}</h3>
        </div>
        <div className="p-2 rounded-lg bg-pl-sunken text-pl-muted">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-4 text-xs text-pl-muted">{subtext}</div>
    </CardContent>
  </Card>
);

// Senior test T1 (2026-09-27): these cards used to show SPI and CPI of 1.00
// for every portfolio (projects carry no index, so the fallback won), four
// hard-coded trend chips, a critical-risk count over a list nobody passed
// in, and a health split on Green/Amber/Red while status holds "Active".
// Each figure now comes from the projects' own tasks and risks through the
// earned value engine, as of today.
// Health bands: both indexes at 0.95 or better is on track, either below
// 0.90 is critical, anything between is at risk (the usual EVM traffic
// light). A project with no costed, dated tasks is not measured.
export const CRITICAL_RISK_SCORE = 15;
export const healthOf = (evm) => {
  if (!evm || evm.cpi == null || evm.spi == null) return 'unmeasured';
  if (evm.cpi < 0.9 || evm.spi < 0.9) return 'critical';
  if (evm.cpi < 0.95 || evm.spi < 0.95) return 'atRisk';
  return 'onTrack';
};

export function summarisePortfolio(projects, tasks, risks, asOf) {
  const ids = new Set(projects.map((p) => p.id));
  let ev = 0; let ac = 0; let pv = 0; let evPhased = 0;
  const health = { onTrack: 0, atRisk: 0, critical: 0, unmeasured: 0 };
  projects.forEach((p) => {
    let evm = null;
    try { evm = calculateEVM(tasks.filter((t) => t.project_id === p.id && !t.is_archived), { asOf }); } catch { evm = null; }
    if (evm && evm.costed) {
      ev += evm.ev; ac += evm.ac;
      if (evm.pv != null) { pv += evm.pv; evPhased += evm.ev; }
    }
    health[healthOf(evm)] += 1;
  });
  return {
    totalBudget: projects.reduce((sum, p) => sum + (parseFloat(p.baseline_budget) || 0), 0),
    spi: pv > 0 ? evPhased / pv : null,
    cpi: ac > 0 ? ev / ac : null,
    highRisks: risks.filter((r) => ids.has(r.project_id) && String(r.status || '').toLowerCase() !== 'closed' && Number(r.risk_score) >= CRITICAL_RISK_SCORE).length,
    health,
  };
}

const ExecutiveSummary = ({ projects }) => {
  const [tasks, setTasks] = useState([]);
  const [risks, setRisks] = useState([]);
  const idKey = projects.map((p) => p.id).join(',');

  useEffect(() => {
    const ids = idKey ? idKey.split(',') : [];
    if (!ids.length) { setTasks([]); setRisks([]); return undefined; }
    let live = true;
    (async () => {
      const [t, r] = await Promise.all([
        supabase.from('tasks').select('*').in('project_id', ids),
        supabase.from('risks').select('*').in('project_id', ids),
      ]);
      if (!live) return;
      setTasks(t.data || []);
      setRisks(r.data || []);
    })();
    return () => { live = false; };
  }, [idKey]);

  const metrics = useMemo(() => summarisePortfolio(projects, tasks, risks, new Date()), [projects, tasks, risks]);
  const idx = (v) => (v == null ? '-' : v.toFixed(2));

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(val);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard 
            title="Total Baseline Budget" 
            value={formatCurrency(metrics.totalBudget)} 
            subtext={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
            icon={DollarSign}
        />
        <MetricCard 
            title="Schedule Performance" 
            value={idx(metrics.spi)} 
            testId="pm-portfolio-spi"
            subtext={metrics.spi == null ? 'No dated, costed tasks yet' : 'SPI, earned over planned value, as of today'}
            icon={Activity}
        />
        <MetricCard 
            title="Cost Performance" 
            value={idx(metrics.cpi)} 
            testId="pm-portfolio-cpi"
            subtext={metrics.cpi == null ? 'No actual cost booked yet' : 'CPI, earned value over actual cost'}
            icon={PieChart}
        />
        <MetricCard 
            title="Critical Risks" 
            value={metrics.highRisks} 
            testId="pm-portfolio-risks"
            subtext={`Open risks scoring ${CRITICAL_RISK_SCORE} or more`}
            icon={AlertTriangle}
        />
        
        {/* Mini RAG Breakdown included in layout via CSS grid spanning or just simple summary below */}
        <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-pl-surface border border-pl-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-pl-muted" title="On track: CPI and SPI both 0.95 or better. Critical: either below 0.90.">Project health (CPI and SPI):</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-pl-success" aria-hidden="true" />
                    <span className="text-pl-text font-bold font-pl-mono tabular-nums">{metrics.health.onTrack}</span>
                    <span className="text-pl-muted text-sm">On Track</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-pl-warning" aria-hidden="true" />
                    <span className="text-pl-text font-bold font-pl-mono tabular-nums">{metrics.health.atRisk}</span>
                    <span className="text-pl-muted text-sm">At Risk</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-pl-danger" aria-hidden="true" />
                    <span className="text-pl-text font-bold font-pl-mono tabular-nums">{metrics.health.critical}</span>
                    <span className="text-pl-muted text-sm">Critical</span>
                </div>
                {metrics.health.unmeasured > 0 && (
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-pl-border-strong" aria-hidden="true" />
                        <span className="text-pl-text font-bold font-pl-mono tabular-nums">{metrics.health.unmeasured}</span>
                        <span className="text-pl-muted text-sm">Not measured</span>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ExecutiveSummary;