// Data import (BF2, 2026-09-06). Two real importers and one registry
// door, each with a preview and an explicit Apply:
//  - Calibration: a delimited file with depth and Ro and/or temperature
//    columns -> the Calibration tab's points.
//  - Formation tops: a delimited file with name and depth -> layers
//    (thickness from the gaps; ages are placeholders to type).
//  - Registry well: tops picked in Well Data Manager or Petrophysics
//    Studio -> the same layers, and the well is remembered as this
//    model's tie for the launchers.
// The previous version was a mock: a fixed delay, hardcoded points
// under an action the reducer did not handle, and a toast claiming
// "24 checkshot points". LAS and checkshot tabs are gone; a 1D basin
// model has no consumer for them.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { buildBasinModelRow } from '@/lib/basinHandoff';
import { depthFromDisplay, tempFromDisplay, fmtDepth, DEPTH_UNITS } from '../../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

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
    const r = parseTopsText(text);
    setTops({ name, ...r, tops: r.tops.map((t) => ({ ...t, depth: toM(t.depth) })) });
  };
  const fileUnitSelect = (
    <label className="flex items-center gap-2 text-xs text-pl-muted">Depths in the file are in
      <select data-testid="bf-import-file-unit" value={fileUnit} onChange={(e) => setFileUnit(e.target.value)} className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text">
        {DEPTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </label>
  );

  const applyCalibration = (mode) => {
    if (!cal) return;
    const prev = state.calibration || { ro: [], temp: [] };
    const stamp = (pts) => pts.map((p, i) => ({ id: `${Date.now()}-${i}-${p.depth}`, ...p }));
    const next = mode === 'replace'
      ? { ro: stamp(cal.ro), temp: stamp(cal.temp) }
      : { ro: [...(prev.ro || []), ...stamp(cal.ro)], temp: [...(prev.temp || []), ...stamp(cal.temp)] };
    dispatch({ type: 'SET_CALIBRATION_DATA', payload: next });
    toast({ title: 'Calibration points applied', description: `${cal.ro.length} Ro and ${cal.temp.length} temperature points from ${cal.name}.` });
    setCal(null);
  };

  const previewLayers = useMemo(() => {
    if (!tops?.tops?.length) return [];
    const bd = toM(parseFloat(baseDepth));
    return layersFromTops(tops.tops, { baseDepth: Number.isFinite(bd) ? bd : null, idFor: (i) => `import-${Date.now()}-${i}` });
  }, [tops, baseDepth]);

  const applyTops = () => {
    if (!previewLayers.length) return;
    // U2-010: kept for Undo
    dispatch({ type: 'REPLACE_LAYERS', payload: { stratigraphy: previewLayers, label: `Tops from ${tops.name}` } });
    toast({ title: 'Stratigraphy replaced', description: `${previewLayers.length} layers from ${tops.name}. The ages are placeholders: type them in Properties. Undo in Properties puts the previous layers back.` });
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
    return buildBasinModelRow({ well: registryWell, tops: registryWell.tops, intervals: registryIntervals, userId: null });
  }, [registryWell, registryIntervals]);
  const registryLayers = registryBuild?.row.stratigraphy || [];

  const applyRegistry = () => {
    if (!registryLayers.length) return;
    const b = registryBuild;
    // U2-010: one replacement (layers, erosion surfaces and the tie), kept for Undo
    dispatch({ type: 'REPLACE_LAYERS', payload: {
      stratigraphy: registryLayers, erosionEvents: b.row.erosion_events, label: `Registry well ${registryWell.name}`,
      settings: { registryWellId: registryWell.id, registryWellName: registryWell.name, registryKbM: b.row.settings.registryKbM, timescale: b.row.settings.timescale },
    } });
    toast({ title: 'Stratigraphy from the registry', description: `${b.layerCount} layers from ${registryWell.name}: ${b.datedCount} dated, ${b.erosionCount} erosion event${b.erosionCount === 1 ? '' : 's'}. ${b.problems.join(' ')}` });
  };

  const LayerPreview = ({ layers, testid }) => (
    <table className="w-full text-xs text-pl-text" data-testid={testid}>
      <thead><tr className="text-pl-muted text-left"><th className="font-normal">Layer</th><th className="font-normal text-right">Thickness ({units.depth})</th><th className="font-normal">Lithology</th><th className="font-normal text-right">Ages (Ma)</th></tr></thead>
      <tbody>
        {layers.map((l) => (
          <tr key={l.id} className="border-t border-pl-border" data-testid={`${testid}-row`}>
            <td className="py-0.5">{l.name}</td>
            <td className="py-0.5 text-right font-mono">{fmtDepth(l.thickness, units.depth)}</td>
            <td className="py-0.5 capitalize">{l.lithology}{l.provenance?.lithology_guessed === false ? ' (log)' : ' (guess)'}</td>
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
                <Problems items={cal.problems} kind="calibration" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" data-testid="bf-import-apply-calibration-append" disabled={!cal.ro.length && !cal.temp.length} onClick={() => applyCalibration('append')}>Add to the points</Button>
                  <Button size="sm" data-testid="bf-import-apply-calibration" disabled={!cal.ro.length && !cal.temp.length} onClick={() => applyCalibration('replace')}>Replace the points</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tops" className="space-y-4">
          {!tops && <ImportZone kind="tops" label="Drop a formation tops file: name and depth per row" onText={readTops} />}
          <div className="bg-pl-surface p-3 rounded border border-pl-border text-xs text-pl-muted flex flex-wrap items-center gap-3">
            <span>Columns: <span className="font-mono">name</span>, <span className="font-mono">depth</span> (top of the layer). Thickness is the gap to the next top; give a total depth for the last layer.</span>
            {fileUnitSelect}
          </div>
          {tops && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-pl-text"><FileText className="w-4 h-4 text-pl-muted" /> {tops.name}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-pl-muted" data-testid="bf-import-clear-tops" onClick={() => setTops(null)}><X className="w-4 h-4" /></Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-pl-muted">Total depth of the last layer ({fileUnit})
                  <Input type="number" step="any" data-testid="bf-import-tops-td" value={baseDepth} onChange={(e) => setBaseDepth(e.target.value)} className="h-7 w-28 text-xs" placeholder="optional" />
                </label>
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
              {registryLayers.length > 0 && <LayerPreview layers={registryLayers} testid="bf-registry-preview" />}
              {registryBuild && <p className="text-[11px] text-pl-muted" data-testid="bf-registry-notes">{registryBuild.problems.join(' ')}{registryBuild.erosionCount ? ` ${registryBuild.erosionCount} erosion event${registryBuild.erosionCount === 1 ? '' : 's'} with the amount to type.` : ''}</p>}
              <div className="flex justify-end">
                <Button size="sm" data-testid="bf-registry-apply" disabled={!registryLayers.length} onClick={applyRegistry}>Replace the stratigraphy</Button>
              </div>
              {state.settings?.registryWellName && <p className="text-xs text-pl-muted" data-testid="bf-registry-tied">Tied to {state.settings.registryWellName}.</p>}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedDataImport;
