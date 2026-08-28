// What the allocation could not do, and why (Allocation tab). Nothing
// here is cosmetic: each line is a date where a well took no share, a
// volume had no carrier, or a factor left the warning band.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const SEVERITY_STYLE = {
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  info: 'border-slate-700/60 bg-slate-800/50 text-slate-300',
};

const CODE_LABEL = {
  no_test_in_force: 'No test in force',
  no_basis: 'Nothing to allocate to',
  factor_out_of_band: 'Factor out of band',
};

const LIMIT = 100;

const DiagnosticsPanel = () => {
  const { allocation, currentField } = useAllocation();
  const [showAll, setShowAll] = useState(false);

  // One line per (well, code) or (date, code) is noise on a long
  // period; group by code and name the wells and dates once.
  const grouped = useMemo(() => {
    const byCode = new Map();
    allocation.diagnostics.forEach((d) => {
      if (!byCode.has(d.code)) {
        byCode.set(d.code, { code: d.code, severity: d.severity, count: 0, wells: new Set(), samples: [] });
      }
      const g = byCode.get(d.code);
      g.count += 1;
      if (d.wellName) g.wells.add(d.wellName);
      if (g.samples.length < LIMIT) g.samples.push(d);
      if (d.severity === 'high') g.severity = 'high';
    });
    return [...byCode.values()];
  }, [allocation.diagnostics]);

  if (!currentField || !allocation.days.length) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> Allocation diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {grouped.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-3">
            <CheckCircle2 className="w-4 h-4" />
            Every metered date allocated cleanly, with every factor inside the warning band.
          </div>
        ) : grouped.map((g) => (
          <div key={g.code} className={`border rounded px-3 py-2 ${SEVERITY_STYLE[g.severity]}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-semibold text-sm">{CODE_LABEL[g.code] || g.code}</span>
              <span className="text-xs">{g.count.toLocaleString()} occurrence{g.count === 1 ? '' : 's'}</span>
            </div>
            {g.wells.size > 0 && (
              <p className="text-xs mt-0.5 opacity-90">
                Wells: {[...g.wells].sort().join(', ')}
              </p>
            )}
            <ul className="mt-1 space-y-0.5">
              {(showAll ? g.samples : g.samples.slice(0, 3)).map((d, i) => (
                <li key={i} className="text-xs opacity-80">{d.message}</li>
              ))}
            </ul>
            {g.samples.length > 3 && (
              <Button
                variant="ghost" size="sm" className="h-6 px-2 mt-1 text-xs"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show fewer' : `Show ${Math.min(g.samples.length, LIMIT) - 3} more`}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default DiagnosticsPanel;
