// The right rail: the verdict in the order a planner asks for it.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { Row, fmt } from './fields';

const SummaryPanel = () => {
  const { model, diagnosis, plan, history } = useIntervention();
  if (!model) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-pl-muted">
            The well model is incomplete. Fill in the Well tab.
          </p>
        </CardContent>
      </Card>
    );
  }
  const sized = plan?.sized;
  const blocked = (plan?.screening || []).filter((r) => r.blocked).length;

  return (
    <Card>
      <CardContent className="py-3">
        <Row
          label="History"
          value={history.length ? `${history.length} days` : 'None linked'}
          accent={history.length ? 'text-pl-text' : 'text-pl-warning-text'}
        />
        <Row
          label="Mechanism"
          value={diagnosis?.mechanism?.label || '--'}
          accent={diagnosis?.mechanism?.id === 'channelling' ? 'text-pl-warning-text'
            : diagnosis?.mechanism?.id === 'coning' ? 'text-pl-danger-text' : 'text-pl-text'}
          hint={diagnosis?.confidence ? `${diagnosis.confidence} confidence` : undefined}
        />
        <Row
          label="Treatable by a squeeze"
          value={diagnosis?.mechanism ? (diagnosis.mechanism.treatable ? 'Yes' : 'No') : '--'}
          accent={diagnosis?.mechanism?.treatable ? 'text-pl-success-text' : 'text-pl-muted'}
        />
        {plan && (
          <>
            <Row
              label="Ruled out"
              value={String(blocked)}
              hint="Ruled out by the diagnosis alone, with no score"
              accent={blocked ? 'text-pl-danger-text' : 'text-pl-text'}
            />
            <Row
              label="Uplift"
              value={sized?.ok ? `${fmt(sized.upliftStbd)} stb/d` : '--'}
              accent="text-pl-success-text"
            />
            <Row
              label="NPV"
              value={plan.economics?.ok
                ? `$${fmt(plan.economics.economics.metrics.npv, 2)} MM`
                : '--'}
              accent={plan.economics?.ok && plan.economics.economics.metrics.npv > 0
                ? 'text-pl-success-text' : 'text-pl-muted'}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SummaryPanel;
