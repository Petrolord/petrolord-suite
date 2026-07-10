import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
  LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

const axisTick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = { fontSize: CHART_TYPOGRAPHY.labelFontSize, fill: CHART_COLORS.axisLabel };
// Dark-on-white, print-distinguishable series colors.
const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v);

const HallPlotPanel = ({ data, alerts }) => {
  const [selectedInjectors, setSelectedInjectors] = useState(data.slice(0, 3).map((d) => d.injector));

  const handleInjectorToggle = (injector) => {
    setSelectedInjectors((prev) =>
      prev.includes(injector) ? prev.filter((i) => i !== injector) : [...prev, injector]
    );
  };

  const injectivityIssues = alerts?.injectivity_issue || [];
  const selected = data.filter((d) => selectedInjectors.includes(d.injector));

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <h2 className="text-2xl font-bold text-white mb-1">Hall Plot Analysis</h2>
      <p className="text-cyan-200/80 text-sm mb-4">
        Hall integral (Σ&nbsp;p·Δt) vs cumulative injection. A steepening slope (rising p/q) signals declining injectivity; a flattening slope signals improving injectivity.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <h3 className="font-semibold text-white mb-2">Injectors</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {data.map((d) => (
              <div key={d.injector} className="flex items-center space-x-2 bg-white/5 p-2 rounded-md">
                <Checkbox
                  id={`check-${d.injector}`}
                  checked={selectedInjectors.includes(d.injector)}
                  onCheckedChange={() => handleInjectorToggle(d.injector)}
                />
                <Label htmlFor={`check-${d.injector}`} className="flex-grow">{d.injector}</Label>
                {injectivityIssues.some((issue) => issue.injector === d.injector) && (
                  <Badge variant="destructive">Injectivity</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-3 bg-white rounded-lg p-4">
          <ChartFrame height={360}>
            <ScatterChart margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="x" name="Hall Integral" height={XAXIS_LABEL_HEIGHT} tick={axisTick} stroke={CHART_COLORS.axisLine}
                tickFormatter={fmt}
                label={{ value: 'Hall Integral (psi·day)', position: 'insideBottom', offset: -6, style: axisLabel }} />
              <YAxis type="number" dataKey="y" name="Cumulative Injection" tick={axisTick} stroke={CHART_COLORS.axisLine}
                tickFormatter={fmt}
                label={{ value: 'Cumulative Injection (bbl)', angle: -90, position: 'insideLeft', style: axisLabel }} />
              <ZAxis range={[12, 12]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} cursor={{ strokeDasharray: '3 3' }} />
              <Legend {...LEGEND_PROPS} />
              {selected.map((d, index) => (
                <Scatter
                  key={d.injector}
                  name={`${d.injector} (slope ${d.slope_last != null ? d.slope_last.toFixed(2) : 'N/A'})`}
                  data={d.hall_integral.map((x, i) => ({ x, y: d.cum_injection[i] }))}
                  fill={COLORS[index % COLORS.length]}
                  line={{ stroke: COLORS[index % COLORS.length], strokeWidth: 2 }}
                  lineType="joint"
                  shape="circle"
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ChartFrame>
        </div>
      </div>
    </motion.div>
  );
};

export default HallPlotPanel;
