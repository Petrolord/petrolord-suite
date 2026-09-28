// Slow-moving and obsolete stock by stated bands (SC3).
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fmtNum } from '@/utils/supplychain/materialsAdapters';
import {
  Ledger, TextCell,
  Basis, EmptyRegister, NumField, Panel, ResultGate, Stat, TextField,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

const SlowInputs = () => {
  const { inputs, setSection } = useMaterialsSpares();
  const s = inputs.slow;
  const set = (patch) => setSection('slow', patch);
  const setBand = (i, patch) => set({ bands: s.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <Panel title="Slow-moving policy" testId="slow-inputs">
      <div>
        <p className="mb-1 text-[11px] font-medium text-pl-text">Bands by months since the last issue (the first from 0, rising)</p>
        {s.bands.map((b, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1.4fr_1fr_1fr_auto] items-end gap-2">
            <TextField testId={`band-label-${i}`} value={b.label} onChange={(v) => setBand(i, { label: v })} placeholder="label" />
            <NumField label={i === 0 ? 'From months' : ''} testId={`band-min-${i}`} value={b.minMonths} onChange={(v) => setBand(i, { minMonths: v })} />
            <NumField label={i === 0 ? 'Write-down %' : ''} testId={`band-wd-${i}`} value={b.writeDownPct} onChange={(v) => setBand(i, { writeDownPct: v })} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-pl-muted" onClick={() => set({ bands: s.bands.filter((_, j) => j !== i) })} aria-label={`Remove band ${i + 1}`}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="text-pl-primary-text" onClick={() => set({ bands: [...s.bands, { label: '', minMonths: '', writeDownPct: '' }] })} data-testid="add-band">
          <Plus className="mr-1 h-3 w-3" /> Band
        </Button>
      </div>
      <NumField label="Excess above this many months of cover" testId="slow-excess" value={s.excessCoverMonths} onChange={(v) => set({ excessCoverMonths: v })} hint="Cover is stock on hand divided by monthly usage. With no usage, all stock on hand is excess." />
    </Panel>
  );
};

const SlowResults = () => {
  const { results, inputs } = useMaterialsSpares();
  const cur = inputs.register.currency;
  return (
    <ResultGate result={results.slow} testId="slow">
      {(r) => {
        const data = Object.entries(r.byBand).map(([band, v]) => ({ band, stock: v.stockValue, writeDown: v.writeDown }));
        return (
          <Panel title="Slow-moving and obsolete stock" testId="slow-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label={`Stock value${cur ? ` (${cur})` : ''}`} value={fmtNum(r.totalStockValue, 2)} testId="slow-stock" />
              <Stat label="Write-down" value={fmtNum(r.totalWriteDown, 2)} testId="slow-writedown" />
              <Stat label="Items with excess stock" value={String(r.excessCount)} testId="slow-excess-count" />
            </div>
            <div className="overflow-hidden rounded-lg border border-pl-border">
              <ChartFrame height={220} exportFilename="slow-moving-bands">
                <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="band" tick={tick} />
                  <YAxis tick={tick} tickFormatter={(v) => fmtNum(v, 0)} width={90} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 2)} />
                  <Legend {...LEGEND_PROPS} />
                  <Bar dataKey="stock" name="Stock value" fill="#2563eb" isAnimationActive={false} />
                  <Bar dataKey="writeDown" name="Write-down" fill="#dc2626" isAnimationActive={false} />
                </BarChart>
              </ChartFrame>
            </div>
            <Ledger>
              <thead><tr><NumTh sticky>Item</NumTh><NumTh>Band</NumTh><NumTh numeric>Stock value</NumTh><NumTh numeric>Write-down</NumTh><NumTh numeric>Cover (months)</NumTh><NumTh numeric>Excess units</NumTh><NumTh>Reason</NumTh></tr></thead>
              <tbody>
                {r.items.map((it) => (
                  <NumRow key={it.id} data-testid={`slow-row-${it.id}`}>
                    <RowLabel className="font-pl-mono">{it.id}</RowLabel>
                    <TextCell data-testid={`slow-band-${it.id}`}>{it.band}</TextCell>
                    <NumCell>{fmtNum(it.stockValue, 2)}</NumCell>
                    <NumCell data-testid={`slow-wd-${it.id}`}>{fmtNum(it.writeDown, 2)}</NumCell>
                    <NumCell>{it.coverMonths === null ? 'no usage' : fmtNum(it.coverMonths, 2)}</NumCell>
                    <NumCell>{it.excess ? fmtNum(it.excessQuantity, 2) : 'none'}</NumCell>
                    <TextCell muted>{it.reason}</TextCell>
                  </NumRow>
                ))}
              </tbody>
            </Ledger>
            <Basis basis={r.basis} testId="slow-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const SlowMovingView = () => {
  const { items } = useMaterialsSpares();
  return (
    <div className="space-y-4">
      {items.length === 0 ? <EmptyRegister /> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <SlowInputs />
        <SlowResults />
      </div>
    </div>
  );
};

export default SlowMovingView;
