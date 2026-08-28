// The nodal cross-check of well tests (Test QC tab, Production P6.5).
//
// P3 deferred this and said why: checking a test against what the well
// SHOULD make needs a per-well IPR and VLP, and the spine knew the
// wells but not what they do. P6.5 gave wells a shared model, so the
// check is possible and this is it.
//
// A well test records a rate and a tubing head pressure. Feed that
// pressure to the well's own model, solve where inflow meets outflow,
// and the rate that comes out is what the well should have made. A test
// that disagrees with its own well is either a bad test or a well that
// has changed, and both are worth knowing before that test is used to
// allocate a month of production.
import React from 'react';
import { Play, Activity, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const STATUS = {
  dead: { label: 'Will not flow', className: 'text-red-400' },
  off: { label: 'Disagrees', className: 'text-amber-300' },
  ok: { label: 'Agrees', className: 'text-emerald-400' },
  'no-thp': { label: 'No wellhead pressure', className: 'text-slate-500' },
  'no-model': { label: 'No well model', className: 'text-slate-500' },
};

const NodalCheckPanel = () => {
  const { nodalCheck, runNodalCrossCheck, isCrossChecking } = useAllocation();
  const results = nodalCheck?.results || [];
  const checked = results.filter((r) => r.status === 'ok' || r.status === 'off' || r.status === 'dead');
  const disagreeing = results.filter((r) => r.status === 'off' || r.status === 'dead');

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" /> Against each well's own model
          <span className="text-xs font-normal text-slate-500">
            the nodal cross-check
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={runNodalCrossCheck} disabled={isCrossChecking} className="h-9">
            {isCrossChecking
              ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              : <Play className="w-3.5 h-3.5 mr-1" />}
            Run cross-check
          </Button>
          {nodalCheck && (
            <p className="text-[11px] text-slate-500">
              {checked.length} of {results.length} test{results.length === 1 ? '' : 's'} checked
              against {nodalCheck.modelCount} well model{nodalCheck.modelCount === 1 ? '' : 's'},{' '}
              {disagreeing.length} disagreeing.
            </p>
          )}
        </div>

        {!nodalCheck ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Each test is checked by solving the well's model at the wellhead pressure the test
            recorded, which marches a tubing traverse per rate, so it runs when you ask for it.
            Wells get a model when one is saved from the gas lift, ESP or rod pump studio.
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No well tests in this field to check.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="text-left font-semibold px-3 py-2">Well</th>
                  <th className="text-left font-semibold px-3 py-2">Test date</th>
                  <th className="text-right font-semibold px-3 py-2">Measured (stb/d)</th>
                  <th className="text-right font-semibold px-3 py-2">Nodal (stb/d)</th>
                  <th className="text-right font-semibold px-3 py-2">Deviation</th>
                  <th className="text-left font-semibold px-3 py-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const st = STATUS[r.status] || STATUS.ok;
                  return (
                    <tr key={r.testId} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-slate-200">{r.wellName}</td>
                      <td className="px-3 py-2 text-slate-400">{r.testDate}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.measuredStbd)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {r.nodalStbd == null ? '--' : fmt(r.nodalStbd)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${st.className}`}>
                        {r.deviationPct == null ? '--' : `${r.deviationPct > 0 ? '+' : ''}${fmt(r.deviationPct)} %`}
                      </td>
                      <td className={`px-3 py-2 text-[11px] ${st.className}`}>{st.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nodalCheck && disagreeing.length > 0 && (
          <ul className="space-y-2 border-t border-slate-800 pt-3">
            {disagreeing.slice(0, 6).map((r) => (
              <li key={r.testId} className="text-[11px] text-amber-100/80">
                <span className="text-slate-400">{r.wellName} {r.testDate}:</span> {r.message}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default NodalCheckPanel;
