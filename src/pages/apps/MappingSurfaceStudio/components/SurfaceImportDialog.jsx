// Import a surface grid file into the registry (Mapping MS2,
// 2026-09-05): XYZ points on a regular lattice, CPS-3, ZMAP+ or Irap
// classic, auto-detected. The user names the surface, says what the
// values are (depth, TWT or an attribute), the depth unit and the sign
// convention of the file (detected from the data, overridable), and
// declares the file's CRS (a transformable declaration converts into
// the Project CRS). Parsing is client-side; nothing is written until
// Import. The Seismolord import door's rules, on the shared registry.

import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { parseSurfaceFile, surfaceGridStats } from '@/lib/gridding/surfaceImport';
import { crsDisplayName } from '@/lib/crs';
import {
  planImport, detectSign, IMPORT_DOMAINS, IMPORT_SIGNS, SURFACE_FORMAT_LABELS,
} from '../services/importPlan';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm';

export default function SurfaceImportDialog({
  open, onOpenChange, backend, depthUnit = 'ft', onImported,
}) {
  const fileRef = useRef(null);
  const { crsContext } = useCrsContext();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null); // {g, stats, autoSign}
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('depth');
  const [zUnit, setZUnit] = useState(depthUnit);
  const [zSign, setZSign] = useState('auto');
  const [fileCrs, setFileCrs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setName('');
    setError(null);
    setZSign('auto');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsed(null);
    setFileName(file.name);
    setName(file.name.replace(/\.[^.]+$/, ''));
    try {
      const text = await file.text();
      const g = parseSurfaceFile(text);
      const stats = surfaceGridStats(g);
      if (!stats.live) throw new Error('The grid has no live nodes.');
      setParsed({ g, stats, autoSign: detectSign(g.z) });
    } catch (err) {
      setError(err.message);
    }
  };

  const previewLine = useMemo(() => {
    if (!parsed) return null;
    const { g, stats } = parsed;
    return `${SURFACE_FORMAT_LABELS[g.format] || g.format}: ${g.nx}×${g.ny} nodes, cell ${g.dx.toFixed(1)}×${g.dy.toFixed(1)}, `
      + `${stats.live.toLocaleString()} live, z ${stats.zMin?.toFixed(1)} to ${stats.zMax?.toFixed(1)}`;
  }, [parsed]);

  const projectTag = crsContext?.projectTag || null;
  const customDefs = crsContext?.customDefs || {};

  const doImport = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const plan = planImport({
        g: parsed.g, fileName, name, domain, zUnit, zSign, declaredTag: fileCrs, projectTag, customDefs,
      });
      const saved = await backend.saveSurface({
        name: plan.name, kind: plan.kind, spec: plan.spec, grid: plan.grid,
        zDomain: plan.zDomain, zUnit: plan.zUnit, crs: plan.crs, xyUnit: plan.xyUnit,
        crsProvenance: plan.crsProvenance, provenance: plan.provenance,
      });
      onImported?.(saved, plan);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signHint = parsed ? ` (detected: ${parsed.autoSign === 'negative' ? 'negative down' : 'positive down'})` : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><FileUp className="w-4 h-4 text-cyan-400" /> Import a surface grid</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs text-slate-400">Grid file (XYZ points on a regular grid, CPS-3, ZMAP+, Irap classic)</Label>
            <input ref={fileRef} type="file" data-testid="map-import-file" accept=".xyz,.dat,.txt,.grd,.zmap,.cps3,.irap,.asc"
              className="mt-1 block w-full text-xs text-slate-300 file:mr-2 file:px-2 file:py-1 file:rounded file:border file:border-slate-600 file:bg-slate-800 file:text-slate-200"
              onChange={onFile} />
            {previewLine && <p className="mt-1 text-xs text-slate-400" data-testid="map-import-preview">{previewLine}</p>}
          </div>
          <div>
            <Label className="text-xs text-slate-400">Surface name</Label>
            <Input data-testid="map-import-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-slate-950 border-slate-700" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-400">Values are</span>
              <select className={`${selCls} mt-1`} data-testid="map-import-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
                {IMPORT_DOMAINS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            {domain === 'depth' && (
              <label className="block">
                <span className="text-xs text-slate-400">Depth unit in the file</span>
                <select className={`${selCls} mt-1`} data-testid="map-import-unit" value={zUnit} onChange={(e) => setZUnit(e.target.value)}>
                  <option value="ft">feet</option>
                  <option value="m">metres</option>
                </select>
              </label>
            )}
          </div>
          {domain === 'depth' && (
            <label className="block">
              <span className="text-xs text-slate-400">Sign convention in the file{signHint}</span>
              <select className={`${selCls} mt-1`} data-testid="map-import-sign" value={zSign} onChange={(e) => setZSign(e.target.value)}>
                {IMPORT_SIGNS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <span className="text-[11px] text-slate-500">Stored as elevation (negative below datum) whichever the file uses.</span>
            </label>
          )}
          <div>
            <span className="text-xs text-slate-400">
              File CRS{projectTag ? ` (project: ${crsDisplayName(projectTag, customDefs)}; a different known CRS converts on import)` : ' (no Project CRS set; the surface keeps the declared CRS, or unknown placement)'}
            </span>
            <div className="mt-1" data-testid="map-import-crs">
              <CrsPicker value={fileCrs} onChange={(tag) => setFileCrs(tag)} customDefs={customDefs} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400" data-testid="map-import-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" data-testid="map-import-run" disabled={!parsed || busy} onClick={doImport}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
