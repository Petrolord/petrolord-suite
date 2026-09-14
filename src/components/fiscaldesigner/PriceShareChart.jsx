// Government share vs oil price (EC2-1, 2026-09-14). The marks follow the
// point states worked out in ./priceShareChart.js: a line through shares, an
// open marker pinned to the top for a share above 100 percent, and a shaded
// band where the project is uneconomic and no share exists.
import React from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE } from '@/utils/chartTheme';
import { UNECONOMIC_BAND_LABEL, describePoint } from './priceShareChart';

const tickStyle = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

const PinnedMarker = ({ cx, cy, stroke }) => (
  Number.isFinite(cx) && Number.isFinite(cy)
    ? <circle className="fiscal-pinned-marker" cx={cx} cy={cy} r={5} fill="#ffffff" stroke={stroke} strokeWidth={2} />
    : null
);

const ShareTooltip = ({ active, label, payload, model }) => {
  if (!active) return null;
  const price = label ?? payload?.[0]?.payload?.price;
  const row = model.rows.find((r) => r.price === price);
  if (!row) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow">
      <p className="mb-1 font-semibold">{price} USD/bbl</p>
      {model.names.map((name) => (
        <p key={name}><span className="font-medium">{name}:</span> {describePoint(row.meta[name])}</p>
      ))}
    </div>
  );
};

const PriceShareChart = ({ model, colors }) => {
  const colorOf = (name) => colors[model.names.indexOf(name) % colors.length];
  return (
    <>
      <ChartFrame height={280} exportFilename="fiscal-take-vs-price">
        <ComposedChart data={model.rows} margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="price" type="number" domain={model.xDomain} ticks={model.ticks} allowDataOverflow
            stroke={CHART_COLORS.axisLine} tick={tickStyle}
            label={{ value: 'Oil price ($/bbl)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis domain={model.domain} allowDataOverflow stroke={CHART_COLORS.axisLine} tick={tickStyle} unit="%" />
          {model.bands.map((b) => (
            <ReferenceArea
              key={`${b.from}-${b.to}`} className="fiscal-uneconomic-band"
              x1={b.x1} x2={b.x2} y1={model.domain[0]} y2={model.domain[1]}
              fill="#94a3b8" fillOpacity={0.2} ifOverflow="hidden"
              label={{ value: UNECONOMIC_BAND_LABEL, position: 'insideTop', fill: CHART_COLORS.axisText, fontSize: 10 }}
            />
          ))}
          <Tooltip content={<ShareTooltip model={model} />} />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
          {model.names.map((name) => (
            <Line
              key={name} type="monotone" dataKey={name} connectNulls={false} isAnimationActive={false}
              stroke={colorOf(name)} strokeWidth={2} dot={{ r: 2.5 }}
            />
          ))}
          {model.pinned.map((p) => (
            <Scatter
              key={`pinned-${p.name}`} name={`${p.name} above 100 percent`} data={p.points} dataKey="pinnedAt"
              legendType="none" isAnimationActive={false}
              shape={(props) => <PinnedMarker {...props} stroke={colorOf(p.name)} />}
            />
          ))}
        </ComposedChart>
      </ChartFrame>
      <p className="text-[12px] text-slate-300 mt-2">
        Lines run through the prices at which a regime&apos;s point is a government share. An open marker at the top of
        the axis is a share above 100 percent, where the government collects more than the project makes; hover for
        its value. A shaded band marks a price at which the project is uneconomic, so no share exists.
      </p>
    </>
  );
};

export default PriceShareChart;
