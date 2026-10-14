// Data import (BF2, 2026-09-06). Two real importers and one registry
// door, each with a preview and an explicit Apply:
//  - Calibration: a delimited file with depth and Ro and/or temperature
//    columns -> the Calibration tab's points.
//  - Formation tops: a delimited file with name and depth -> layers
//    (thickness from the gaps). A column file (services/columnFile.js)
//    with ages, hiatuses, lithology, source rock and eroded thickness
//    builds a dated model; without ages they are placeholders to type.
//  - Registry well: tops picked in Well Data Manager or Petrophysics
//    Studio -> the same layers, and the well is remembered as this
//    model's tie for the launchers. A column file dates the well's tops
//    and sets the lithologies by surface name (2026-10-14).
// The previous version was a mock: a fixed delay, hardcoded points
// under an action the reducer did not handle, and a toast claiming
// "24 checkshot points". LAS and checkshot tabs are gone; a 1D basin
// model has no consumer for them.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PetroLogsImport from './PetroLogsImport';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, AlertCircle, X, Database } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { parseCalibrationText, parseTopsText, layersFromTops } from '../../services/calibrationImport';
import { buildBasinModelRow, BASIN_LAYER_COLOUR } from '@/lib/basinHandoff';
import { parseColumnText, datedTops, layersFromColumn, applyColumnToLayers, erosionWithAmounts, rowDepthM } from '../../services/columnFile';
import { depthFromDisplay, tempFromDisplay, fmtDepth, DEPTH_UNITS } from '../../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { lithologyLabel } from '../../services/lithologyMix';

const ACCEPT = { 'text/csv': ['.csv'], 'text/plain': ['.txt', '.dat', '.prn', '.asc'], 'text/tab-separated-values': ['.tsv'] };

