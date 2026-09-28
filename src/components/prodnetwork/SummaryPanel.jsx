// The right rail.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { Row, fmt } from './fields';

const SummaryPanel = () => {
  const { inputs, topology, wellProblems, result } = useProductionNetwork();
  const wells = inputs.nodes.filter((n) => n.kind === 'well').length;

  return (
    <Card>
      <CardContent className="py-3">
        <Row label="Wells" value={String(wells)} hint={`${inputs.branches.length} lines`} />
        <Row
          label="Topology"
          value={topology.ok ? 'Valid' : 'Not solvable'}
          accent={topology.ok ? 'text-pl-success-text' : 'text-pl-danger-text'}
        />
        <Row
          label="Well models"
          value={wellProblems.length ? `${wellProblems.length} incomplete` : 'Complete'}
          accent={wellProblems.length ? 'text-pl-warning-text' : 'text-pl-success-text'}
        />
        {result && (
          <>
            <Row
              label="Field rate"
              value={`${fmt(result.totals.qoStbd)} stb/d`}
            />
            <Row
              label="Lost to backpressure"
              value={`${fmt(result.totals.qoAloneStbd - result.totals.qoStbd)} stb/d`}
              accent="text-pl-warning-text"
              hint="What the wells cost each other"
            />
            <Row
              label="Bottleneck"
              value={result.diagnosis.bottleneck?.label || '--'}
              hint="Most pressure per pound of fluid moved"
            />
            <Row
              label="Newton iterations"
              value={String(result.solution.iterations)}
              hint={result.solution.converged ? 'Converged' : 'Did not converge'}
              accent={result.solution.converged ? 'text-pl-text' : 'text-pl-warning-text'}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SummaryPanel;
