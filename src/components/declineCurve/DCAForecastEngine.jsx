import React from 'react';
import { useDeclineCurve, DEFAULT_MC_SEED, DEFAULT_ECON_LIMIT_UNCERTAINTY } from '@/contexts/DeclineCurveContext';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, TrendingUp, Dices, RefreshCw } from 'lucide-react';
import DcaNumberField from '@/components/declineCurve/DcaNumberField';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { DCA_DAYS_PER_YEAR } from '@/utils/declineCurve/dcaUnits';

const DCAForecastEngine = () => {
  const { 
    selectedStream, 
    streamState, 
    updateForecastConfig, 
    runForecast, 
    isForecasting,
    status,
  } = useDeclineCurve();

  const u = useDcaUnits();
  const config = streamState[selectedStream].forecastConfig;
  const rateUnit = u.rateLabel(selectedStream);
  const toView = (v) => u.rateTo(selectedStream, v);
  const toEngine = (v) => u.rateFrom(selectedStream, v);
  const hasFit = !!streamState[selectedStream].fitResults;
  // DCA-U1-003: a forecast is run on a fit that still describes the data
  const fitStale = hasFit && status?.fit === 'stale';
  const hasConfidenceIntervals = streamState[selectedStream].fitResults?.confidenceIntervals?.hasIntervals;
  // Projects saved before these settings existed carry neither, so fall back.
  const seedValue = Number.isFinite(config.mcSeed) ? config.mcSeed : DEFAULT_MC_SEED;
  const econUncertaintyPct = Math.round(100 * (Number.isFinite(config.economicLimitUncertainty)
    ? config.economicLimitUncertainty
    : DEFAULT_ECON_LIMIT_UNCERTAINTY));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-pl-text">Forecast Settings</h3>
        {!hasFit && <span className="text-[10px] text-pl-warning-text">Fit Model First</span>}
        {fitStale && <span className="text-[10px] text-pl-warning-text">Fit again first</span>}
      </div>

      <div className="space-y-4">
        
        {/* Probabilistic Mode Toggle */}
        <div className="space-y-3 p-3 bg-pl-sunken rounded-lg border border-pl-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dices size={16} className="text-pl-muted" aria-hidden="true" />
              <Label className="text-sm font-medium text-pl-text">Probabilistic Mode</Label>
            </div>
            <Switch 
              checked={config.probabilisticMode || false}
              onCheckedChange={(checked) => updateForecastConfig('probabilisticMode', checked)}
              disabled={!hasConfidenceIntervals}
              aria-label="Probabilistic mode"
            />
          </div>
          <div className="text-xs text-pl-muted">
            {config.probabilisticMode ? (
              "Monte Carlo simulation will generate P10/P50/P90 forecasts"
            ) : (
              "Standard deterministic forecast"
            )}
            {!hasConfidenceIntervals && hasFit && (
              <div className="text-pl-warning-text mt-1">
                Probabilistic mode needs reliable parameter confidence intervals, which this fit could not produce. Refit with more data points or a cleaner decline period to enable it.
              </div>
            )}
          </div>

          {/* Random seed. The sampler draws every parameter and the economic
              limit through this seed, so the same fit plus the same seed
              reproduce the same P10/P50/P90 and a reported EUR can be checked
              by anyone holding the inputs. */}
          {config.probabilisticMode && (
            <div className="space-y-1 pt-1 border-t border-pl-border">
              <Label className="text-xs">Random Seed</Label>
              <div className="flex items-center gap-2">
                <DcaNumberField
                  id="dca-mc-seed"
                  label="Seed"
                  labelClassName="sr-only"
                  value={seedValue}
                  integer
                  emptyValue={DEFAULT_MC_SEED}
                  onCommit={(v) => updateForecastConfig('mcSeed', Number.isFinite(v) ? v : DEFAULT_MC_SEED)}
                  className="flex-1"
                  testId="dca-mc-seed"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 shrink-0"
                  onClick={() => updateForecastConfig('mcSeed', Math.floor(Math.random() * 1000000))}
                  title="Draw a different realization"
                >
                  <RefreshCw size={12} /> New seed
                </Button>
              </div>
              <div className="text-[10px] text-pl-muted">
                The same seed reproduces the same P10/P50/P90. Change it to see a different realization.
              </div>
            </div>
          )}
        </div>

        {/* Economic Limit */}
        <div className="space-y-2">
          <DcaNumberField
            id="dca-econ-limit"
            label="Economic limit rate"
            unit={rateUnit}
            value={config.economicLimit}
            toView={toView}
            toEngine={toEngine}
            emptyValue={0}
            onCommit={(v) => updateForecastConfig('economicLimit', Number.isFinite(v) && v > 0 ? v : 0)}
            testId="dca-econ-limit"
            hint="The rate below which the well no longer pays. Remaining reserves and EUR stop there."
          />
          <div className="flex items-center gap-2 text-xs text-pl-muted whitespace-nowrap">
            <Switch 
              checked={config.stopAtLimit} 
              onCheckedChange={(c) => updateForecastConfig('stopAtLimit', c)} 
              className="scale-75"
              aria-label="Stop at limit"
            />
            <span>Stop at limit</span>
          </div>
          {/* The Monte Carlo has always varied the economic limit, but on a
              hardcoded ±20% that nothing displayed and no one chose. It is a
              setting now, and 0 switches the draw off. */}
          {config.probabilisticMode && (
            <div className="space-y-1 pt-1">
              <DcaNumberField
                id="dca-econ-uncertainty"
                label="Economic limit uncertainty (±%)"
                unit="%"
                value={econUncertaintyPct}
                emptyValue={0}
                onCommit={(pct) => {
                  const fraction = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) / 100 : 0;
                  updateForecastConfig('economicLimitUncertainty', fraction);
                }}
                testId="dca-econ-uncertainty"
              />
              <div className="text-[10px] text-pl-muted">
                {econUncertaintyPct > 0
                  ? `Each realization draws the limit uniformly within ±${econUncertaintyPct}% of the value above.`
                  : 'The limit is held fixed, so only the fitted parameters carry uncertainty.'}
              </div>
            </div>
          )}
        </div>

        {/* Horizon, typed in years and held in days */}
        <DcaNumberField
          id="dca-horizon"
          digits={4}
          label="Forecast horizon after the last data"
          unit="years"
          value={config.durationDays}
          toView={(d) => d / DCA_DAYS_PER_YEAR}
          toEngine={(y) => Math.round(y * DCA_DAYS_PER_YEAR)}
          emptyValue={3653}
          onCommit={(v) => updateForecastConfig('durationDays', Number.isFinite(v) && v > 0 ? v : 3653)}
          testId="dca-horizon"
          hint={`${Math.round(config.durationDays || 0).toLocaleString()} days; a year is 365.25 days.`}
        />

        {/* Facility Limit */}
        <DcaNumberField
          id="dca-facility-limit"
          label="Facility limit (maximum rate)"
          unit={rateUnit}
          value={config.facilityLimit > 0 ? config.facilityLimit : null}
          toView={toView}
          toEngine={toEngine}
          emptyValue={0}
          placeholder="No limit"
          onCommit={(v) => updateForecastConfig('facilityLimit', Number.isFinite(v) && v > 0 ? v : 0)}
          testId="dca-facility-limit"
          hint="Caps the forecast rate in both the deterministic and the Monte Carlo forecast. Blank is no cap."
        />

      </div>

      <Button 
        onClick={runForecast} 
        disabled={isForecasting || !hasFit || fitStale}
        title={fitStale ? 'The fit is out of date: fit again before forecasting' : undefined}
        className="w-full"
        size="sm"
      >
        {isForecasting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
        {config.probabilisticMode ? 'Run Monte Carlo' : 'Generate Forecast'}
      </Button>
      
      {config.probabilisticMode && isForecasting && (
        <div className="text-xs text-center text-pl-info-text">
          Running 1000 simulations...
        </div>
      )}
    </div>
  );
};

export default DCAForecastEngine;