function ImportZone({ kind, label, onText }) {
  const onDrop = useCallback((files) => {
    const f = files?.[0];
    if (!f) return;
    f.text().then((t) => onText(t, f.name));
  }, [onText]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, maxFiles: 1 });
  return (
    <div
      {...getRootProps()}
      data-testid={`bf-import-zone-${kind}`}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors h-40 flex flex-col items-center justify-center ${
        isDragActive ? 'border-pl-primary bg-pl-sunken' : 'border-pl-border hover:border-pl-border-strong bg-pl-surface'
      }`}
    >
      <input {...getInputProps()} data-testid={`bf-import-input-${kind}`} />
      <Upload className="w-8 h-8 mx-auto mb-3 text-pl-muted" />
      <p className="text-sm text-pl-text font-medium">{label}</p>
      <p className="text-xs text-pl-muted mt-1">Comma, semicolon, tab or space separated; a header row names the columns</p>
    </div>
  );
}

function Problems({ items, kind }) {
  if (!items?.length) return null;
  return (
    <div className="bg-pl-warning-bg border border-pl-warning/40 rounded p-3 text-xs text-pl-warning-text space-y-1" data-testid={`bf-import-problems-${kind}`}>
      {items.slice(0, 8).map((p) => <div key={p} className="flex gap-2"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {p}</div>)}
      {items.length > 8 && <div>and {items.length - 8} more</div>}
    </div>
  );
}

const AdvancedDataImport = () => {
  const { state, dispatch, units } = useBasinFlow();
  const { backend } = useMultiWell();
  const [fileUnit, setFileUnit] = useState(units.depth); // depths in the files
  useEffect(() => { setFileUnit(units.depth); }, [units.depth]);
  const toM = (v) => depthFromDisplay(v, fileUnit);
  const { toast } = useToast();
  const [cal, setCal] = useState(null); // { name, ro, temp, problems }
  const [tops, setTops] = useState(null); // { name, tops, problems }
  const [baseDepth, setBaseDepth] = useState('');
  const [baseAge, setBaseAge] = useState('');
  const [regColumn, setRegColumn] = useState(null); // { name, rows, base, problems } dates a registry well's tops
  // calibration depths: from the model surface, or below the rig floor (KB) of the tie well
  const [calDatum, setCalDatum] = useState('surface');
  const surfaceBelowKbM = useMemo(() => {
    const first = [...(state.stratigraphy || [])].sort((a, b) => (Number(a.ageStart) || 0) - (Number(b.ageStart) || 0))[0];
    const z = Number(first?.provenance?.top_tvd_m);
    return Number.isFinite(z) && z > 0 ? z : null;
  }, [state.stratigraphy]);
  const [kbOffset, setKbOffset] = useState('');
  const [registryWells, setRegistryWells] = useState(null);
  const [registryId, setRegistryId] = useState('');

  useEffect(() => {
    let live = true;
    if (!backend?.listRegistryWells) { setRegistryWells([]); return undefined; }
    backend.listRegistryWells().then((w) => { if (live) setRegistryWells(w); }).catch(() => { if (live) setRegistryWells([]); });
    return () => { live = false; };
  }, [backend]);

  // BF-U1-010: a unit the header states wins over the picker and is said;
  // temperatures in F are converted to C (they were read as C)
  const readCalibration = (text, name) => {
    const r = parseCalibrationText(text);
    const zU = r.units?.depth || fileUnit; const tU = r.units?.temp || 'C';
    const z = (v) => depthFromDisplay(v, zU); const t = (v) => tempFromDisplay(v, tU);
    const read = `Read: depth from "${r.columns?.depth ?? EMPTY_VALUE}" in ${zU}${r.units?.depth ? ' (stated in the header)' : ' (the unit picked below)'}${r.columns?.ro ? `, Ro from "${r.columns.ro}" in %` : ''}${r.columns?.temp ? `, temperature from "${r.columns.temp}" in ${tU === 'F' ? 'F, converted to C' : 'C'}${r.units?.temp ? ' (stated in the header)' : ' (no unit in the header, C assumed)'}` : ''}.`;
    setCal({ name, ...r, read, ro: r.ro.map((p) => ({ ...p, depth: z(p.depth) })), temp: r.temp.map((p) => ({ ...p, depth: z(p.depth), value: t(p.value) })) });
  };
  const readTops = (text, name) => {
    // a header with a name column is a column file (ages, lithology ...);
    // a bare two-column list is the old name and depth
    const c = parseColumnText(text);
    if (c.rows.length && c.hasDepth) {
      setTops({ name, column: c, problems: c.problems, tops: [] });
      if (c.base?.age != null) setBaseAge(String(c.base.age));
      return;
    }
    const r = parseTopsText(text);
    setTops({ name, ...r, tops: r.tops.map((t) => ({ ...t, depth: toM(t.depth) })) });
  };
  const readRegColumn = (text, name) => {
    const c = parseColumnText(text);
    setRegColumn({ name, ...c });
  };
  const fileUnitSelect = (
    <label className="flex items-center gap-2 text-xs text-pl-muted">Depths in the file are in
      <select data-testid="bf-import-file-unit" value={fileUnit} onChange={(e) => setFileUnit(e.target.value)} className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text">
        {DEPTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </label>
  );

  // depths below KB move up by the depth of the model's surface below KB
  const kbShiftM = calDatum === 'kb' ? (Number.isFinite(surfaceBelowKbM) ? surfaceBelowKbM : depthFromDisplay(parseFloat(kbOffset), units.depth)) : 0;
  const kbShiftOk = calDatum !== 'kb' || (Number.isFinite(kbShiftM) && kbShiftM >= 0);
  const applyCalibration = (mode) => {
    if (!cal || !kbShiftOk) return;
    const prev = state.calibration || { ro: [], temp: [] };
    const shift = (pts) => pts.map((p) => ({ ...p, depth: p.depth - kbShiftM })).filter((p) => p.depth >= 0);
    const stamp = (pts) => shift(pts).map((p, i) => ({ id: `${Date.now()}-${i}-${p.depth}`, ...p }));
    const next = mode === 'replace'
      ? { ro: stamp(cal.ro), temp: stamp(cal.temp) }
      : { ro: [...(prev.ro || []), ...stamp(cal.ro)], temp: [...(prev.temp || []), ...stamp(cal.temp)] };
    dispatch({ type: 'SET_CALIBRATION_DATA', payload: next });
    toast({ title: 'Calibration points applied', description: `${cal.ro.length} Ro and ${cal.temp.length} temperature points from ${cal.name}.${kbShiftM > 0 ? ` Depths moved up ${fmtDepth(kbShiftM, units.depth)} ${units.depth} from KB to the model surface.` : ''}` });
    setCal(null);
  };

  // the column file's own depth unit (stated in its header) wins over the picker
  const colUnit = tops?.column?.units?.depth || fileUnit;
  const columnBuild = useMemo(() => {
    const c = tops?.column;
    if (!c) return null;
    const typedBd = parseFloat(baseDepth);
    const bdM = Number.isFinite(typedBd) ? rowDepthM(typedBd, colUnit) : (Number.isFinite(c.base?.depth) ? rowDepthM(c.base.depth, colUnit) : null);
    const ba = parseFloat(baseAge);
    const stamp = Date.now();
    const built = layersFromColumn(datedTops(c.rows, { fileUnit: colUnit }), { baseDepthM: bdM, baseAge: Number.isFinite(ba) ? ba : null, idFor: (i) => `import-${stamp}-${i}` });
    const applied = applyColumnToLayers(built.layers.map((l) => ({
      id: l.id, name: l.name, ageStart: l.ageStart, ageEnd: l.ageEnd, thickness: l.thickness, lithology: l.lithology, sourceRock: l.sourceRock, agesGuessed: l.agesGuessed,
      provenance: { lithology_guessed: l.lithologyGuessed, top_tvd_m: l.top_md_m, base_tvd_m: l.base_md_m, thickness_basis: 'file' },
    })), c.rows);
    // a source rock reads apart from the shales around it on the burial plot
    const colourOf = (l) => (l.sourceRock?.isSource ? '#7f4f24' : BASIN_LAYER_COLOUR[l.lithology] || (l.lithology === 'mixed' ? '#8d99ae' : '#94a3b8'));
    const layers = applied.layers.map((l) => ({ ...l, color: colourOf(l) }));
    const { lithologies, sources } = applied;
    const erosionEvents = erosionWithAmounts(built.erosionEvents, c.rows, c.units?.eroded || colUnit);
    return { layers, erosionEvents, lithologies, sources, problems: built.problems.filter((p) => !(/amount unknown/.test(p) && erosionEvents.some((e) => !e.amountUnknown && p.startsWith(e.surface)))) };
  }, [tops, baseDepth, baseAge, colUnit]);
  const previewLayers = useMemo(() => {
    if (columnBuild) return columnBuild.layers;
    if (!tops?.tops?.length) return [];
    const bd = toM(parseFloat(baseDepth));
    return layersFromTops(tops.tops, { baseDepth: Number.isFinite(bd) ? bd : null, idFor: (i) => `import-${Date.now()}-${i}` });
  }, [tops, baseDepth, columnBuild]);

  const applyTops = () => {
    if (!previewLayers.length) return;
    const dated = previewLayers.filter((l) => !l.agesGuessed).length;
    // U2-010: kept for Undo
    dispatch({ type: 'REPLACE_LAYERS', payload: { stratigraphy: previewLayers, ...(columnBuild ? { erosionEvents: columnBuild.erosionEvents } : {}), label: `Tops from ${tops.name}` } });
    toast({ title: 'Stratigraphy replaced', description: `${previewLayers.length} layers from ${tops.name}${columnBuild ? `: ${dated} dated, ${columnBuild.lithologies} lithologies, ${columnBuild.erosionEvents.length} erosion event${columnBuild.erosionEvents.length === 1 ? '' : 's'}` : ''}.${dated < previewLayers.length ? ' Some ages are placeholders: type them in Properties.' : ''} Undo in Properties puts the previous layers back.` });
    setTops(null);
  };

  const registryWell = (registryWells || []).find((w) => w.id === registryId) || null;
  // BF-U1-009: the same build as Stratigraphy Studio's Send to Basin: vertical
  // (TVD) thicknesses through the survey, ages from the dated surfaces,
  // lithology from the log, hiatuses as erosion events. This door used MD
  // differences and placeholder ages whatever the well carried.
  const [registryIntervals, setRegistryIntervals] = useState([]);
  useEffect(() => {
    let live = true;
    setRegistryIntervals([]);
    if (!registryWell || !backend?.listRegistryIntervals) return undefined;
    backend.listRegistryIntervals(registryWell.id).then((r) => { if (live) setRegistryIntervals(r || []); }).catch(() => { if (live) setRegistryIntervals([]); });
    return () => { live = false; };
  }, [registryWell, backend]);
  const registryBuild = useMemo(() => {
    if (!registryWell?.tops?.length) return null;
    if (!regColumn?.rows?.length) return buildBasinModelRow({ well: registryWell, tops: registryWell.tops, intervals: registryIntervals, userId: null });
    // a column file dates the well's tops by name; its base row dates the bottom layer at the well's TD
    const td = Number(registryWell.td_md_m);
    const baseAgeV = Number(regColumn.base?.age);
    const merged = datedTops(regColumn.rows, { withDepths: registryWell.tops });
    const withBase = Number.isFinite(td) && td > 0 && Number.isFinite(baseAgeV) ? [...merged, { id: '__base__', name: '__base__', md_m: td, age_ma: baseAgeV }] : merged;
    const b = buildBasinModelRow({ well: registryWell, tops: withBase, intervals: registryIntervals, userId: null });
    const kept = b.row.stratigraphy.filter((l) => l.name !== '__base__');
    const applied = applyColumnToLayers(kept, regColumn.rows);
    const strat = applied.layers.map((l) => ({ ...l, color: l.sourceRock?.isSource ? '#7f4f24' : BASIN_LAYER_COLOUR[l.lithology] || (l.lithology === 'mixed' ? '#8d99ae' : l.color) }));
    const erosion = erosionWithAmounts(b.row.erosion_events, regColumn.rows, regColumn.units?.eroded || fileUnit);
    const matched = registryWell.tops.filter((t) => regColumn.rows.some((r) => r.name && t.name && r.name.trim().toLowerCase() === t.name.trim().toLowerCase())).length;
    const datedCount = strat.filter((l) => !l.agesGuessed).length;
    const known = erosion.filter((e) => !e.amountUnknown);
    return {
      ...b,
      row: { ...b.row, stratigraphy: strat, erosion_events: erosion },
      layerCount: strat.length,
      datedCount,
      // the "with the amount to type" count: events the file gave no thickness
      erosionCount: erosion.length - known.length,
      problems: [
        `${regColumn.name}: ${matched} of ${registryWell.tops.length} tops matched by name, ${datedCount} of ${strat.length} layers dated, ${applied.lithologies} lithologies, ${applied.sources} source rock${applied.sources === 1 ? '' : 's'}${known.length ? `, ${known.map((e) => `${fmtDepth(e.amount, units.depth)} ${units.depth} eroded at the ${e.surface}`).join(', ')}` : ''}.`,
        ...b.problems.filter((p) => !/__base__/.test(p)
          && !(/amount unknown/.test(p) && known.some((e) => p.startsWith(e.surface)))
          && !(/placeholder ages/.test(p) && datedCount === strat.length)),
      ],
    };
  }, [registryWell, registryIntervals, regColumn, fileUnit, units.depth]);
  const registryLayers = registryBuild?.row.stratigraphy || [];

  const applyRegistry = () => {
    if (!registryLayers.length) return;
    const b = registryBuild;
    // U2-010: one replacement (layers, erosion surfaces and the tie), kept for Undo
    dispatch({ type: 'REPLACE_LAYERS', payload: {
      stratigraphy: registryLayers, erosionEvents: b.row.erosion_events, label: `Registry well ${registryWell.name}`,
      settings: { registryWellId: registryWell.id, registryWellName: registryWell.name, registryKbM: b.row.settings.registryKbM, timescale: b.row.settings.timescale },
    } });
    toast({ title: 'Stratigraphy from the registry', description: `${b.layerCount} layers from ${registryWell.name}: ${b.datedCount} dated, ${(b.row.erosion_events || []).length} erosion event${(b.row.erosion_events || []).length === 1 ? '' : 's'}. ${b.problems.join(' ')}` });
  };

  const LayerPreview = ({ layers, testid }) => (
    <table className="w-full text-xs text-pl-text" data-testid={testid}>
      <thead><tr className="text-pl-muted text-left"><th className="font-normal">Layer</th><th className="font-normal text-right">Thickness ({units.depth})</th><th className="font-normal">Lithology</th><th className="font-normal text-right">Ages (Ma)</th></tr></thead>
      <tbody>
        {layers.map((l) => (
          <tr key={l.id} className="border-t border-pl-border" data-testid={`${testid}-row`}>
            <td className="py-0.5">{l.name}</td>
            <td className="py-0.5 text-right font-mono">{fmtDepth(l.thickness, units.depth)}</td>
            <td className="py-0.5">{lithologyLabel(l)}{l.provenance?.lithology_from ? ' (file)' : l.provenance?.lithology_guessed === false ? ' (log)' : ' (guess)'}{l.sourceRock?.isSource ? `, source TOC ${l.sourceRock.toc} HI ${l.sourceRock.hi}` : ''}</td>
            <td className="py-0.5 text-right font-mono">{l.ageStart} to {l.ageEnd}{l.agesGuessed ? ' (placeholder)' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto" data-testid="bf-import">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-pl-text">Data Import</h2>
        <p className="text-sm text-pl-muted">Calibration points and formation tops from files, or tops from a registry well</p>
      </div>
      <Tabs defaultValue="calibration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calibration" data-testid="bf-import-tab-calibration" className="text-xs">Calibration data</TabsTrigger>
          <TabsTrigger value="tops" data-testid="bf-import-tab-tops" className="text-xs">Formation tops</TabsTrigger>
          <TabsTrigger value="registry" data-testid="bf-import-tab-registry" className="text-xs">Registry well</TabsTrigger>
          <TabsTrigger value="petro" data-testid="bf-import-tab-petro" className="text-xs">Petrophysics logs</TabsTrigger>
        </TabsList>

        <TabsContent value="calibration" className="space-y-4">
          {!cal && <ImportZone kind="calibration" label="Drop a calibration file: depth with Ro and/or temperature columns" onText={readCalibration} />}
          <div className="bg-pl-surface p-3 rounded border border-pl-border text-xs text-pl-muted flex flex-wrap items-center gap-3">
            <span>Columns: <span className="font-mono">depth</span>, <span className="font-mono">Ro</span> (%), <span className="font-mono">temperature</span> (°C). A row may carry one or both values.</span>
            {fileUnitSelect}
          </div>
          {cal && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-pl-text"><FileText className="w-4 h-4 text-pl-muted" /> {cal.name}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-pl-muted" data-testid="bf-import-clear-calibration" onClick={() => setCal(null)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="text-xs text-pl-text" data-testid="bf-import-preview-calibration">{cal.ro.length} Ro points, {cal.temp.length} temperature points read.</div>
                {cal.read && <div className="text-[11px] text-pl-muted" data-testid="bf-import-read-units">{cal.read}</div>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-pl-muted" data-testid="bf-import-cal-datum-row">
                  <span>Depths in the file are measured</span>
                  <select data-testid="bf-import-cal-datum" value={calDatum} onChange={(e) => setCalDatum(e.target.value)} className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text">
                    <option value="surface">from the model surface (top of the first layer)</option>
                    <option value="kb">below the rig floor (KB), as well depths are</option>
                  </select>
                  {calDatum === 'kb' && (Number.isFinite(surfaceBelowKbM)
                    ? <span data-testid="bf-import-cal-shift">The model surface is {fmtDepth(surfaceBelowKbM, units.depth)} {units.depth} below KB on the tie well, so every depth moves up by that.</span>
                    : <label className="flex items-center gap-1">Model surface below KB ({units.depth})<Input type="number" step="any" data-testid="bf-import-cal-kb" value={kbOffset} onChange={(e) => setKbOffset(e.target.value)} className="h-7 w-24 text-xs" /></label>)}
                </div>
                <Problems items={cal.problems} kind="calibration" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" data-testid="bf-import-apply-calibration-append" disabled={(!cal.ro.length && !cal.temp.length) || !kbShiftOk} onClick={() => applyCalibration('append')}>Add to the points</Button>
                  <Button size="sm" data-testid="bf-import-apply-calibration" disabled={(!cal.ro.length && !cal.temp.length) || !kbShiftOk} onClick={() => applyCalibration('replace')}>Replace the points</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tops" className="space-y-4">
          {!tops && <ImportZone kind="tops" label="Drop a formation tops file: name and depth per row" onText={readTops} />}
          <div className="bg-pl-surface p-3 rounded border border-pl-border text-xs text-pl-muted flex flex-wrap items-center gap-3">
            <span>Columns: <span className="font-mono">name</span>, <span className="font-mono">depth</span> (top of the layer). Thickness is the gap to the next top; give a total depth for the last layer. Add <span className="font-mono">age_ma</span>, <span className="font-mono">hiatus_end_ma</span>, <span className="font-mono">lithology</span>, <span className="font-mono">sand_pct</span>/<span className="font-mono">shale_pct</span>, <span className="font-mono">eroded_ft</span>, <span className="font-mono">toc</span> and <span className="font-mono">hi</span> columns, and a TD row with its depth and age, for a dated model.</span>
            {fileUnitSelect}
          </div>
          {tops && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-pl-text"><FileText className="w-4 h-4 text-pl-muted" /> {tops.name}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-pl-muted" data-testid="bf-import-clear-tops" onClick={() => setTops(null)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-pl-muted">Total depth of the last layer ({tops.column ? colUnit : fileUnit})
                    <Input type="number" step="any" data-testid="bf-import-tops-td" value={baseDepth} onChange={(e) => setBaseDepth(e.target.value)} className="h-7 w-28 text-xs" placeholder={tops.column?.base?.depth != null ? String(tops.column.base.depth) : 'optional'} />
                  </label>
                  {tops.column && (
                    <label className="flex items-center gap-2 text-xs text-pl-muted">Age at that depth (Ma)
                      <Input type="number" step="any" data-testid="bf-import-tops-base-age" value={baseAge} onChange={(e) => setBaseAge(e.target.value)} className="h-7 w-24 text-xs" placeholder="optional" />
                    </label>
                  )}
                </div>
                {tops.column && (
                  <p className="text-[11px] text-pl-muted" data-testid="bf-import-column-read">
                    Read as a column file: {Object.entries(tops.column.columns).map(([k, v]) => `${k} from "${v}"`).join(', ')}; depths in {colUnit}{tops.column.units?.depth ? ' (stated in the header)' : ' (the unit picked above)'}.
                    {columnBuild ? ` ${columnBuild.erosionEvents.length} erosion event${columnBuild.erosionEvents.length === 1 ? '' : 's'}${columnBuild.erosionEvents.some((e) => !e.amountUnknown) ? ` (${columnBuild.erosionEvents.filter((e) => !e.amountUnknown).map((e) => `${e.surface} ${fmtDepth(e.amount, units.depth)} ${units.depth}`).join(', ')})` : ''}.` : ''}
                  </p>
                )}
                {columnBuild?.problems?.length > 0 && <p className="text-[11px] text-pl-muted" data-testid="bf-import-column-notes">{columnBuild.problems.join(' ')}</p>}
                <Problems items={tops.problems} kind="tops" />
                {previewLayers.length > 0 && <LayerPreview layers={previewLayers} testid="bf-import-preview-tops" />}
                <div className="flex justify-end">
                  <Button size="sm" data-testid="bf-import-apply-tops" disabled={!previewLayers.length} onClick={applyTops}>Replace the stratigraphy</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <div className="bg-pl-surface p-3 rounded border border-pl-border text-xs text-pl-muted flex items-start gap-2">
            <Database className="w-4 h-4 text-pl-primary-text shrink-0" />
            <span>Wells in the shared registry (Well Data Manager) with tops picked in Petrophysics Studio or Well Correlation. The tops become the layer boundaries; the well is remembered as this model's tie.</span>
          </div>
          {registryWells === null ? (
            <p className="text-xs text-pl-muted">Loading registry wells…</p>
          ) : registryWells.length === 0 ? (
            <p className="text-xs text-pl-muted" data-testid="bf-registry-empty">No wells in the registry yet. Import them in Well Data Manager first.</p>
          ) : (
            <div className="space-y-3">
              <select data-testid="bf-registry-well" value={registryId} onChange={(e) => setRegistryId(e.target.value)} className="bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-xs text-pl-text">
                <option value="">Choose a well</option>
                {registryWells.map((w) => <option key={w.id} value={w.id}>{w.name} ({(w.tops || []).length} tops)</option>)}
              </select>
              {registryWell && registryLayers.length === 0 && <p className="text-xs text-pl-warning-text">This well has no tops yet.</p>}
              {registryWell && registryLayers.length > 0 && (
                <div className="space-y-2" data-testid="bf-registry-column">
                  {!regColumn ? (
                    <ImportZone kind="registry-column" label="Optional: a stratigraphic column file to date the tops and set the lithologies (surface, age, hiatus, lithology, eroded thickness, TOC, HI)" onText={readRegColumn} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-pl-text" data-testid="bf-registry-column-file"><FileText className="w-4 h-4 text-pl-muted" /> Ages and lithology from {regColumn.name}
                      <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-pl-muted" data-testid="bf-registry-column-clear" onClick={() => setRegColumn(null)}><X className="w-4 h-4" /></Button>
                    </div>
                  )}
                  {regColumn && <Problems items={regColumn.problems} kind="registry-column" />}
                </div>
              )}
              {registryLayers.length > 0 && <LayerPreview layers={registryLayers} testid="bf-registry-preview" />}
              {registryBuild && <p className="text-[11px] text-pl-muted" data-testid="bf-registry-notes">{registryBuild.problems.join(' ')}{registryBuild.erosionCount ? ` ${registryBuild.erosionCount} erosion event${registryBuild.erosionCount === 1 ? '' : 's'} with the amount to type.` : ''}</p>}
              <div className="flex justify-end">
                <Button size="sm" data-testid="bf-registry-apply" disabled={!registryLayers.length} onClick={applyRegistry}>Replace the stratigraphy</Button>
              </div>
              {state.settings?.registryWellName && <p className="text-xs text-pl-muted" data-testid="bf-registry-tied">Tied to {state.settings.registryWellName}.</p>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="petro" className="space-y-4">
          <PetroLogsImport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedDataImport;
