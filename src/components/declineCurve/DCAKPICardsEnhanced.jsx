import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { formatNominalAnnual, formatEffectiveFirstYear, DI_BASIS_LABEL } from '@/utils/declineCurve/declineDisplay';

// Tiles follow the design-system StatTile look (surface, muted uppercase
// label, mono tabular value). Values are neutral: colour is kept for status.
const MetricCard = ({ label, value, unit, subtext, testId }) => (
  <div className="bg-pl-surface p-3 rounded-lg border border-pl-border shadow-pl-sm flex flex-col justify-between min-w-0">
    <div>
      <div className="text-[10px] text-pl-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span className="text-lg font-semibold text-pl-text font-pl-mono tabular-nums" data-testid={testId}>{value}</span>
        {unit && <span className="text-xs text-pl-muted" data-testid={testId ? `${testId}-basis` : undefined}>{unit}</span>}
      </div>
    </div>
    {subtext && <div className="text-[10px] text-pl-muted mt-1 truncate" data-testid={testId ? `${testId}-effective` : undefined}>{subtext}</div>}
  </div>
);

const DCAKPICardsEnhanced = () => {
  const { selectedStream, streamState } = useDeclineCurve();
  const fitResults = streamState[selectedStream].fitResults;
  const forecastResults = streamState[selectedStream].forecastResults;

  if (!fitResults) return <div className="h-20 flex items-center justify-center bg-pl-surface border border-dashed border-pl-border-strong rounded-lg text-pl-muted text-xs">No Model Fitted</div>;

  const { qi, Di, b, modelType, R2, RMSE } = fitResults;
  
  // Use forecast results if available, otherwise N/A
  // remaining = after the last history date (T1: the whole curve from first
  // production was shown as remaining); '-' until a forecast is run
  const eur = forecastResults ? forecastResults.eur : null;
  const timeLeft = forecastResults ? (forecastResults.timeToLimit / 365).toFixed(1) : '-';
  const lifeNote = !forecastResults ? 'Run a forecast'
    : forecastResults.limitBeforeToday ? 'Already below the economic limit'
      : forecastResults.limitReached ? 'After the last data, to the economic limit'
        : 'Forecast horizon; limit not reached';
  const probabilistic = forecastResults?.probabilistic;
  const isProbabilistic = !!probabilistic && probabilistic.iterations > 0;

  const formatNum = (n) => typeof n === 'number' ? n.toLocaleString(undefined, {maximumFractionDigits: 2}) : '-';

  const rateUnit = selectedStream === 'gas' ? 'Mscf/d' : 'bbl/d';
  const volumeUnit = selectedStream === 'gas' ? 'Mscf' : 'bbl';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <MetricCard 
        label="Model"
        value={modelType}
        subtext="Active Selection"
      />
      <MetricCard
        label={`Initial Rate (qi)`}
        value={formatNum(qi)}
        unit={rateUnit}
      />
      <MetricCard 
        label="Decline (Di)" 
        value={formatNominalAnnual(Di)}
        unit={DI_BASIS_LABEL}
        subtext={`${formatEffectiveFirstYear(Di, b)} % effective, first year`}
        testId="dca-di-kpi"
      />
      <MetricCard 
        label="b-Factor" 
        value={formatNum(b)} 
      />
      <MetricCard 
        label="Fit Quality (R²)" 
        value={typeof R2 === 'number' ? R2.toFixed(4) : '-'} 
      />
      {isProbabilistic ? (
        <>
          <MetricCard
            label="P10 EUR"
            value={formatNum(probabilistic.p10)}
            unit={volumeUnit}
            subtext="Optimistic (10% chance ≥)"
          />
          <MetricCard
            label="P50 EUR"
            value={formatNum(probabilistic.p50)}
            unit={volumeUnit}
            subtext={`Median (${probabilistic.iterations} sims)`}
          />
          <MetricCard
            label="P90 EUR"
            value={formatNum(probabilistic.p90)}
            unit={volumeUnit}
            subtext="Conservative (90% chance ≥)"
          />
        </>
      ) : (
        <MetricCard
          label="Rem. Reserves"
          value={eur == null ? '-' : formatNum(Math.round(eur))}
          unit={volumeUnit}
          subtext={forecastResults && Number.isFinite(forecastResults.eurTotal)
            ? `EUR ${Math.round(forecastResults.eurTotal).toLocaleString()} incl. ${Math.round(forecastResults.produced).toLocaleString()} produced`
            : 'Run a forecast'}
        />
      )}
      <MetricCard 
        label="Life of Well" 
        value={timeLeft} 
        unit="years"
        subtext={lifeNote}
      />
      <MetricCard 
        label="Fit Error (RMSE)" 
        value={formatNum(RMSE)} 
      />
    </div>
  );
};

export default DCAKPICardsEnhanced;