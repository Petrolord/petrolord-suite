// The bubble map of the VRR Monitor (VRR-U2-004): voidage by well on the
// well locations of the wells registry (geo_wells), through a match table
// the user confirms (owner default). Proposals are only proposals: no well
// is placed until the table is confirmed, and an unmatched well is listed,
// never placed by guess. White chart standard (ChartFrame + chartTheme +
// ChartLogo); the report draws the same points (src/utils/vrr/wellMap.js).
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';
import { MapPin, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { supabase } from '@/lib/customSupabaseClient';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import {
  proposeWellMatches, draftMatches, confirmWellMatches, buildBubbleMap, registryChanges,
} from '@/utils/vrr/wellMap';

const COLOR = { producer: '#166534', injector: '#0e7490', pattern: '#dc2626' };
const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

/** The wells of the registry the user may read (own and shared). */
async function readRegistry() {
  const { data, error } = await supabase.from('geo_wells').select('id, name, uwi, surface_x, surface_y, crs, xy_unit').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

const sameDraft = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if ((a?.[k]?.wellId || null) !== (b?.[k]?.wellId || null)) return false;
  return true;
};

export default function WellMapPanel() {
  const derived = useVrrMonitor();
  const { inputs, isImported, wellVoidage, setWellMap, canWrite, u, withheld } = derived;
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);

  const ledgerWells = useMemo(() => (wellVoidage?.wells || []).filter((w) => w.type !== 'unknown'), [wellVoidage]);
  const load = () => { setError(null); readRegistry().then(setRegistry).catch((e) => { setError(e.message); setRegistry([]); }); };
  useEffect(() => { if (isImported && registry === null) load(); }, [isImported]); // eslint-disable-line react-hooks/exhaustive-deps

  const proposals = useMemo(() => (registry ? proposeWellMatches(ledgerWells.map((w) => w.well), registry) : []), [registry, ledgerWells]);
  const confirmed = inputs.wellMap?.confirmedAt ? inputs.wellMap.matches || {} : null;
  // the table shown: what the user is choosing, else the confirmed table, else the proposals
  const table = draft || (confirmed ? Object.fromEntries(Object.entries(confirmed).map(([k, m]) => [k, m ? { wellId: m.wellId } : null])) : draftMatches(proposals));
  const dirty = confirmed ? !sameDraft(table, confirmed) : true;
  const map = useMemo(() => buildBubbleMap(derived, inputs.wellMap), [derived, inputs.wellMap]);
  const changes = useMemo(() => (registry && inputs.wellMap?.confirmedAt ? registryChanges(inputs.wellMap, registry) : []), [registry, inputs.wellMap]);

  if (!isImported) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-pl-muted">The map needs an imported per-well ledger: the period grid has no wells. Import one on the Data &amp; PVT tab.</CardContent></Card>
    );
  }

  const choose = (well, wellId) => setDraft({ ...table, [well]: wellId ? { wellId } : null });
  const confirm = () => {
    const { wellMap, dropped } = confirmWellMatches(table, registry || []);
    setWellMap(wellMap);
    setDraft(null);
    if (dropped.length) setError(`Left off the map (the registry well is gone or has no location): ${dropped.join(', ')}.`);
  };
  const points = (type) => map.points.filter((p) => p.type === type).map((p) => ({ ...p, valueShown: Math.round(u.show('reservoir', p.value)) }));
  const centres = map.patterns.filter((q) => q.placed).map((q) => ({ ...q, well: `${q.name} (VRR ${fmt(q.cumulativeVRR, 2)})`, valueShown: 0 }));

  return (
    <>
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Wells registry match table</CardTitle>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Read the registry again</Button>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p className="text-pl-muted">
            Each ledger well is placed at the surface location of the registry well you match it to (Well Data Manager). The
            proposals below are only proposals: nothing is placed until you confirm the table, and a well left unmatched is
            listed, never placed by guess. The confirmed coordinates are kept with this project.
          </p>
          {error && <div className={`border rounded px-2 py-1 ${THEMED_TONE.warn}`}>{error}</div>}
          {registry === null ? <div className="text-pl-muted">Reading the wells registry...</div> : (
            <table className="w-full" data-testid="vrr-map-matches">
              <thead><tr className="text-left text-pl-muted"><th>Ledger well</th><th>Type</th><th>Registry well</th><th>Note</th></tr></thead>
              <tbody>
                {ledgerWells.map((w) => {
                  const p = proposals.find((x) => x.well === w.well);
                  return (
                    <tr key={w.well}>
                      <td className="font-pl-mono">{w.well}</td>
                      <td>{w.type}</td>
                      <td>
                        <select aria-label={`Registry well for ${w.well}`} data-testid={`vrr-map-match-${w.well}`} className="bg-pl-surface border border-pl-border rounded px-1 max-w-[16rem]" value={table[w.well]?.wellId || ''} onChange={(e) => choose(w.well, e.target.value)} disabled={!canWrite}>
                          <option value="">not on the map</option>
                          {registry.map((r) => <option key={r.id} value={r.id}>{r.name}{r.uwi ? ` (${r.uwi})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="text-pl-muted">{p?.note || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!registry?.length && registry !== null && <div className="text-pl-muted">No well in the registry you can read. Add the wells in Well Data Manager first.</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={confirm} disabled={!canWrite || !registry || !dirty} data-testid="vrr-map-confirm">Confirm the match table</Button>
            {inputs.wellMap?.confirmedAt && !dirty && (
              <span className="inline-flex items-center gap-1 text-pl-success-text" data-testid="vrr-map-confirmed"><CheckCircle2 className="w-4 h-4" /> Confirmed {String(inputs.wellMap.confirmedAt).slice(0, 10)}</span>
            )}
            {inputs.wellMap?.confirmedAt && dirty && <span className="text-pl-warning-text">The table differs from the confirmed one: confirm it to use it.</span>}
          </div>
          {changes.map((c) => <div key={c.well} className="text-pl-warning-text">{c.text} Confirm the table again to take the new location.</div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Voidage by well <span className="text-xs font-normal text-pl-muted ml-1">{u.label('reservoir')} over the record: produced (producers), injected (injectors); bubble area by value</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {map.ok ? (
            <ChartFrame height={420} exportFilename="vrr-bubble-map">
              <ScatterChart margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis type="number" dataKey="x" name="X" unit={map.xyUnit ? ` ${map.xyUnit}` : ''} domain={['auto', 'auto']} {...axisProps} />
                <YAxis type="number" dataKey="y" name="Y" unit={map.xyUnit ? ` ${map.xyUnit}` : ''} domain={['auto', 'auto']} width={90} {...axisProps} />
                <ZAxis type="number" dataKey="valueShown" range={[60, 1600]} name={u.label('reservoir')} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} cursor={{ strokeDasharray: '3 3' }} />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Scatter name="Producers (produced voidage)" data={points('producer')} fill={COLOR.producer} fillOpacity={0.55} isAnimationActive={false}>
                  <LabelList dataKey="well" position="top" style={{ fontSize: 10, fill: CHART_COLORS.axisText }} />
                </Scatter>
                <Scatter name="Injectors (injected volume)" data={points('injector')} fill={COLOR.injector} fillOpacity={0.55} isAnimationActive={false}>
                  <LabelList dataKey="well" position="top" style={{ fontSize: 10, fill: CHART_COLORS.axisText }} />
                </Scatter>
                {centres.length > 0 && (
                  <Scatter name="Pattern centre (cumulative VRR)" data={centres} fill={COLOR.pattern} shape="square" isAnimationActive={false}>
                    <LabelList dataKey="well" position="bottom" style={{ fontSize: 10, fill: COLOR.pattern }} />
                  </Scatter>
                )}
              </ScatterChart>
            </ChartFrame>
          ) : (
            <div className="h-48 flex items-center justify-center px-6 text-center text-pl-muted text-sm" data-testid="vrr-map-refusal">
              {withheld || map.refusal}
            </div>
          )}
          {map.ok && (
            <p className="text-xs text-pl-muted px-4 pb-3" data-testid="vrr-map-basis">
              {map.points.length} well{map.points.length === 1 ? '' : 's'} placed in {map.crs || 'a CRS not stated'} ({map.xyUnit || 'unit not stated'}), match table confirmed {String(map.confirmedAt).slice(0, 10)}.
              {map.unplaced.length ? ` Not on the map: ${map.unplaced.map((x) => x.well).join(', ')}.` : ''} The scales of the two axes may differ.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
