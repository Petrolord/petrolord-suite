// The inventory, its audit status, and the intensity (DS9).
import React from 'react';
import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell as BarCell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { cn } from '@/lib/utils';
import { NumericTable, NumTh, NumRow, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { useCarbonAbatement } from '@/contexts/CarbonAbatementContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

// KPI tile in theme roles; numbers in the mono face, words in the sans.
const Stat = ({ label, value, hint, mono = true }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold text-pl-text break-words ${mono ? 'font-pl-mono tabular-nums' : ''}`}>{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const InventoryResults = () => {
  const { inventory, intensity, combustion, flare } = useCarbonAbatement();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  const chartRows = inventory.lines
    .filter((l) => Number.isFinite(l.tCo2e) && l.tCo2e > 0)
    .map((l) => ({ label: l.label, tCo2e: l.tCo2e }))
    .sort((a, b) => b.tCo2e - a.tCo2e);

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        inventory.reportable
          ? 'border-pl-success/40 bg-pl-success-bg text-pl-success-text'
          : 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`}
      >
        {inventory.reportable
          ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          : <FileWarning className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />}
        <div>
          <p className="font-semibold">
            {inventory.reportable
              ? `Computed and reportable: ${fmt(inventory.totalTonnes, 0)} tCO2e`
              : `Computed but NOT reportable: ${fmt(inventory.totalTonnes, 0)} tCO2e`}
          </p>
          <p className="text-sm mt-1">
            {inventory.reportable
              ? `On ${inventory.gwpSetLabel}. Every factor carries a source and a version.`
              : `Because ${inventory.notReportableBecause.join('; ')}. The arithmetic is complete; it is not something to file.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Scope 1" value={`${fmt(inventory.scope1Tonnes, 0)} t`} hint="direct" />
        <Stat label="Scope 2" value={`${fmt(inventory.scope2Tonnes, 0)} t`} hint="purchased energy" />
        <Stat label="Total" value={`${fmt(inventory.totalTonnes, 0)} t`} />
        <Stat label="Potentials" value={inventory.gwpSetLabel || 'not declared'} mono={false} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Where the emissions are</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          {combustion.error ? '' : combustion.method}
          {' '}
          Factors are reserved for the things that really are empirical.
        </p>
        <ChartFrame height={280} exportFilename="emissions-by-source">
          {/* CARBON-T1-001: the rows carry tCo2e but the Bar read tCO2e, so the
              chart drew no bars and no value axis at all */}
          <BarChart data={chartRows} layout="vertical" margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="tCo2e" domain={[0, 'auto']} stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => fmt(v, 0)} height={XAXIS_LABEL_HEIGHT}
              label={{ value: 'tCO2e/yr', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis type="category" dataKey="label" stroke={CHART_COLORS.axisLine} tick={tick} width={150} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 0)} t`} />
            <Bar dataKey="tCo2e" name="tCO2e" isAnimationActive={false}>
              {chartRows.map((r) => (
                <BarCell key={r.label} fill={r.label.includes('CH4') ? '#dc2626' : '#0891b2'} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The inventory</h3>
        {/* A line that is blocked or missing provenance carries the warning
            fill and says why in its own Provenance cell. */}
        <NumericTable>
          <thead>
            <tr>
              <NumTh sticky>Source</NumTh>
              <NumTh numeric>Scope</NumTh>
              <NumTh>Gas</NumTh>
              <NumTh numeric>GWP</NumTh>
              <NumTh numeric>tCO2e</NumTh>
              <NumTh>Provenance</NumTh>
            </tr>
          </thead>
          <tbody>
            {inventory.lines.map((l) => {
              const flagged = Boolean(l.blockedBy || !l.provenanceComplete);
              return (
                <NumRow key={l.label} className={flagged ? 'bg-pl-warning-bg' : ''}>
                  <td className={cn(NUMERIC_TABLE.rowLabel, flagged && 'bg-pl-warning-bg')}>{l.label}</td>
                  <NumCell signed={false} tone="text-pl-muted">{l.scope}</NumCell>
                  <td className="border-b border-pl-border px-3 py-2 text-xs text-pl-muted">{l.gas}</td>
                  <NumCell signed={false} tone="text-pl-muted">{l.gwp === null ? '-' : l.gwp}</NumCell>
                  <NumCell signed={false} className={l.blockedBy ? 'font-pl-sans whitespace-normal' : ''}>
                    {l.blockedBy ? l.blockedBy : fmt(l.tCo2e, 0)}
                  </NumCell>
                  <td className={`border-b border-pl-border px-3 py-2 text-xs ${flagged ? 'text-pl-warning-text' : 'text-pl-muted'}`}>
                    {l.provenanceComplete ? l.source
                      : (l.missingProvenance ? `missing ${l.missingProvenance.join(' and ')}` : 'not computed')}
                  </td>
                </NumRow>
              );
            })}
          </tbody>
        </NumericTable>
        {inventory.blockedLines.length > 0 && (
          <p className="text-[11px] text-pl-warning-text mt-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            A blocked line is left out of the total rather than counted as zero, because those are
            different statements.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Carbon intensity</h3>
        {intensity.error ? (
          <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3 text-pl-warning-text">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm">{intensity.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Scope 1" value={fmt(intensity.scope1Intensity, 4)} hint={intensity.unit} />
              <Stat label="Scope 2" value={fmt(intensity.scope2Intensity, 4)} hint={intensity.unit} />
              <Stat label="Total" value={fmt(intensity.totalIntensity, 4)} hint={intensity.unit} />
            </div>
            <p className="text-[11px] text-pl-muted mt-2">{intensity.comparabilityNote}</p>
          </>
        )}
      </div>

      <p className="text-[11px] text-pl-warning-text border border-pl-warning/40 bg-pl-warning-bg rounded-md p-2">
        {inventory.disclaimer}
      </p>
      {flare.error && (
        <p className="text-[11px] text-pl-muted">{`Flaring: ${flare.error}`}</p>
      )}
    </div>
  );
};

export default InventoryResults;
