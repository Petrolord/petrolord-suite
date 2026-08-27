// Report tab: the AFE summary, PDF export, cross-links to the AFE Cost
// Control Manager (budget tracking) and Petroleum Economics Studio
// (well cost as CAPEX), and the immutable run history.

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trash2, Save, ExternalLink, FileDown } from 'lucide-react';
import { exportAfePdf } from '../services/wctExport';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const usd = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '--');

export default function ReportTab({
  caseDraft, res, mc, wellboreName, onSaveRun, savingRun, runs, onDeleteRun,
}) {
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        {res && (
          <Card title="Estimate summary" testId="wct-summary-card">
            <div className="text-xs text-slate-300">
              <div className="flex justify-between border-b border-slate-800/60 py-1">
                <span>Duration</span>
                <span className="font-mono" data-testid="wct-report-days">{res.program.totals.totalDays.toFixed(1)} days</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 py-1">
                <span>AFE total (deterministic, with contingency)</span>
                <span className="font-mono" data-testid="wct-report-total">{usd(res.costs.totalUsd)} USD</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 py-1">
                <span>Base cost per drilled metre</span>
                <span className="font-mono">{res.kpis.usdPerMeter == null ? '--' : `${res.kpis.usdPerMeter.toFixed(0)} USD/m`}</span>
              </div>
              {mc && (
                <div className="flex justify-between py-1">
                  <span>Probabilistic base cost P10 / P50 / P90</span>
                  <span className="font-mono" data-testid="wct-report-mc">
                    {usd(mc.cost.p10)} / {usd(mc.cost.p50)} / {usd(mc.cost.p90)} USD
                  </span>
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={!res}
              data-testid="wct-export-pdf"
              onClick={() => exportAfePdf({ caseRow: caseDraft, wellboreName, res, mc })}>
              <FileDown className="mr-1 h-3 w-3" /> Export AFE PDF
            </Button>
          </Card>
        )}

        <Card title="Budget control" testId="wct-afe-link-card">
          <div className="text-xs text-slate-400">
            Track authorized spend against this estimate (invoices, budget changes, JV partners)
            in the AFE Cost Control Manager.
          </div>
          <Link to="/dashboard/apps/economics/afe-cost-control-manager"
            className="mt-2 inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300 hover:bg-slate-700">
            <ExternalLink className="h-3 w-3" /> Open AFE Cost Control Manager
          </Link>
        </Card>

        <Card title="Economics" testId="wct-econ-link-card">
          <div className="text-xs text-slate-400">
            Feed the well cost into a full-cycle evaluation (CAPEX line, phasing, fiscal terms)
            in Petroleum Economics Studio.
          </div>
          <Link to="/dashboard/apps/economics/epe/cases"
            className="mt-2 inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300 hover:bg-slate-700">
            <ExternalLink className="h-3 w-3" /> Open Economics Studio
          </Link>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Card title="Run history (immutable)" testId="wct-runs-card">
          <Button size="sm" variant="outline" className="mb-2 h-7 text-xs" disabled={savingRun || !res}
            onClick={onSaveRun} data-testid="wct-save-run">
            <Save className="mr-1 h-3 w-3" /> {savingRun ? 'Saving...' : 'Save run'}
          </Button>
          {(runs || []).map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-t border-slate-800 py-1 text-xs text-slate-400"
              data-testid="wct-run-row">
              <span>{new Date(r.created_at).toLocaleString()}</span>
              <span className="font-mono">{r.summary?.totalDays?.toFixed?.(1) ?? r.summary?.totalDays} d</span>
              <span className="font-mono">{usd(r.summary?.totalUsd)} USD</span>
              {Number.isFinite(r.summary?.mcP50Usd) && <span className="font-mono">P50 {usd(r.summary.mcP50Usd)}</span>}
              <button type="button" className="ml-auto text-slate-500 hover:text-red-400"
                onClick={() => onDeleteRun(r.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {(runs || []).length === 0 && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        </Card>
      </div>
    </div>
  );
}
