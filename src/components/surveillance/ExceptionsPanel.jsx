// Exception surveillance list — the by-exception workflow an operator
// actually runs each morning. Rules, windows and severities come from
// utils/production/surveillance.detectExceptions; nothing is computed
// here. Clicking a row hands the well to the Trends tab.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EXCEPTION_TYPES } from '@/utils/production/surveillance';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const SEVERITY_STYLE = {
  high: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  medium: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  info: 'border-pl-border bg-pl-sunken text-pl-text',
};

const ExceptionsPanel = ({ onOpenWell }) => {
  const { surveillance, currentField, ledgerRows } = useSurveillance();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const typesPresent = useMemo(
    () => [...new Set(surveillance.exceptions.map((e) => e.type))],
    [surveillance.exceptions],
  );

  const shown = surveillance.exceptions.filter(
    (e) => (severityFilter === 'all' || e.severity === severityFilter)
      && (typeFilter === 'all' || e.type === typeFilter),
  );

  if (!currentField) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-pl-muted text-sm">
          Select a field in the left rail to see which wells breach your thresholds.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-pl-muted" /> Exceptions
          {surveillance.asOf && (
            <span className="text-xs font-normal text-pl-muted">as of {surveillance.asOf}</span>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Filter size={12} className="text-pl-muted" />
          {['all', 'high', 'medium', 'info'].map((s) => (
            <Button
              key={s} size="sm" variant={severityFilter === s ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-xs capitalize"
              onClick={() => setSeverityFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {typesPresent.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm" variant={typeFilter === 'all' ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-xs" onClick={() => setTypeFilter('all')}
            >
              All types
            </Button>
            {typesPresent.map((t) => (
              <Button
                key={t} size="sm" variant={typeFilter === t ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-xs" onClick={() => setTypeFilter(t)}
                title={EXCEPTION_TYPES[t]?.description}
              >
                {EXCEPTION_TYPES[t]?.label || t}
              </Button>
            ))}
          </div>
        )}

        {ledgerRows.length === 0 ? (
          <p className="text-sm text-pl-muted">
            Import a production ledger on the Data tab to start surveilling this field.
          </p>
        ) : shown.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-pl-success-text bg-pl-success-bg border border-pl-success/40 rounded px-3 py-3">
            <CheckCircle2 className="w-4 h-4" />
            {surveillance.exceptions.length === 0
              ? 'No wells breach the current thresholds. Tune them in the left rail.'
              : 'No exceptions match this filter.'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {shown.map((e, i) => (
              <button
                key={`${e.wellId}-${e.type}-${i}`}
                type="button"
                onClick={() => onOpenWell?.(e.wellId)}
                className={`w-full text-left border rounded px-3 py-2 flex items-start gap-3 hover:brightness-110 transition ${SEVERITY_STYLE[e.severity]}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-pl-text">{e.wellName}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-pl-sunken">
                      {EXCEPTION_TYPES[e.type]?.label || e.type}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 opacity-90">{e.message}</p>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {surveillance.exceptions.length > 0 && (
          <p className="text-[11px] text-pl-muted pt-1">
            Windows anchor on the field's latest ledger date, and widen automatically on monthly
            data so a single month is never compared against a single day.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ExceptionsPanel;
