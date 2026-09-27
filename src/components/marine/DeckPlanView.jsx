// Deck plan (SC4): stated deck cargo packed onto stated voyages by first-fit
// decreasing by area and by first fit in the booked order, side by side,
// with every unit left behind named with its reason.
import React, { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Plus, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import {
  DECK_RULES, blankDeckItem, fmtNum, fmtShare, isRefusal, parseDeckItemsCsv,
} from '@/utils/supplychain/marineAdapters';
import {
  Basis, Cell, Note, NumField, Panel, Refusal, SelectField, Stat, TextField,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const RULE_COLOR = { ffd: '#2563eb', ff: '#d97706' };
const ITEM_COLS = [
  ['lengthM', 'Length (m)'], ['widthM', 'Width (m)'], ['weightT', 'Weight (t)'], ['quantity', 'Quantity'],
];

const DeckInputs = () => {
  const { inputs, setSection } = useMarineLogistics();
  const d = inputs.deck;
  const set = (patch) => setSection('deck', patch);
  const [from, setFrom] = useState('');
  const [paste, setPaste] = useState('');
  const [parseError, setParseError] = useState(null);
  const vessels = inputs.cluster.vessels;
  const copyVessel = () => {
    const v = vessels.find((x) => x.key === from);
    if (v) set({ name: v.name, areaM2: v.deckAreaM2, usableFraction: v.deckUsableFraction, loadT: v.deckLoadT });
  };
  const setItem = (i, patch) => set({ items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const doImport = () => {
    const parsed = parseDeckItemsCsv(paste);
    if (parsed.error) { setParseError(parsed.error); return; }
    setParseError(null);
    set({ items: parsed.items });
  };
  return (
    <Panel title="Deck and cargo" testId="deck-inputs">
      <div className="flex items-end gap-2 rounded-md border border-slate-800 bg-slate-950/50 p-2">
        <div className="flex-1">
          <SelectField label="Copy the deck from a vessel" testId="deck-from-vessel" value={from} onChange={setFrom} options={vessels.map((v) => ({ value: v.key, label: v.name || v.key }))} />
        </div>
        <Button size="sm" variant="outline" className="h-8 border-slate-700 bg-slate-900 text-slate-200" disabled={!from} onClick={copyVessel} data-testid="deck-from-vessel-fill">Copy figures</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Deck name" testId="deck-name" value={d.name} onChange={(v) => set({ name: v })} placeholder="optional" />
        <NumField label="Clear deck area (m2)" testId="deck-area" value={d.areaM2} onChange={(v) => set({ areaM2: v })} />
        <NumField label="Usable fraction (above 0, at most 1)" testId="deck-usable" value={d.usableFraction} onChange={(v) => set({ usableFraction: v })} />
        <NumField label="Deck load (t)" testId="deck-load" value={d.loadT} onChange={(v) => set({ loadT: v })} />
        <NumField label="Voyages available" testId="deck-voyages" value={d.voyages} onChange={(v) => set({ voyages: v })} hint="One deck a voyage." />
      </div>
      <div className="overflow-x-auto">
        <p className="mb-1 text-[11px] font-medium text-slate-300">Deck cargo in the order booked</p>
        <table className="w-full text-xs">
          <thead className="text-left text-slate-400"><tr><th className="p-1">Id</th><th className="p-1">Name</th>{ITEM_COLS.map(([, l]) => <th key={l} className="p-1">{l}</th>)}<th /></tr></thead>
          <tbody>
            {d.items.map((x, i) => (
              <tr key={i} className="border-t border-slate-800" data-testid={`deck-item-row-${i}`}>
                <td className="p-1"><Cell numeric={false} label={`Item ${i + 1} id`} testId={`deck-item-id-${i}`} value={x.id} onChange={(v) => setItem(i, { id: v })} /></td>
                <td className="p-1"><Cell numeric={false} label={`Item ${i + 1} name`} testId={`deck-item-name-${i}`} value={x.name} onChange={(v) => setItem(i, { name: v })} placeholder="optional" /></td>
                {ITEM_COLS.map(([k, l]) => (
                  <td key={k} className="p-1"><Cell label={`Item ${i + 1} ${l}`} testId={`deck-item-${k}-${i}`} value={x[k]} onChange={(v) => setItem(i, { [k]: v })} /></td>
                ))}
                <td className="p-1"><Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => set({ items: d.items.filter((_, j) => j !== i) })} aria-label={`Remove item ${i + 1}`}><X className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button size="sm" variant="ghost" className="text-sky-300" data-testid="add-deck-item" onClick={() => set({ items: [...d.items, blankDeckItem()] })}>
          <Plus className="mr-1 h-3 w-3" /> Cargo line
        </Button>
      </div>
      <div className="space-y-1">
        <label htmlFor="mlp-deck-paste" className="block text-[11px] font-medium text-slate-300">Paste deck cargo (CSV: id, name, lengthM, widthM, weightT, quantity)</label>
        <textarea id="mlp-deck-paste" data-testid="deck-paste" className="h-20 w-full rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'id,name,lengthM,widthM,weightT,quantity\ncont-20,20 ft container,6.06,2.44,12,4'} />
        <Button size="sm" onClick={doImport} data-testid="deck-import" className="bg-slate-700 hover:bg-slate-600"><Upload className="mr-1 h-4 w-4" /> Replace the cargo lines</Button>
        {parseError ? <Note tone="warn" testId="deck-parse-error">{parseError}</Note> : null}
      </div>
    </Panel>
  );
};

const RulePlan = ({ label, rkey, r }) => {
  const t = (k) => `deck-${rkey}-${k}`;
  if (isRefusal(r)) return <Refusal result={r} testId={t('refusal')} />;
  const overflowArea = r.overflow.reduce((a, o) => a + o.areaM2, 0);
  const neverFit = r.neverFit || [];
  const never = new Set(neverFit);
  return (
    <div className="space-y-2 rounded-md border border-slate-800 p-2" data-testid={t('plan')}>
      <p className="text-sm font-semibold text-slate-100">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Voyages used" value={String(r.voyagesUsed)} testId={t('used')} />
        <Stat label="Lower bound on voyages (units that fit an empty voyage)" value={String(r.lowerBound)} testId={t('bound')} />
        <Stat label="Units left behind" value={String(r.overflow.length)} testId={t('overflow-count')} />
        <Stat label="Area left behind (m2)" value={fmtNum(overflowArea, 4)} testId={t('overflow-area')} />
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400"><tr><th className="p-1">Voyage</th><th className="p-1 text-right">Units</th><th className="p-1 text-right">Area (m2)</th><th className="p-1 text-right">Weight (t)</th><th className="p-1 text-right">Area used</th><th className="p-1 text-right">Load used</th></tr></thead>
        <tbody>
          {r.voyages.map((v) => (
            <tr key={v.voyage} className="border-t border-slate-800 text-slate-200" data-testid={t(`voyage-${v.voyage}`)}>
              <td className="p-1">{v.voyage}</td>
              <td className="p-1 text-right font-mono">{v.units.length}</td>
              <td className="p-1 text-right font-mono" data-testid={t(`voyage-${v.voyage}-area`)}>{fmtNum(v.areaM2, 4)}</td>
              <td className="p-1 text-right font-mono" data-testid={t(`voyage-${v.voyage}-weight`)}>{fmtNum(v.weightT, 2)}</td>
              <td className="p-1 text-right font-mono">{fmtShare(v.areaUtilisation, 2)}</td>
              <td className="p-1 text-right font-mono">{fmtShare(v.loadUtilisation, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {neverFit.length ? (
        <div className="rounded-md border border-rose-800/60 bg-rose-950/30 p-2 text-[11px] text-rose-200" data-testid={t('never-fit')}>
          <p className="font-semibold">
            {neverFit.length === 1 ? '1 unit no voyage can carry' : `${neverFit.length} units no voyage can carry`}
          </p>
          <p>
            Each is larger than the usable deck area or heavier than the deck load, so it stays behind on any number of voyages.
            The lower bound leaves these units out.
          </p>
          <p className="font-mono" data-testid={t('never-fit-units')}>{neverFit.join(', ')}</p>
        </div>
      ) : null}
      {r.overflow.length ? (
        <ul className="space-y-0.5 text-[11px] text-amber-200" data-testid={t('overflow')}>
          {r.overflow.map((o) => (
            <li key={o.unit} className={never.has(o.unit) ? 'text-rose-200' : undefined} data-testid={t(`overflow-row-${o.unit}`)}>
              {never.has(o.unit) ? <span className="mr-1 rounded bg-rose-900/60 px-1 font-semibold" data-testid={t(`overflow-never-${o.unit}`)}>no voyage can carry</span> : null}
              <span data-testid={t(`overflow-${o.unit}`)}>{o.reason}</span>
            </li>
          ))}
        </ul>
      ) : <Note testId={t('all-placed')}>Every unit is placed.</Note>}
      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer text-slate-300">Packing order</summary>
        <p className="font-mono">{r.packingOrder.join(', ')}</p>
      </details>
      <Basis basis={r.basis} testId={t('basis')} />
    </div>
  );
};

const DeckResults = () => {
  const { results } = useMarineLogistics();
  const ffd = results.deckFfd;
  const ff = results.deckFf;
  const both = !isRefusal(ffd) && !isRefusal(ff);
  const data = both ? [
    ...ffd.voyages.map((v, i) => ({ name: `Voyage ${v.voyage}`, ffd: v.areaM2, ff: ff.voyages[i] ? ff.voyages[i].areaM2 : 0 })),
    { name: 'Left behind', ffd: ffd.overflow.reduce((a, o) => a + o.areaM2, 0), ff: ff.overflow.reduce((a, o) => a + o.areaM2, 0) },
  ] : [];
  return (
    <Panel title="Deck plan" testId="deck-results">
      {both ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Usable deck area (m2)" value={fmtNum(ffd.usableAreaM2, 4)} testId="deck-usable-area" />
          <Stat label="Cargo area (m2)" value={fmtNum(ffd.totalAreaM2, 4)} testId="deck-total-area" />
          <Stat label="Cargo weight (t)" value={fmtNum(ffd.totalWeightT, 2)} testId="deck-total-weight" />
        </div>
      ) : null}
      {both ? (
        <div className="overflow-hidden rounded-lg border border-slate-700">
          <ChartFrame height={220} exportFilename="deck-plan-rules">
            <BarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" tick={tick} />
              <YAxis tick={tick} tickFormatter={(x) => fmtNum(x, 0)} width={55} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(x) => `${fmtNum(x, 4)} m2`} />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={ffd.usableAreaM2} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Usable area', fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }} />
              {DECK_RULES.map((x) => <Bar key={x.key} dataKey={x.key} name={x.label} fill={RULE_COLOR[x.key]} isAnimationActive={false} />)}
            </BarChart>
          </ChartFrame>
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {DECK_RULES.map((x) => <RulePlan key={x.key} label={x.label} rkey={x.key} r={x.key === 'ffd' ? ffd : ff} />)}
      </div>
    </Panel>
  );
};

const DeckPlanView = () => (
  <div className="space-y-4">
    <Note>
      Both packing rules run on the same deck and cargo. First-fit decreasing sorts the units by footprint, largest first (heavier
      first on a tie); first fit takes them in the order booked. Each unit goes to the first voyage whose area and deck load still hold
      it. An overflow reason names the limit that stops the unit: usable area, deck load, or both. The lower bound counts only
      the units that fit an empty voyage; a unit larger than the usable area or heavier than the deck load is listed apart as one no
      voyage can carry. This is an area bound: units are not stacked and their shapes are not checked against the deck.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <DeckInputs />
      <DeckResults />
    </div>
  </div>
);

export default DeckPlanView;
