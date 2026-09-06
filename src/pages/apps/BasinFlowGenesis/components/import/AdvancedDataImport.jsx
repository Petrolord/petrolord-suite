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
import { depthFromDisplay, fmtDepth, DEPTH_UNITS } from '../../services/units';

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
        isDragActive ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-600 bg-slate-950'
      }`}
    >
      <input {...getInputProps()} data-testid={`bf-import-input-${kind}`} />
      <Upload className="w-8 h-8 mx-auto mb-3 text-slate-500" />
      <p className="text-sm text-slate-300 font-medium">{label}</p>
      <p className="text-xs text-slate-500 mt-1">Comma, semicolon, tab or space separated; a header row names the columns</p>
    </div>
  );
}

function Problems({ items, kind }) {
  if (!items?.length) return null;
  return (
    <div className="bg-amber-900/10 border border-amber-900/30 rounded p-3 text-xs text-amber-200/90 space-y-1" data-testid={`bf-import-problems-${kind}`}>
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

  const readCalibration = (text, name) => {
    const r = parseCalibrationText(text);
    setCal({ name, ...r, ro: r.ro.map((p) => ({ ...p, depth: toM(p.depth) })), temp: r.temp.map((p) => ({ ...p, depth: toM(p.depth) })) });
  };
  const readTops = (text, name) => {
    const r = parseTopsText(text);
    setTops({ name, ...r, tops: r.tops.map((t) => ({ ...t, depth: toM(t.depth) })) });
  };
  const fileUnitSelect = (
    <label className="flex items-center gap-2 text-xs text-slate-400">Depths in the file are in
      <select data-testid="bf-import-file-unit" value={fileUnit} onChange={(e) => setFileUnit(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100">
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
    dispatch({ type: 'REORDER_LAYERS', payload: previewLayers });
    toast({ title: 'Stratigraphy replaced', description: `${previewLayers.length} layers from ${tops.name}. The ages are placeholders: type them in Properties.` });
    setTops(null);
  };

  const registryWell = (registryWells || []).find((w) => w.id === registryId) || null;
  const registryLayers = useMemo(() => {
    if (!registryWell?.tops?.length) return [];
    const td = Number(registryWell.td_md_m);
    return layersFromTops(registryWell.tops.map((t) => ({ name: t.name, depth: t.md_m })), { baseDepth: Number.isFinite(td) && td > 0 ? td : null, idFor: (i) => `reg-${registryWell.id}-${i}` });
  }, [registryWell]);

  const applyRegistry = () => {
    if (!registryLayers.length) return;
    dispatch({ type: 'REORDER_LAYERS', payload: registryLayers });
    dispatch({ type: 'UPDATE_SETTINGS', payload: { registryWellId: registryWell.id, registryWellName: registryWell.name } });
    toast({ title: 'Stratigraphy from the registry', description: `${registryLayers.length} layers from the tops of ${registryWell.name}. The ages are placeholders: type them in Properties.` });
  };

  const LayerPreview = ({ layers, testid }) => (
    <table className="w-full text-xs text-slate-200" data-testid={testid}>
      <thead><tr className="text-slate-500 text-left"><th className="font-normal">Layer</th><th className="font-normal text-right">Thickness ({units.depth})</th><th className="font-normal">Lithology guess</th><th className="font-normal text-right">Ages (placeholder)</th></tr></thead>
      <tbody>
        {layers.map((l) => (
          <tr key={l.id} className="border-t border-slate-800">
            <td className="py-0.5">{l.name}</td>
            <td className="py-0.5 text-right font-mono">{fmtDepth(l.thickness, units.depth)}</td>
            <td className="py-0.5 capitalize">{l.lithology}</td>
            <td className="py-0.5 text-right font-mono">{l.ageStart} to {l.ageEnd} Ma</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto" data-testid="bf-import">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Data Import</h2>
        <p className="text-sm text-slate-400">Calibration points and formation tops from files, or tops from a registry well</p>
      </div>
      <Tabs defaultValue="calibration" className="space-y-4">
        <TabsList className="bg-slate-900 border border-slate-800 p-1">
          <TabsTrigger value="calibration" data-testid="bf-import-tab-calibration" className="data-[state=active]:bg-indigo-600 text-xs">Calibration data</TabsTrigger>
          <TabsTrigger value="tops" data-testid="bf-import-tab-tops" className="data-[state=active]:bg-indigo-600 text-xs">Formation tops</TabsTrigger>
          <TabsTrigger value="registry" data-testid="bf-import-tab-registry" className="data-[state=active]:bg-indigo-600 text-xs">Registry well</TabsTrigger>
        </TabsList>

        <TabsContent value="calibration" className="space-y-4">
          {!cal && <ImportZone kind="calibration" label="Drop a calibration file: depth with Ro and/or temperature columns" onText={readCalibration} />}
          <div className="bg-slate-900/50 p-3 rounded border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center gap-3">
            <span>Columns: <span className="font-mono">depth</span>, <span className="font-mono">Ro</span> (%), <span className="font-mono">temperature</span> (°C). A row may carry one or both values.</span>
            {fileUnitSelect}
          </div>
          {cal && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white"><FileText className="w-4 h-4 text-indigo-400" /> {cal.name}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-slate-500" data-testid="bf-import-clear-calibration" onClick={() => setCal(null)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="text-xs text-slate-300" data-testid="bf-import-preview-calibration">{cal.ro.length} Ro points, {cal.temp.length} temperature points read.</div>
                <Problems items={cal.problems} kind="calibration" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" data-testid="bf-import-apply-calibration-append" disabled={!cal.ro.length && !cal.temp.length} onClick={() => applyCalibration('append')}>Add to the points</Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" data-testid="bf-import-apply-calibration" disabled={!cal.ro.length && !cal.temp.length} onClick={() => applyCalibration('replace')}>Replace the points</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tops" className="space-y-4">
          {!tops && <ImportZone kind="tops" label="Drop a formation tops file: name and depth per row" onText={readTops} />}
          <div className="bg-slate-900/50 p-3 rounded border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center gap-3">
            <span>Columns: <span className="font-mono">name</span>, <span className="font-mono">depth</span> (top of the layer). Thickness is the gap to the next top; give a total depth for the last layer.</span>
            {fileUnitSelect}
          </div>
          {tops && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white"><FileText className="w-4 h-4 text-indigo-400" /> {tops.name}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-slate-500" data-testid="bf-import-clear-tops" onClick={() => setTops(null)}><X className="w-4 h-4" /></Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">Total depth of the last layer ({fileUnit})
                  <Input type="number" step="any" data-testid="bf-import-tops-td" value={baseDepth} onChange={(e) => setBaseDepth(e.target.value)} className="h-7 w-28 bg-slate-950 text-xs" placeholder="optional" />
                </label>
                <Problems items={tops.problems} kind="tops" />
                {previewLayers.length > 0 && <LayerPreview layers={previewLayers} testid="bf-import-preview-tops" />}
                <div className="flex justify-end">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" data-testid="bf-import-apply-tops" disabled={!previewLayers.length} onClick={applyTops}>Replace the stratigraphy</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <div className="bg-slate-900/50 p-3 rounded border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
            <Database className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Wells in the shared registry (Well Data Manager) with tops picked in Petrophysics Studio or Well Correlation. The tops become the layer boundaries; the well is remembered as this model's tie.</span>
          </div>
          {registryWells === null ? (
            <p className="text-xs text-slate-500">Loading registry wells…</p>
          ) : registryWells.length === 0 ? (
            <p className="text-xs text-slate-500" data-testid="bf-registry-empty">No wells in the registry yet. Import them in Well Data Manager first.</p>
          ) : (
            <div className="space-y-3">
              <select data-testid="bf-registry-well" value={registryId} onChange={(e) => setRegistryId(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100">
                <option value="">Choose a well</option>
                {registryWells.map((w) => <option key={w.id} value={w.id}>{w.name} ({(w.tops || []).length} tops)</option>)}
              </select>
              {registryWell && registryLayers.length === 0 && <p className="text-xs text-amber-400">This well has no tops yet.</p>}
              {registryLayers.length > 0 && <LayerPreview layers={registryLayers} testid="bf-registry-preview" />}
              <div className="flex justify-end">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" data-testid="bf-registry-apply" disabled={!registryLayers.length} onClick={applyRegistry}>Replace the stratigraphy</Button>
              </div>
              {state.settings?.registryWellName && <p className="text-xs text-slate-500" data-testid="bf-registry-tied">Tied to {state.settings.registryWellName}.</p>}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedDataImport;
