import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { formatEffectiveFirstYear, formatDecline, declineBasisLabel } from '@/utils/declineCurve/declineDisplay';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { DCA_DAYS_PER_YEAR } from '@/utils/declineCurve/dcaUnits';
import { staleText } from '@/utils/declineCurve/dcaModel';

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
  const { selectedStream, streamState, status } = useDeclineCurve();
  const u = useDcaUnits();
  const fitResults = streamState[selectedStream].fitResults;
  const forecastResults = streamState[selectedStream].forecastResults;

  if (!fitResults) return <div className="h-20 flex items-center justify-center bg-pl-surface border border-dashed border-pl-border-strong rounded-lg text-pl-muted text-xs">No Model Fitted</div>;

  const { qi, Di, b, modelType, R2, RMSE } = fitResults;
  
  // Use forecast results if available, otherwise N/A
  // remaining = after the last history date (T1: the whole curve from first
  // production was shown as remaining); '-' until a forecast is run
  const eur = forecastResults ? forecastResults.eur : null;
  const timeLeft = forecastResults ? (forecastResults.timeToLimit / DCA_DAYS_PER_YEAR).toFixed(1) : 'n/a';
  const lifeNote = !forecastResults ? 'Run a forecast'
    : forecastResults.limitBeforeToday ? 'Already below the economic limit'
      : forecastResults.limitReached ? 'After the last data, to the economic limit'
        : 'Forecast horizon; limit not reached';
  const probabilistic = forecastResults?.probabilistic;
  const isProbabilistic = !!probabilistic && probabilistic.iterations > 0;

  const formatNum = (n) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString(undefined, {maximumFractionDigits: 2}) : 'n/a';
  const vol = (v) => u.volumeTo(selectedStream, v);
  const whole = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : 'n/a');

  const rateUnit = u.rateLabel(selectedStream);
  const volumeUnit = u.volumeLabel(selectedStream);

  // DCA-U1-003: a result that no longer describes the inputs says so first
  const fitStale = status && status.fit !== 'current' ? staleText(status, 'fit') : null;
  const forecastStale = status && forecastResults && status.forecast !== 'current' ? staleText(status, 'forecast') : null;

  return (
    <>
    {(fitStale || forecastStale) && (
      <div className="mb-3 rounded-md border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text text-xs px-3 py-2 space-y-1" data-testid="dca-stale">
        {fitStale && <p>{fitStale}</p>}
        {!fitStale && forecastStale && <p>{forecastStale}</p>}
      </div>
    )}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <MetricCard 
        label="Model"
        value={modelType}
        subtext="Active Selection"
      />
      <MetricCard
        label={`Initial Rate (qi)`}
        value={formatNum(u.rateTo(selectedStream, qi))}
        unit={rateUnit}
        subtext={fitResults.t0 ? `at ${String(fitResults.t0).slice(0, 10)}, the fit start` : undefined}
      />
      <MetricCard 
        label="Decline (Di)" 
        value={formatDecline(Di, u)}
        unit={declineBasisLabel(u)}
        subtext={`${formatEffectiveFirstYear(Di, b)} % effective, first year`}
        testId="dca-di-kpi"
      />
      <MetricCard 
        label="b-Factor" 
        value={formatNum(b)} 
      />
      <MetricCard 
        label="Fit Quality (R²)" 
        value={typeof R2 === 'number' ? R2.toFixed(4) : 'n/a'} 
      />
      {isProbabilistic ? (
        <>
          <MetricCard
            label="P10 EUR"
            value={whole(vol(probabilistic.p10))}
            unit={volumeUnit}
            subtext="High case: 10% chance of at least this"
          />
          <MetricCard
            label="P50 EUR"
            value={whole(vol(probabilistic.p50))}
            unit={volumeUnit}
            subtext={`Median of ${probabilistic.iterations} runs`}
          />
          <MetricCard
            label="P90 EUR"
            value={whole(vol(probabilistic.p90))}
            unit={volumeUnit}
            subtext="Low case: 90% chance of at least this"
          />
        </>
      ) : (
        <MetricCard
          testId="dca-kpi-remaining"
          label="Rem. Reserves"
          value={eur == null ? 'n/a' : whole(vol(eur))}
          unit={volumeUnit}
          subtext={forecastResults && Number.isFinite(forecastResults.eurTotal)
            ? `EUR ${whole(vol(forecastResults.eurTotal))} incl. ${whole(vol(forecastResults.produced))} produced`
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
        value={formatNum(u.rateTo(selectedStream, RMSE))}
        unit={rateUnit}
      />
    </div>
    </>
  );
};

export default DCAKPICardsEnhanced;