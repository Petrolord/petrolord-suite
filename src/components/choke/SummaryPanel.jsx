// Analysis summary (right rail).
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useChoke } from '@/contexts/ChokePerformanceContext';
import { fmt, Row } from './fields';

const SummaryPanel = () => {
  const { analysis, result, envelope } = useChoke();

  if (!analysis.ok || !result) {
    return (
      <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-3 space-y-2">
        <p className="text-xs font-semibold text-pl-warning-text flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Analysis cannot run
        </p>
        <ul className="text-[11px] text-pl-warning-text space-y-1 list-disc pl-4">
          {analysis.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const isGas = result.phase === 'gas';
  const rateUnit = isGas ? 'Mscf/d' : 'stb/d';
  return (
    <div className="space-y-2">
      <Row label="Bean" value={`${result.s64}/64`} hint={`${result.beanIn.toFixed(3)} in`} />
      <Row
        label={isGas ? 'Rate' : 'Oil rate'}
        value={`${fmt(result.solved.q)} ${rateUnit}`}
        hint={!isGas && Number.isFinite(result.solved.qLiquid) ? `${fmt(result.solved.qLiquid)} bbl/d liquid` : undefined}
      />
      <Row
        label="Wellhead pressure"
        value={`${fmt(result.solved.pwh)} psia`}
        hint={`${fmt(result.pDownstream)} psia downstream`}
      />
      <Row
        label="Flow"
        value={result.solved.critical ? (isGas ? 'Sonic' : 'Critical') : (isGas ? 'Subsonic' : 'Subcritical')}
        hint={result.solved.critical ? 'the bean is setting the rate' : 'the line pressure is setting the rate'}
      />
      {result.erosion?.ok && (
        <Row
          label="Flowline velocity"
          value={`${fmt(result.erosion.velocityFtS, 1)} ft/s`}
          hint={`limit ${fmt(result.erosion.erosionalFtS, 1)} ft/s at C = ${result.cFactor}`}
        />
      )}
      {result.hydrate?.ok && (
        <Row
          label="Downstream of the bean"
          value={`${fmt(result.solved.tDownstreamF)} F`}
          hint={`screening hydrate point ${fmt(result.hydrate.formationF)} F`}
        />
      )}
      {envelope?.limit && (
        <Row
          label="Critical up to"
          value={`${envelope.limit.lastCriticalS64}/64`}
          hint="past there the bean stops controlling"
        />
      )}

      <div className="pt-2">
        {result.warnings.length === 0 ? (
          <p className="text-[11px] text-pl-success-text flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> The bean is in control and the line is inside its limits.
          </p>
        ) : (
          <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2">
            <p className="text-[11px] font-semibold text-pl-warning-text">
              {result.warnings.length} thing{result.warnings.length === 1 ? '' : 's'} to look at
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPanel;
