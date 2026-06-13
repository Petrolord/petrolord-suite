#!/usr/bin/env node
/**
 * Reservoir Balance — PvtRock.jsx Property Visualizer Petrolord conversion
 * =========================================================================
 *
 * File: tools/patches/2026-05-16_rb_pvtrock_petrolord_chart.cjs
 *
 * Purpose:
 *   Apply Petrolord chart conventions to the Property Visualizer card in
 *   PvtRock.jsx so it matches the diagnostic plots and DCA/EPE charts:
 *
 *     - White card background with slate-200 border (was bg-slate-800/50)
 *     - CardHeader light-themed (was border-slate-800 bg-slate-900/50)
 *     - chartTheme tokens (CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS,
 *       GRID_STYLE, TOOLTIP_STYLE) for axes, grid, tooltip, legend
 *     - <ChartLogo /> watermark inside the chart wrapper
 *     - Chart wrapped in `relative bg-white` div so watermark positions correctly
 *
 *   The per-property color (lime/sky/rose) is preserved on the data Line
 *   itself — that's the property identity. Only the chart chrome (axes,
 *   grid, tooltip background) changes to slate.
 *
 *   The Tabs picker (Bo/Rs/Visc. or z/Bg) is re-themed for light background:
 *   slate-100 list bg, slate-300 border, active states keep their lime/sky/rose
 *   accent for high contrast.
 *
 * Pre-flight expected MD5: a9e02f13809e7180baa91a67442e7e32
 * (c.2.b + LineChart unused-import cleanup applied)
 *
 * Safety:
 *   - Three anchored operations, each verified unique
 *   - Atomic: all three succeed or none are written
 *   - Idempotent: re-running on patched source exits "Already patched"
 *   - Backs up the file before modifying
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_pvtrock_petrolord_chart.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/components/reservoirbalance/PvtRock.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-petrolord-chart-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// ANCHORS
// ─────────────────────────────────────────────────────────────────────────────

// OP 1: Add chartTheme + ChartLogo imports.
// Anchor on the existing api import which is at the end of the import block.
const OP1_OLD = `import {
  getCaseDefaultConfig,
  getPvtPreview,
  savePvtConfig,
} from '@/pages/apps/reservoir-balance/lib/api';`;
const OP1_NEW = `import {
  getCaseDefaultConfig,
  getPvtPreview,
  savePvtConfig,
} from '@/pages/apps/reservoir-balance/lib/api';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
} from '@/utils/chartTheme';`;

// OP 2: Re-theme the Property Visualizer Card + CardHeader + Tabs picker.
//
// Two changes in one anchor:
//   - Card: bg-slate-800/50 border-slate-700 → bg-white border-slate-200
//   - CardHeader: border-slate-800 bg-slate-900/50 → border-slate-200 bg-slate-50
//   - CardTitle text color: text-slate-200 → text-slate-800
//   - TabsList: bg-slate-950 border-slate-700 → bg-slate-100 border-slate-300
const OP2_OLD = `      {/* ─── Property Visualizer ─── */}
      <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
        <CardHeader className="border-b border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Property Visualizer
            </CardTitle>
            <Tabs value={activePlot} onValueChange={setActivePlot} className="w-[300px]">
              <TabsList
                className={\`grid w-full bg-slate-950 border border-slate-700 \${
                  isGas ? 'grid-cols-2' : 'grid-cols-3'
                }\`}
              >`;
const OP2_NEW = `      {/* ─── Property Visualizer ─── */}
      <Card className="bg-white border-slate-200 shadow-lg">
        <CardHeader className="border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Property Visualizer
            </CardTitle>
            <Tabs value={activePlot} onValueChange={setActivePlot} className="w-[300px]">
              <TabsList
                className={\`grid w-full bg-slate-100 border border-slate-300 \${
                  isGas ? 'grid-cols-2' : 'grid-cols-3'
                }\`}
              >`;

// OP 3: Replace the chart internals: wrap in relative bg-white div for
// ChartLogo, replace inline color literals with chartTheme tokens, add
// <ChartLogo /> watermark.
//
// Empty-state message uses slate-500/600 text on white background instead
// of slate-500/600 on dark. Same hex, looks correct on either side.
const OP3_OLD = `        <CardContent className="p-4 pt-6">
          {previewRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart
                data={previewRows}
                margin={{ top: 5, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="pressure_psia"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke="#475569"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  label={{
                    value: 'Pressure (psia)',
                    position: 'bottom',
                    offset: 0,
                    fill: '#cbd5e1',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  yAxisId="left"
                  stroke={currentPlot.color}
                  tick={{ fill: currentPlot.color, fontSize: 12 }}
                  domain={['auto', 'auto']}
                  label={{
                    value: currentPlot.name,
                    angle: -90,
                    position: 'insideLeft',
                    fill: currentPlot.color,
                    fontSize: 12,
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                  }}
                  itemStyle={{ color: currentPlot.color, fontWeight: 'bold' }}
                  labelStyle={{
                    color: '#e2e8f0',
                    marginBottom: '4px',
                    paddingBottom: '4px',
                    borderBottom: '1px solid #1e293b',
                  }}
                  formatter={(value) => formatNum(value, 4)}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey={currentPlot.dataKey}
                  name={currentPlot.name}
                  stroke={currentPlot.color}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: currentPlot.color,
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-slate-500">
              <div className="text-center">
                <Info className="h-5 w-5 mx-auto mb-2 text-slate-600" />
                <p className="text-sm">No preview yet. Click Recalculate to generate.</p>
              </div>
            </div>
          )}
        </CardContent>`;
const OP3_NEW = `        <CardContent className="p-4 pt-6">
          {previewRows.length > 0 ? (
            <div className="relative h-[350px] bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={previewRows}
                  margin={CHART_MARGINS.withLegend}
                >
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="pressure_psia"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    label={{
                      value: 'Pressure (psia)',
                      position: 'bottom',
                      offset: 0,
                      style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize },
                    }}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={['auto', 'auto']}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    label={{
                      value: currentPlot.name,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize },
                    }}
                  />
                  <RechartsTooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: currentPlot.color, fontWeight: 'bold' }}
                    formatter={(value) => formatNum(value, 4)}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    wrapperStyle={{
                      fontSize: \`\${CHART_TYPOGRAPHY.legendFontSize}px\`,
                      color: CHART_COLORS.legendText,
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey={currentPlot.dataKey}
                    name={currentPlot.name}
                    stroke={currentPlot.color}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 6,
                      fill: currentPlot.color,
                      stroke: '#fff',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-slate-500 bg-white">
              <div className="text-center">
                <Info className="h-5 w-5 mx-auto mb-2 text-slate-400" />
                <p className="text-sm">No preview yet. Click Recalculate to generate.</p>
              </div>
            </div>
          )}
        </CardContent>`;

// Sentinel: a unique substring present after the patch is applied.
const PATCHED_SENTINEL = `import ChartLogo from '@/components/charts/ChartLogo';`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`PvtRock.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function applyOp(content, opName, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    throw new Error(
      `Anchor not found for op "${opName}". The file has drifted from the expected baseline.`,
    );
  }
  const occ = content.split(oldStr).length - 1;
  if (occ !== 1) {
    throw new Error(
      `Anchor for op "${opName}" matched ${occ} times; expected exactly 1.`,
    );
  }
  return content.replace(oldStr, newStr);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PvtRock.jsx — Property Visualizer Petrolord conversion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  if (original.includes(PATCHED_SENTINEL)) {
    console.log('');
    console.log('✓ Already patched. Nothing to do.');
    process.exit(0);
  }

  console.log('');
  console.log('Applying 3 anchored operations...');

  let next = original;
  const ops = [
    { name: '1-add-chart-theme-imports', old: OP1_OLD, new: OP1_NEW },
    { name: '2-retheme-card-and-tabs', old: OP2_OLD, new: OP2_NEW },
    { name: '3-petrolord-chart-internals', old: OP3_OLD, new: OP3_NEW },
  ];

  for (const op of ops) {
    next = applyOp(next, op.name, op.old, op.new);
    console.log(`  ✓ ${op.name}`);
  }

  // Verify sentinel + that the inline hex literals are gone
  if (!next.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: PATCHED_SENTINEL not present after patch.');
  }
  // The old Property Visualizer had hex literals; confirm key ones are absent.
  // (We only check ones that were uniquely in the Visualizer block — Other
  // hex literals may still exist elsewhere in the file legitimately.)
  const removedLiterals = ['stroke="#334155"', 'stroke="#475569"', "backgroundColor: '#0f172a'"];
  for (const lit of removedLiterals) {
    if (next.includes(lit)) {
      throw new Error(
        `Verify failed: expected removed literal still present — "${lit}"`,
      );
    }
  }
  // ChartLogo should appear inside the chart wrapper
  if (!next.includes('<ChartLogo />')) {
    throw new Error('Verify failed: <ChartLogo /> not present after patch.');
  }

  console.log('');
  console.log('Writing backup...');
  fs.writeFileSync(BACKUP_PATH, original, 'utf8');
  console.log(`Backup: ${BACKUP_PATH}`);

  console.log('');
  console.log('Writing patched file...');
  fs.writeFileSync(TARGET_PATH, next, 'utf8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Bytes before: ${original.length}`);
  console.log(`  Bytes after:  ${next.length}`);
  console.log(`  Net change:   ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
  console.log(`  Card theme:   dark slate → white with slate-200 border`);
  console.log(`  Chart tokens: chartTheme imports + GRID_STYLE/TOOLTIP_STYLE/CHART_COLORS used`);
  console.log(`  Watermark:    <ChartLogo /> added`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: hard-reload the PVT tab. Property Visualizer should now match');
  console.log('  the diagnostic plots: white background, slate axes, ChartLogo bottom-right.');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error('No changes were written.');
  process.exit(1);
}
