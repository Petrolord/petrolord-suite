import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';

const MetricCard = ({ label, value, unit, color = "text-slate-100", subtext }) => (
  <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex flex-col justify-between">
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold ${color} font-mono`}>{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
    {subtext && <div className="text-[10px] text-slate-500 mt-1 truncate">{subtext}</div>}
  </div>
);

const DCAKPICardsEnhanced = () => {
  const { selectedStream, streamState } = useDeclineCurve();
  const fitResults = streamState[selectedStream].fitResults;
  const forecastResults = streamState[selectedStream].forecastResults;

  if (!fitResults) return <div className="h-20 flex items-center justify-center bg-slate-900/50 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">No Model Fitted</div>;

  const { qi, Di, b, modelType, R2, RMSE } = fitResults;
  
  // Use forecast results if available, otherwise N/A
  const eur = forecastResults ? forecastResults.eur : 0;
  const timeLeft = forecastResults ? (forecastResults.timeToLimit / 365).toFixed(1) : '-';
  const probabilistic = forecastResults?.probabilistic;
  const isProbabilistic = !!probabilistic && probabilistic.iterations > 0;

  const formatNum = (n) => typeof n === 'number' ? n.toLocaleString(undefined, {maximumFractionDigits: 2}) : '-';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <MetricCard 
        label="Model"
        value={modelType}
        color="text-white"
        subtext="Active Selection"
      />
      <MetricCard 
        label={`Initial Rate (qi)`} 
        value={formatNum(qi)} 
        unit="bbl/d" 
        color="text-emerald-400"
      />
      <MetricCard 
        label="Decline (Di)" 
        value={formatNum(Di * 365 * 100)} 
        unit="%/yr"
        color="text-orange-400"
        subtext="Nominal Annual"
      />
      <MetricCard 
        label="b-Factor" 
        value={formatNum(b)} 
        color="text-purple-400"
      />
      <MetricCard 
        label="Fit Quality (R²)" 
        value={formatNum(R2)} 
        color="text-blue-400"
      />
      {isProbabilistic ? (
        <>
          <MetricCard 
            label="P10 Reserves" 
            value={formatNum(probabilistic.p10)} 
            unit="bbl"
            color="text-emerald-300"
            subtext="Optimistic (10% chance ≥)"
          />
          <MetricCard 
            label="P50 Reserves" 
            value={formatNum(probabilistic.p50)} 
            unit="bbl"
            color="text-emerald-400"
            subtext={`Median (${probabilistic.iterations} sims)`}
          />
          <MetricCard 
            label="P90 Reserves" 
            value={formatNum(probabilistic.p90)} 
            unit="bbl"
            color="text-amber-400"
            subtext="Conservative (90% chance ≥)"
          />
        </>
      ) : (
        <MetricCard 
          label="Rem. Reserves" 
          value={formatNum(eur)} 
          unit="bbl"
          color="text-emerald-400"
          subtext="Forecasted Volume"
        />
      )}
      <MetricCard 
        label="Life of Well" 
        value={timeLeft} 
        unit="years"
        color="text-yellow-400"
        subtext="Until Econ Limit"
      />
      <MetricCard 
        label="Fit Error (RMSE)" 
        value={formatNum(RMSE)} 
        color="text-slate-400"
      />
    </div>
  );
};

export default DCAKPICardsEnhanced;