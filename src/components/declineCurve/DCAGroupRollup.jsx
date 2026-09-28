import React, { useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { rollupGroup } from '@/utils/declineCurve/dcaGroupRollup';
import ChartFrame from '@/components/charts/ChartFrame';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
  getStreamPalette,
} from '@/utils/chartTheme';
import { Layers, AlertTriangle } from 'lucide-react';

// R1: real group roll-up from saved scenarios. Each member well
// contributes its most recent scenario for the selected stream; the
// panel sums EURs and combines the forecast rate series by calendar
// month. Wells without a scenario are listed honestly, never summed
// silently. Replaced the pre-R1 "coming in next update" placeholder.
const DCAGroupRollup = () => {
  const { wellGroups, selectedWellGroup, wells, scenarios, selectedStream } = useDeclineCurve();
  const group = wellGroups.find(g => g.id === selectedWellGroup);

  const rollup = useMemo(
    () => (group ? rollupGroup(group, wells, scenarios, selectedStream) : null),
    [group, wells, scenarios, selectedStream],
  );

  if (!group) {
    return (
      <div className="p-4 text-center border border-dashed border-pl-border-strong rounded-lg bg-pl-surface">
        <div className="text-sm text-pl-muted mb-1 flex items-center justify-center gap-2"><Layers size={14}/> Group Roll-up</div>
        <p className="text-xs text-pl-muted">Select a well group to sum its member forecasts.</p>
      </div>
    );
  }
  if (!rollup) {
    return (
      <div className="p-4 text-center border border-dashed border-pl-border-strong rounded-lg bg-pl-surface">
        <p className="text-xs text-pl-muted">Group "{group.name}" has no member wells.</p>
      </div>
    );
  }

  const palette = getStreamPalette(selectedStream);
  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-pl-muted">
          <Layers size={14} />
          <span className="text-xs font-medium uppercase tracking-wider">Roll-up: {group.name}</span>
        </div>
        <span className="text-[10px] text-pl-muted capitalize">{selectedStream}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded border border-pl-border bg-pl-surface">
          <div className="text-pl-muted">Group EUR</div>
          <div className="text-pl-text font-semibold font-pl-mono tabular-nums">{Math.round(rollup.totalEur).toLocaleString()} {selectedStream === 'gas' ? 'Mscf' : 'bbl'}</div>
        </div>
        <div className="p-2 rounded border border-pl-border bg-pl-surface">
          <div className="text-pl-muted">Wells summed</div>
          <div className="text-pl-text font-semibold">{rollup.perWell.length} of {group.wellIds.length}</div>
        </div>
      </div>

      {rollup.perWell.length > 0 && (
        <div className="text-xs space-y-1">
          {rollup.perWell.map(w => (
            <div key={w.wellId} className="flex justify-between text-pl-muted">
              <span className="truncate">{w.wellName}</span>
              <span className="tabular-nums">{Math.round(w.eur).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {rollup.missingWells.length > 0 && (
        <div className="p-2 rounded border border-pl-warning/40 bg-pl-warning-bg text-[11px] text-pl-warning-text flex gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            No saved {selectedStream} scenario for {rollup.missingWells.map(w => w.wellName).join(', ')}.
            Fit, forecast and save a scenario for each to include them.
          </span>
        </div>
      )}

      {rollup.combinedRates.length > 0 && (
        <div data-canvas="chart" className="bg-pl-chart-surface border border-pl-border rounded-lg p-2">
          <div className="text-[11px] font-semibold text-pl-text mb-1">Combined forecast rate</div>
          <ChartFrame height={160}>
            <LineChart data={rollup.combinedRates} margin={CHART_MARGINS.standard}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="month" tick={axisTick} minTickGap={28} stroke={CHART_COLORS.axisLine} />
              <YAxis tick={axisTick} stroke={CHART_COLORS.axisLine} width={52} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v, n) => [typeof v === 'number' ? Math.round(v).toLocaleString() : v, n === 'rate' ? 'Group rate' : n]} />
              <Line type="monotone" dataKey="rate" stroke={palette.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </div>
      )}
    </div>
  );
};

export default DCAGroupRollup;
