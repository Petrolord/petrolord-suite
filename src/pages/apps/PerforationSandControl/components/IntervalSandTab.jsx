// Interval & Sand tab: perforated interval on the trajectory, the sieve
// analysis (table + CSV paste), PSD chart and the D-value statistics.
// Every number is the engine's — recomputed by the e2e spec through psRun.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash } from 'lucide-react';
import { depthDisp, depthStore, depthLabel, parseSieveCsv } from '../services/psRun';
import { PsdChart } from '../charts/PsCharts';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

const um = (m) => (m == null ? '--' : (m * 1e6).toFixed(0));

export default function IntervalSandTab({ caseDraft, onCaseChange, res, depthUnit }) {
  const unit = depthLabel(depthUnit);
  const [csv, setCsv] = useState('');
  const [csvErrors, setCsvErrors] = useState([]);
  const stats = res?.sand?.stats || null;
  const points = caseDraft.sieve?.points || [];

  const applyCsv = () => {
    const { points: parsed, errors } = parseSieveCsv(csv);
    setCsvErrors(errors);
    if (parsed.length >= 4) {
      onCaseChange((d) => { d.sieve = { source: 'csv', points: parsed }; });
    } else if (!errors.length) {
      setCsvErrors(['Need at least 4 valid rows.']);
    }
  };

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title={`Perforated interval (MD, ${unit})`} testId="ps-interval-card">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Top</span>
            <Input className="h-7 w-24 text-xs" type="number" data-testid="ps-interval-top"
              value={Math.round(depthDisp(caseDraft.interval.topMdM, depthUnit))}
              onChange={(e) => onCaseChange((d) => { d.interval.topMdM = depthStore(num(e.target.value), depthUnit); })} />
            <span>Bottom</span>
            <Input className="h-7 w-24 text-xs" type="number" data-testid="ps-interval-bottom"
              value={Math.round(depthDisp(caseDraft.interval.bottomMdM, depthUnit))}
              onChange={(e) => onCaseChange((d) => { d.interval.bottomMdM = depthStore(num(e.target.value), depthUnit); })} />
          </div>
        </Card>

        <Card title="Sieve analysis (cumulative % retained per grain size)" testId="ps-sieve-card">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-right">Size (um)</th>
                <th className="px-1 py-1 text-right">Cum. retained (%)</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody data-testid="ps-sieve-rows">
              {points.map((p, i) => (
                <tr key={i} className="border-t border-slate-800 text-slate-300">
                  <td className="px-1 py-1 text-right font-mono">{(p.sizeM * 1e6).toFixed(0)}</td>
                  <td className="px-1 py-1 text-right font-mono">{p.cumRetainedPct.toFixed(1)}</td>
                  <td className="px-1 py-1 text-right">
                    <button type="button" className="text-slate-500 hover:text-red-400"
                      onClick={() => onCaseChange((d) => { d.sieve.points.splice(i, 1); })}>
                      <Trash className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-slate-500">
            Paste CSV rows as size_um, cum_retained_pct (finer sizes retain more):
          </div>
          <Textarea className="mt-1 h-20 font-mono text-xs" value={csv} data-testid="ps-sieve-csv"
            onChange={(e) => setCsv(e.target.value)} placeholder={'500, 2\n350, 6\n250, 14\n177, 28'} />
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyCsv} data-testid="ps-sieve-apply">
              Replace points
            </Button>
            {csvErrors.map((e, i) => (
              <span key={i} className="text-[10px] text-red-400">{e}</span>
            ))}
          </div>
        </Card>

        <Card title="Statistics" testId="ps-stats-card">
          {!stats ? (
            <div className="text-xs text-slate-500">Add at least 4 sieve points.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
              <div>D10 <span className="float-right font-mono" data-testid="ps-d10">{um(stats.d10M)} um</span></div>
              <div>D40 <span className="float-right font-mono">{um(stats.d40M)} um</span></div>
              <div>D50 <span className="float-right font-mono" data-testid="ps-d50">{um(stats.d50M)} um</span></div>
              <div>D70 <span className="float-right font-mono">{um(stats.d70M)} um</span></div>
              <div>D90 <span className="float-right font-mono">{um(stats.d90M)} um</span></div>
              <div>D95 <span className="float-right font-mono">{um(stats.d95M)} um</span></div>
              <div>C_u (D40/D90) <span className="float-right font-mono" data-testid="ps-cu">{stats.uniformity == null ? '--' : stats.uniformity.toFixed(2)}</span></div>
              <div>Sorting (D10/D95) <span className="float-right font-mono">{stats.sorting == null ? '--' : stats.sorting.toFixed(2)}</span></div>
              <div>Fines &lt;44um <span className="float-right font-mono" data-testid="ps-fines">{stats.finesPct == null ? '--' : `${stats.finesPct.toFixed(1)}%`}</span></div>
            </div>
          )}
        </Card>
      </div>

      <div className="min-h-[420px]">
        <PsdChart points={points} gravel={res?.sand?.gravel || null} />
      </div>
    </div>
  );
}
