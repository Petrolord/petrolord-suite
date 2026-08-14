import React from 'react';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

/*
 * Symmetric sensitivity tornado for ReservoirCalc Pro.
 *
 * Each bar spans the conditional P50 of the output when the parameter sits in
 * its bottom decile (one end) vs its top decile (other end), centred on the
 * overall P50 — the classic petroleum tornado, so a reader sees at a glance
 * how far each parameter swings the volume below and above the P50.
 *
 * Drawn as a self-contained SVG (no charting runtime) so it captures crisply
 * in the slide PNG, the html2canvas PDF snapshots and svg-to-png embedding.
 * Colors: below-P50 segment blue, above-P50 segment emerald (validated
 * diverging pair on the white chart surface); identity is never color-alone —
 * the side of the P50 axis carries the same information.
 *
 * Props:
 *   rows    [{ label, low, high, lowInputVol, highInputVol, contribution }]
 *           — volumes already scaled to display units, widest swing first
 *   base    overall P50 in display units (the centre axis)
 *   unit    display unit label, e.g. 'MMstb'
 *   width / height  pixel size (ResponsiveContainer injects these when the
 *           chart is wrapped in a ChartFrame; pass explicitly otherwise)
 *   compact tighter paddings + smaller fonts for the slide panel
 */

export const DOWN_COLOR = '#2563eb';   // below P50 (blue-600)
export const UP_COLOR = '#059669';     // above P50 (emerald-600)

const fmtVal = (v, span) => {
    if (!Number.isFinite(v)) return '—';
    const digits = span < 2 ? 2 : span < 20 ? 1 : 0;
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const TornadoChart = ({ rows = [], base, unit = '', width = 600, height = 240, compact = false, fluid = false, svgRef = null }) => {
    if (!rows.length || !Number.isFinite(base)) return null;

    const fs = compact ? 10 : CHART_TYPOGRAPHY.axisFontSize; // base font size
    const padL = compact ? 74 : 96;        // parameter label column
    const padR = compact ? 8 : 12;
    const padT = compact ? 24 : 30;        // P50 label + legend band
    const padB = compact ? 14 : 18;        // min/max axis labels
    const valuePad = compact ? 34 : 44;    // room inside the plot for end labels
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const rowH = plotH / rows.length;
    const barH = Math.min(compact ? 13 : 16, rowH * 0.55);

    let xmin = base, xmax = base;
    rows.forEach((r) => {
        if (r.low < xmin) xmin = r.low;
        if (r.high > xmax) xmax = r.high;
    });
    const span = xmax - xmin || 1;
    xmin -= span * 0.02;
    xmax += span * 0.02;
    const fullSpan = xmax - xmin;
    // Reserve label room INSIDE the plot so end values never clip at the edges.
    const sx = (v) => padL + valuePad + ((v - xmin) / fullSpan) * (plotW - 2 * valuePad);
    const xBase = sx(base);

    return (
        <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            {...(fluid ? {} : { width, height })}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily, display: 'block', ...(fluid ? { width: '100%', height: '100%' } : {}) }}
        >
            <rect x="0" y="0" width={width} height={height} fill={CHART_COLORS.background} />

            {/* Legend (top-left of the plot area) */}
            <g transform={`translate(${padL + valuePad}, ${padT - (compact ? 12 : 15)})`}>
                <rect x="0" y="-7" width="9" height="9" rx="2" fill={DOWN_COLOR} />
                <text x="13" y="0" fontSize={fs - 1} fill={CHART_COLORS.axisText}>below P50</text>
                <rect x={compact ? 68 : 74} y="-7" width="9" height="9" rx="2" fill={UP_COLOR} />
                <text x={compact ? 81 : 87} y="0" fontSize={fs - 1} fill={CHART_COLORS.axisText}>above P50</text>
            </g>

            {/* P50 centre axis */}
            <line x1={xBase} y1={padT - 4} x2={xBase} y2={padT + plotH} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3" strokeWidth="1.2" />
            <text x={xBase} y={padT - (compact ? 12 : 15)} textAnchor="middle" fontSize={fs} fontWeight="700" fill={CHART_COLORS.axisLabel}>
                P50 {fmtVal(base, fullSpan)} {unit}
            </text>

            {/* Bars */}
            {rows.map((r, i) => {
                const yMid = padT + i * rowH + rowH / 2;
                const yBar = yMid - barH / 2;
                const xLo = sx(r.low);
                const xHi = sx(r.high);
                // Split at the P50 axis; clamp for the rare row that sits
                // entirely on one side of it.
                const xSplit = Math.min(Math.max(xBase, xLo), xHi);
                const leftW = Math.max(0, xSplit - xLo - 1);
                const rightW = Math.max(0, xHi - xSplit - 1);
                return (
                    <g key={r.label}>
                        {/* row grid line */}
                        <line x1={padL} y1={yMid} x2={width - padR} y2={yMid} stroke={CHART_COLORS.grid} strokeWidth="0.5" />
                        {/* parameter label + variance share */}
                        <text x={padL - 8} y={yMid + fs * 0.35} textAnchor="end" fontSize={fs} fontWeight="600" fill={CHART_COLORS.axisText}>
                            {r.label}
                        </text>
                        {Number.isFinite(r.contribution) && rowH >= 26 && (
                            <text x={padL - 8} y={yMid + fs * 0.35 + (compact ? 9 : 11)} textAnchor="end" fontSize={fs - 2} fill={CHART_COLORS.axisLine}>
                                {r.contribution.toFixed(0)}% var
                            </text>
                        )}
                        {leftW > 0 && <rect x={xLo} y={yBar} width={leftW} height={barH} rx="2" fill={DOWN_COLOR} />}
                        {rightW > 0 && <rect x={xSplit + 1} y={yBar} width={rightW} height={barH} rx="2" fill={UP_COLOR} />}
                        {/* end value labels, outside the bar */}
                        <text x={xLo - 4} y={yMid + fs * 0.35} textAnchor="end" fontSize={fs - 1} fill={CHART_COLORS.axisText}>
                            {fmtVal(r.low, fullSpan)}
                        </text>
                        <text x={xHi + 4} y={yMid + fs * 0.35} textAnchor="start" fontSize={fs - 1} fill={CHART_COLORS.axisText}>
                            {fmtVal(r.high, fullSpan)}
                        </text>
                    </g>
                );
            })}

            {/* X extent labels */}
            <text x={padL + valuePad} y={height - 4} textAnchor="start" fontSize={fs - 1} fill={CHART_COLORS.axisLine}>
                {fmtVal(xmin, fullSpan)}
            </text>
            <text x={(padL + valuePad + width - padR - valuePad) / 2} y={height - 4} textAnchor="middle" fontSize={fs - 1} fontWeight="600" fill={CHART_COLORS.axisText}>
                Volume ({unit})
            </text>
            <text x={width - padR - valuePad} y={height - 4} textAnchor="end" fontSize={fs - 1} fill={CHART_COLORS.axisLine}>
                {fmtVal(xmax, fullSpan)}
            </text>
        </svg>
    );
};

export default TornadoChart;
