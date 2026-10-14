// Main area for the Specialized tab: the classic straight-line plots with
// their fitted lines and answers (Horner or MDH semilog, sqrt-t, Cartesian
// PSS for drawdowns).
import React, { useMemo, useState } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, PINNED_TOOLTIP_PROPS, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { buildSemilogData, buildSqrtData } from '@/utils/welltest/plotData';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { deliverabilityUnits, rateSkinRows, RATE_SKIN_METHOD_TEXT } from '@/utils/welltest/reportModel';
import { ChartCard, Kpi, LINE, WarningBanner, fmt, fmtU, logTicks, logTickFormatter } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
// Pinned to the top-right corner of the plot (owner directive 2026-09-08).
const tooltipProps = PINNED_TOOLTIP_PROPS;
const legendProps = LEGEND_PROPS;

const SpecializedResults = () => {
  const {
    prepared, configSpec, reservoirSpec, semilogResult, sqrtResult, pssResult,
    multiRateResult, deliverabilityResult, deliverabilityInputs, semilogWindowSource, rateSkin,
    history, mdhBuildupResult, faultResult, sqrtMeaningful, model, matchParams,
  } = useWellTestStudio();
  // 2026-10-14: a buildup can be read on Horner (or superposition) or MDH
  const [plotKind, setPlotKind] = useState('horner');
  const { unitSystem } = useWellTestStudio();
  const isBuildup = configSpec.config?.family === 'buildup';
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';
  const dpKind = isGas ? 'pseudoPressure' : 'pressure';
  const slopeKind = isGas ? 'pseudoSlope' : 'semilogSlope';
  const dpUnit = unitLabel(dpKind, unitSystem);
  const dU = deliverabilityUnits(deliverabilityResult?.method, deliverabilityResult?.backPressure?.n);

  // Both straight-line plots come from the shared builders; the PDF report
  // draws the same arrays.
  const showMdh = isBuildup && plotKind === 'mdh';
  const semilogData = useMemo(
    () => buildSemilogData({
      prepared, config: configSpec.config, semilogResult, unitSystem, history, faultResult,
      kind: showMdh ? 'mdh' : 'auto', mdhResult: mdhBuildupResult,
    }).points.map((p) => ({
      ...p,
      // fitted points in colour, the rest grey (2026-10-14)
      pIn: p.inWindow ? p.pressure : null,
      pOut: !p.inWindow && p.pressure != null ? p.pressure : null,
    })),
    [prepared, configSpec, semilogResult, unitSystem, history, faultResult, showMdh, mdhBuildupResult],
  );
  const lineName = isBuildup ? (history ? 'Superposition' : 'Horner') : 'MDH';
  const fault = faultResult;
  // the model's own fault distance, when the working match carries one
  const modelL = model?.parameters?.some((p) => p.key === 'L') && Number.isFinite(matchParams?.L) ? matchParams.L : null;

  const sqrtData = useMemo(
    () => buildSqrtData({ prepared, sqrtResult, dpKind, unitSystem }),
    [prepared, sqrtResult, dpKind, unitSystem],
  );

  if (!prepared.points.length) {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface px-6 py-10 text-center">
        <p className="text-pl-text font-medium">No analysis data yet.</p>
        <p className="text-sm text-pl-muted mt-1">Load gauge data on the Data tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto">
      {!semilogResult && <WarningBanner warnings={['The semilog line needs valid reservoir inputs and at least 4 points in the window.']} />}
      {semilogResult && semilogWindowSource === 'full' && (
        <WarningBanner warnings={['No radial flow was detected, so the semilog line runs through every point, storage included. Treat k and skin as unreliable until a window is set on the flat derivative.']} />
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Slope m" value={isGas ? fmt.sci(fromOilfield(slopeKind, semilogResult?.m, unitSystem)) : fmtU(slopeKind, semilogResult?.m, unitSystem, fmt.f1)} unit={unitLabel(slopeKind, unitSystem)} />
        <Kpi title="Permeability k" value={fmt.sig3(semilogResult?.k)} unit="md" accent />
        <Kpi title={isGas ? 'Apparent skin s\'' : 'Skin'} value={fmt.f2(semilogResult?.skin)} />
        <Kpi title={isBuildup ? 'p*' : 'p at 1 hr'} value={fmtU('pressure', isBuildup ? semilogResult?.pStar : semilogResult?.p1hr, unitSystem, fmt.f1)} unit={unitLabel('pressure', unitSystem)} />
        <Kpi title="Fit r²" value={fmt.f3(semilogResult?.r2)} />
      </div>

      {isBuildup && (
        <div className="flex items-center gap-2 text-xs" data-testid="wts-semilog-kind">
          <span className="text-pl-muted">Plot</span>
          {[['horner', `${lineName} (p*)`], ['mdh', 'MDH (log dt)']].map(([k, label]) => (
            <button
              key={k} type="button"
              data-testid={`wts-semilog-kind-${k}`}
              onClick={() => setPlotKind(k)}
              className={`rounded-md border px-2 py-1 ${plotKind === k ? 'border-pl-primary text-pl-text bg-pl-sunken' : 'border-pl-border text-pl-muted'}`}
            >
              {label}
            </button>
          ))}
          {history && <span className="text-pl-muted" data-testid="wts-semilog-history-note">On the superposition time of the rate history ({history.steps.length} rate steps before the shut-in).</span>}
        </div>
      )}

      <ChartCard title={showMdh ? 'MDH plot (buildup)' : (isBuildup ? `${lineName} plot` : 'MDH semilog plot')} height={320}>
        <ComposedChart data={semilogData} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT}
            dataKey="x" type="number" scale="log" domain={['auto', 'auto']} reversed={isBuildup && !showMdh}
            ticks={logTicks(semilogData.map((d) => d.x))} tickFormatter={logTickFormatter} {...axisProps}
            label={{ value: showMdh ? 'Shut-in time Δt (hr)' : (isBuildup ? (history ? 'Superposition time as a ratio, 10^X (Horner ratio for one rate)' : 'Horner time ratio (tp + Δt)/Δt') : 'Elapsed time (hr)'), position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Scatter dataKey="pIn" name={`${isBuildup ? 'pws' : 'pwf'} in the window`} fill={LINE.dp} isAnimationActive={false} />
          <Scatter dataKey="pOut" name="outside the window" fill="#94a3b8" isAnimationActive={false} />
          {(showMdh ? mdhBuildupResult : semilogResult) && <Line type="monotone" dataKey="fitted" name="Straight line" stroke={LINE.fit} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />}
          {!showMdh && fault?.ok && <Line type="monotone" dataKey="late" name="Second line" stroke={LINE.derivative} strokeDasharray="6 3" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />}
          {isBuildup && !showMdh && semilogResult && <Scatter dataKey="pStar" name="p*" fill={LINE.fit} shape="diamond" isAnimationActive={false} />}
        </ComposedChart>
      </ChartCard>

      {isBuildup && mdhBuildupResult && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid="wts-mdh-buildup">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">MDH line on the same window (cross-check)</p>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi title="Permeability k" value={fmt.sig3(mdhBuildupResult.k)} unit="md" />
            <Kpi title={isGas ? 'Apparent skin s\'' : 'Skin'} value={fmt.f2(mdhBuildupResult.skin)} />
            <Kpi title="Last Δt in the window / tp" value={fmt.sig3(mdhBuildupResult.dtOverTp)} />
            <Kpi title="Fit r²" value={fmt.f3(mdhBuildupResult.r2)} />
          </div>
          <p className="text-[11px] text-pl-muted mt-2">
            MDH plots pws against log Δt and gives no p*. It holds while Δt is small beside the producing time; {Number.isFinite(mdhBuildupResult.dtOverTp) && mdhBuildupResult.dtOverTp > 0.1
              ? `here the window reaches ${fmt.sig3(mdhBuildupResult.dtOverTp)} of tp, so the MDH line bends and its k reads high: use the ${lineName} line.`
              : `here the window stays under a tenth of tp, so MDH and ${lineName} should agree.`}
          </p>
        </div>
      )}

      {fault && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid="wts-fault-result">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Second straight line: distance to a sealing fault</p>
          {fault.ok ? (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <Kpi title="First slope m1" value={fmtU(slopeKind, fault.m1, unitSystem, isGas ? fmt.sci : fmt.f2)} unit={unitLabel(slopeKind, unitSystem)} />
                <Kpi title="Second slope m2" value={fmtU(slopeKind, fault.m2, unitSystem, isGas ? fmt.sci : fmt.f2)} unit={unitLabel(slopeKind, unitSystem)} />
                <Kpi title="m2 / m1" value={fmt.f2(fault.ratio)} />
                <Kpi title={isBuildup ? 'Lines meet at Δt' : 'Lines meet at t'} value={fmt.sig3(fault.dtx)} unit="hr" />
                <Kpi title="Distance to the fault L" value={fmtU('length', fault.L, unitSystem, fmt.int)} unit={unitLabel('length', unitSystem)} accent />
              </div>
              <p className="text-[11px] text-pl-muted mt-2" data-testid="wts-fault-method">
                L = sqrt(0.0001481 k Δt_x / (φ μ ct)) with k {fmt.sig3(fault.k)} md from the first line, where the two lines meet ({fault.reference}). One sealing fault doubles the slope.
                {modelL != null ? ` The working match places the fault at ${fmtU('length', modelL, unitSystem, fmt.int)} ${unitLabel('length', unitSystem)}.` : ' Match the sealing-fault model on the Match tab to check the distance against the whole curve.'}
              </p>
              {fault.warnings?.length > 0 && <div className="mt-2"><WarningBanner warnings={fault.warnings} /></div>}
            </>
          ) : (
            <p className="text-xs text-pl-muted">{fault.reason}</p>
          )}
        </div>
      )}

      <ChartCard title={`Linear flow: ${isGas ? 'Δm(p)' : 'Δp'} vs sqrt(t)`} height={260}>
        <ComposedChart data={sqrtData} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="x" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'sqrt(t) (hr^0.5)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: `${isGas ? 'Δm(p)' : 'Δp'} (${dpUnit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Scatter dataKey="dp" name={isGas ? 'Δm(p)' : 'Δp'} fill={LINE.dp} isAnimationActive={false} />
          {sqrtResult && sqrtMeaningful && <Line type="monotone" dataKey="fitted" name={`Fit (slope ${fmt.f2(fromOilfield(dpKind, sqrtResult.slope, unitSystem))} ${dpUnit}/hr^0.5)`} stroke={LINE.fit} dot={false} strokeWidth={2} isAnimationActive={false} />}
        </ComposedChart>
      </ChartCard>
      {!sqrtMeaningful && (
        <p className="text-[11px] text-pl-muted -mt-2" data-testid="wts-sqrt-no-line">
          No linear flow was found on the derivative, so no line is drawn here. Set a sqrt(t) window in the left rail to fit one.
        </p>
      )}

      {multiRateResult && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Multi-rate superposition (Odeh-Jones)</p>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi title="Permeability k" value={fmt.sig3(multiRateResult.k)} unit="md" accent />
            <Kpi title="Skin" value={fmt.f2(multiRateResult.skin)} />
            <Kpi title="Slope m'" value={fmt.sig3(fromOilfield(slopeKind, multiRateResult.mPrime, unitSystem))} unit={`${unitLabel(slopeKind, unitSystem)} per rate`} />
            <Kpi title="Fit r²" value={fmt.f3(multiRateResult.r2)} />
          </div>
          <p className="text-[11px] text-pl-muted mt-2">
            Rate-normalized drawdown against the superposition time function of the entered rate history ({multiRateResult.n} points).
          </p>
        </div>
      )}

      {isGas && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">
            Gas deliverability ({deliverabilityInputs.method === 'pseudo-pressure' ? 'pseudo-pressure' : 'pressure-squared'})
          </p>
          {deliverabilityResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Kpi title="AOF (back-pressure)" value={fmtU('gasRate', deliverabilityResult.backPressure?.aof, unitSystem, fmt.sig3)} unit={unitLabel('gasRate', unitSystem)} accent />
                <Kpi title="Exponent n" value={fmt.f2(deliverabilityResult.backPressure?.n)} />
                <Kpi title="Coefficient C" value={fmt.sci(deliverabilityResult.backPressure?.C)} unit={dU.C} />
                <Kpi title="Fit r²" value={fmt.f3(deliverabilityResult.backPressure?.r2)} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Kpi title="AOF (LIT)" value={fmtU('gasRate', deliverabilityResult.lit?.aof, unitSystem, fmt.sig3)} unit={unitLabel('gasRate', unitSystem)} accent />
                <Kpi title="Laminar a" value={fmt.sci(deliverabilityResult.lit?.a)} unit={dU.a} />
                <Kpi title="Turbulent b" value={fmt.sci(deliverabilityResult.lit?.b)} unit={dU.b} />
                <Kpi title="Fit r²" value={fmt.f3(deliverabilityResult.lit?.r2)} />
              </div>
              <p className="text-[11px] text-pl-muted" data-testid="wts-deliverability-basis">{dU.basis}</p>
              {deliverabilityResult.backPressure?.nOutOfRange && (
                <WarningBanner warnings={['Deliverability exponent n is outside the physical 0.5 to 1 band; review the test points.']} />
              )}
            </div>
          ) : (
            <p className="text-xs text-pl-muted">
              Enter at least two flow-after-flow points (rate and stabilized pwf) in the left rail to compute the Rawlins-Schellhardt and LIT deliverability and the AOF.
            </p>
          )}
        </div>
      )}

      {isGas && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid="wts-rate-skin-result">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Rate-dependent skin</p>
          <table className="w-full text-xs">
            <tbody>
              {rateSkinRows(rateSkin, unitSystem).map(([q, v, b]) => (
                <tr key={q} className="border-t border-pl-border"><td className="py-1 text-pl-muted">{q}</td><td className="py-1 text-pl-text font-medium text-right whitespace-nowrap px-2">{v}</td><td className="py-1 text-pl-muted">{b}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-pl-muted mt-2">{RATE_SKIN_METHOD_TEXT}</p>
        </div>
      )}

      {!isBuildup && !isGas && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Pseudo-steady state (Cartesian)</p>
          {pssResult ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              <Kpi title="Slope m*" value={fmtU('pssSlope', pssResult.mStar, unitSystem, fmt.f3)} unit={unitLabel('pssSlope', unitSystem)} />
              <Kpi title="Connected pore volume" value={unitSystem === 'si' ? fmt.f3(fromOilfield('poreVolume', pssResult.poreVolumeMMbbl, unitSystem)) : fmt.f2(pssResult.poreVolumeMMbbl)} unit={unitSystem === 'si' ? 'MM m³' : 'MMbbl'} accent />
              <Kpi title="Fit r²" value={fmt.f3(pssResult.r2)} />
            </div>
          ) : (
            <p className="text-xs text-pl-muted">
              Set a PSS window over the late-time linear decline (only meaningful once the closed system is felt).
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SpecializedResults;
