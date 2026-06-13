# Petrolord Suite Chart Components

This directory holds **shared chart primitives** used across every Petrolord app
that renders charts (DCA, EPE, future Reservoir/Production/Facilities modules,
HSE dashboards, etc.).

The design philosophy is **small composable primitives, not heavyweight wrappers**.
Each app builds its own charts using Recharts directly, applying the shared
theme tokens and dropping in shared overlay components like `ChartLogo`.

---

## Components

### `ChartLogo`

Renders the Petrolord watermark logo as an absolute-positioned overlay,
intended to sit inside a `position: relative` chart container.

```jsx
import ChartLogo from '@/components/charts/ChartLogo';

<div style={{ position: 'relative', width: '100%', height: 400 }}>
  <ResponsiveContainer>
    <ComposedChart data={data} margin={CHART_MARGINS.standard}>
      {/* ... your chart elements ... */}
    </ComposedChart>
  </ResponsiveContainer>
  <ChartLogo />
</div>
```

**Customization:** pass a `style` prop to override defaults
(e.g., `<ChartLogo style={{ height: '60px' }} />`).

---

## Theme tokens (NOT in this directory)

Design tokens — colors, typography, margins, tooltip styles — live in
`src/utils/chartTheme.js`. They are the **single source of truth** for chart
styling across the Suite.

Import what you need:

```jsx
import {
  CHART_COLORS,        // background, grid, axisLine, axisText, tooltip*, legend*
  CHART_TYPOGRAPHY,    // axisFontSize, labelFontSize, tooltipFontSize, fontFamily
  CHART_MARGINS,       // .standard, .compact, .withLegend
  GRID_STYLE,          // pre-bundled CartesianGrid style
  TOOLTIP_STYLE,       // pre-bundled tooltip content style
  getStreamPalette,    // function: returns oil/gas/water palette
  ANNOTATION_BOX_CLASSNAME,
} from '@/utils/chartTheme';
```

---

## Standard chart pattern

Every chart in Petrolord Suite should follow this structure:

```jsx
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

<div style={{ position: 'relative', width: '100%', height: 400, background: CHART_COLORS.background }}>
  <ResponsiveContainer width="100%" height="100%">
    <ComposedChart data={data} margin={CHART_MARGINS.standard}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis
        dataKey="year"
        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
        stroke={CHART_COLORS.axisLine}
      />
      <YAxis
        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
        stroke={CHART_COLORS.axisLine}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
      {/* ... your data series here ... */}
    </ComposedChart>
  </ResponsiveContainer>
  <ChartLogo />
</div>
```

The outer `<div>` is what `<ChartLogo>` anchors to — it MUST have
`position: relative` (or sit inside a relatively-positioned ancestor).

---

## When to add a new component here

A new file in this directory is justified when:
- It's pure presentation (no domain logic)
- Used by 2+ apps (or will be in the near term)
- Doesn't pull in app-specific contexts or data shapes

Examples that would belong here in the future:
- `PetrolordTooltip` — formatted tooltip with consistent currency/unit display
- `PetrolordDownloadButton` — export-as-PNG / export-as-CSV button group
- `SensitivityBar` — building block for tornado charts

Examples that **don't** belong here (live in app-specific dirs):
- `DCABasePlots` — DCA-specific composition
- `EpeCashFlowWaterfall` — EPE-specific composition (will live in `src/components/epe/`)

---

_Established 2026-05-12 during EPE B3 Visualization & Branding._
