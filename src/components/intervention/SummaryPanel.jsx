// The right rail: the verdict in the order a planner asks for it.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { Row, fmt } from './fields';

const SummaryPanel = () => {
  const { model, diagnosis, plan, history } = useIntervention();
  if (!model) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-4">
          <p className="text-sm text-slate-500">
            The well model is incomplete. Fill in the Well tab.
          </p>
        </CardContent>
      </Card>
    );
  }
  const sized = plan?.sized;
  const blocked = (plan?.screening || []).filter((r) => r.blocked).length;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="py-3">
        <Row
          label="History"
          value={history.length ? `${history.length} days` : 'None linked'}
          accent={history.length ? 'text-slate-100' : 'text-amber-400'}
        />
        <Row
          label="Mechanism"
          value={diagnosis?.mechanism?.label || '--'}
          accent={diagnosis?.mechanism?.id === 'channelling' ? 'text-amber-400'
            : diagnosis?.mechanism?.id === 'coning' ? 'text-rose-400' : 'text-slate-100'}
          hint={diagnosis?.confidence ? `${diagnosis.confidence} confidence` : undefined}
        />
        <Row
          label="Treatable by a squeeze"
          value={diagnosis?.mechanism ? (diagnosis.mechanism.treatable ? 'Yes' : 'No') : '--'}
          accent={diagnosis?.mechanism?.treatable ? 'text-emerald-400' : 'text-slate-400'}
        />
        {plan && (
          <>
            <Row
              label="Ruled out"
              value={String(blocked)}
              hint="By the diagnosis, not by a score"
              accent={blocked ? 'text-rose-400' : 'text-slate-100'}
            />
            <Row
              label="Uplift"
              value={sized?.ok ? `${fmt(sized.upliftStbd)} stb/d` : '--'}
              accent="text-emerald-400"
            />
            <Row
              label="NPV"
              value={plan.economics?.ok
                ? `$${fmt(plan.economics.economics.metrics.npv, 2)} MM`
                : '--'}
              accent={plan.economics?.ok && plan.economics.economics.metrics.npv > 0
                ? 'text-emerald-400' : 'text-slate-400'}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SummaryPanel;
