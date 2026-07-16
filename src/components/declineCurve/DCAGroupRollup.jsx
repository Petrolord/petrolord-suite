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
      <div className="p-4 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
        <div className="text-sm text-slate-400 mb-1 flex items-center justify-center gap-2"><Layers size={14}/> Group Roll-up</div>
        <p className="text-xs text-slate-600">Select a well group to sum its member forecasts.</p>
      </div>
    );
  }
  if (!rollup) {
    return (
      <div className="p-4 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
        <p className="text-xs text-slate-500">Group "{group.name}" has no member wells.</p>
      </div>
    );
  }

  const palette = getStreamPalette(selectedStream);
  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <Layers size={14} />
          <span className="text-xs font-medium uppercase tracking-wider">Roll-up: {group.name}</span>
        </div>
        <span className="text-[10px] text-slate-500 capitalize">{selectedStream}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded border border-slate-700 bg-slate-800">
          <div className="text-slate-500">Group EUR</div>
          <div className="text-slate-100 font-semibold">{Math.round(rollup.totalEur).toLocaleString()} {selectedStream === 'gas' ? 'Mscf' : 'bbl'}</div>
        </div>
        <div className="p-2 rounded border border-slate-700 bg-slate-800">
          <div className="text-slate-500">Wells summed</div>
          <div className="text-slate-100 font-semibold">{rollup.perWell.length} of {group.wellIds.length}</div>
        </div>
      </div>

      {rollup.perWell.length > 0 && (
        <div className="text-xs space-y-1">
          {rollup.perWell.map(w => (
            <div key={w.wellId} className="flex justify-between text-slate-400">
              <span className="truncate">{w.wellName}</span>
              <span className="tabular-nums">{Math.round(w.eur).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {rollup.missingWells.length > 0 && (
        <div className="p-2 rounded border border-amber-800/50 bg-amber-900/20 text-[11px] text-amber-300 flex gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            No saved {selectedStream} scenario for {rollup.missingWells.map(w => w.wellName).join(', ')}.
            Fit, forecast and save a scenario for each to include them.
          </span>
        </div>
      )}

      {rollup.combinedRates.length > 0 && (
        <div className="bg-white rounded-lg p-2">
          <div className="text-[11px] font-semibold text-slate-700 mb-1">Combined forecast rate</div>
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
