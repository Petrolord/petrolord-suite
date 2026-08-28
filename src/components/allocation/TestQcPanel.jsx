// Well test QC (Tests tab). Every test in the field with its QC verdict
// from utils/production/allocation.validateWellTests, and the accept or
// reject decision that decides whether it carries a well in the
// allocation. Rejection is a spine write (po_well_tests.is_valid), so
// it holds for every production app, not just this session.
import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Trash2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TEST_ISSUES } from '@/utils/production/allocation';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '--');

const SEVERITY_STYLE = {
  high: 'text-red-300 bg-red-500/10 border-red-500/40',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
  info: 'text-slate-300 bg-slate-800/60 border-slate-700/60',
};

const TestQcPanel = () => {
  const {
    tests, testQc, testQcById, canEditField, currentField,
    setTestValid, removeTest, rejectFlaggedTests,
  } = useAllocation();
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => ({
    all: tests.length,
    flagged: testQc.length,
    rejected: tests.filter((t) => t.is_valid === false).length,
  }), [tests, testQc]);

  const shown = useMemo(() => {
    if (filter === 'flagged') return tests.filter((t) => testQcById.has(t.id));
    if (filter === 'rejected') return tests.filter((t) => t.is_valid === false);
    return tests;
  }, [tests, testQcById, filter]);

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail to review its well tests.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-400" /> Well test QC
          <span className="text-xs font-normal text-slate-500">
            {counts.flagged} flagged of {counts.all}, {counts.rejected} rejected
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 items-center">
          {['all', 'flagged', 'rejected'].map((f) => (
            <Button
              key={f} size="sm" variant={filter === f ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-xs capitalize" onClick={() => setFilter(f)}
            >
              {f} ({counts[f] ?? 0})
            </Button>
          ))}
          {canEditField && testQc.some((r) => r.severity === 'high') && (
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => rejectFlaggedTests('high')}
            >
              Reject all high-severity
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {tests.length === 0 ? (
          <p className="text-sm text-slate-500">
            No well tests in this field yet. Import them on the Data tab, or from the Surveillance
            Studio; both write the same spine table.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">No tests match this filter.</p>
        ) : (
          <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
            {shown.map((t) => {
              const qc = testQcById.get(t.id);
              const rejected = t.is_valid === false;
              return (
                <div
                  key={t.id}
                  className={`border rounded px-3 py-2 ${qc ? SEVERITY_STYLE[qc.severity] : 'border-slate-800 bg-slate-900'} ${rejected ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-semibold text-slate-100">{t.well?.name || 'Unknown well'}</span>
                        <span className="text-slate-400">{t.test_date}</span>
                        {rejected && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                            rejected
                          </span>
                        )}
                        {!qc && !rejected && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                            clean
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {fmt(t.oil_rate_stbd)} stb/d oil, {fmt(t.water_rate_stbd)} stb/d water,
                        {' '}{fmt(t.gas_rate_mscfd)} Mscf/d gas
                        {Number.isFinite(t.duration_hours) ? `, ${t.duration_hours} h` : ''}
                        {Number.isFinite(t.thp_psia) ? `, THP ${fmt(t.thp_psia)} psia` : ''}
                        {Number.isFinite(t.choke_64ths) ? `, choke ${t.choke_64ths}/64` : ''}
                      </div>
                      {qc && (
                        <ul className="mt-1 space-y-0.5">
                          {qc.issues.map((issue, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                              <span>
                                <span className="font-semibold">{TEST_ISSUES[issue.code]?.label || issue.code}:</span>{' '}
                                {issue.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {canEditField && (
                      <div className="flex items-center gap-1 shrink-0">
                        {rejected ? (
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-400"
                            onClick={() => setTestValid(t.id, true)}
                          >
                            <CheckCircle2 size={14} className="mr-1" /> Accept
                          </Button>
                        ) : (
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs text-amber-400"
                            onClick={() => setTestValid(t.id, false)}
                          >
                            <XCircle size={14} className="mr-1" /> Reject
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-red-400"
                          title="Delete this test"
                          onClick={() => {
                            if (window.confirm('Delete this well test?')) removeTest(t.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[11px] text-slate-500">
          A rejected test carries no well in the allocation, and the next valid test before it takes
          over. If every test for a well is rejected, that well takes no allocation and the run says
          so rather than inventing a rate for it.
        </p>
      </CardContent>
    </Card>
  );
};

export default TestQcPanel;
