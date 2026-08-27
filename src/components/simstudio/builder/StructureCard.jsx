// Structure card (S4): sample a Mapping Studio surface (geo_surfaces)
// into per-cell TOPS for the sim grid, with a depth heatmap preview.
// Uniform mode keeps the S3 constant-depth grid.
import React, { useEffect, useMemo, useState } from 'react';
import { Mountain, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { sampleSurfaceToTops, topsPreviewCells } from '@/utils/simStructureImport';
import { depthColor } from '@/utils/simGridViz';

const StructurePreview = ({ tops, nx, ny }) => {
  const { cells, px, py } = useMemo(() => topsPreviewCells(tops, nx, ny), [tops, nx, ny]);
  const min = Math.min(...tops);
  const max = Math.max(...tops);
  const span = Math.max(1e-9, max - min);
  const size = 7;
  return (
    <svg viewBox={`0 0 ${px * size} ${py * size}`} className="w-full max-w-[280px] rounded border border-slate-700"
      style={{ imageRendering: 'pixelated' }} role="img" aria-label="Structure depth preview">
      {cells.map((c) => (
        <rect key={`${c.i}-${c.j}`} x={c.i * size} y={(py - 1 - c.j) * size} width={size} height={size}
          fill={depthColor((c.depth - min) / span)} />
      ))}
    </svg>
  );
};

const StructureCard = ({ form, set, addNotification }) => {
  const [surfaces, setSurfaces] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const structure = form.structure || { mode: 'uniform' };
  const nx = Math.max(1, Math.round(parseFloat(form.grid.nx) || 1));
  const ny = Math.max(1, Math.round(parseFloat(form.grid.ny) || 1));
  const stale = structure.mode === 'surface' && Array.isArray(structure.tops)
    && structure.tops.length !== nx * ny;

  useEffect(() => {
    if (structure.mode !== 'surface' || surfaces !== null) return;
    listSurfaces()
      .then((rows) => setSurfaces(rows.filter((s) => (s.z_domain || 'depth') === 'depth')))
      .catch((e) => {
        setSurfaces([]);
        addNotification(e.message, 'error');
      });
  }, [structure.mode, surfaces, addNotification]);

  const importSurface = async () => {
    const surface = (surfaces || []).find((s) => s.id === selectedId);
    if (!surface) return;
    setBusy(true);
    try {
      const values = await downloadSurfaceGrid(surface);
      const out = sampleSurfaceToTops(surface, values, { nx, ny });
      set('structure', {
        mode: 'surface',
        surfaceId: surface.id,
        surfaceName: surface.name,
        tops: out.tops,
        dxFt: out.dxFt,
        dyFt: out.dyFt,
        stats: out.stats,
      });
      out.warnings.forEach((w) => addNotification(w, 'info'));
      addNotification(`Structure sampled: ${out.stats.minFt}-${out.stats.maxFt} ft (${out.stats.reliefFt} ft relief)`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mountain className="w-4 h-4 text-slate-400" /> Structure
        </CardTitle>
        <select
          value={structure.mode}
          onChange={(e) => set('structure', e.target.value === 'surface'
            ? { ...structure, mode: 'surface' }
            : { mode: 'uniform', surfaceId: null, surfaceName: '', tops: null, dxFt: null, dyFt: null, stats: null })}
          className="h-7 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs"
          data-testid="structure-mode">
          <option value="uniform">Uniform top depth</option>
          <option value="surface">From Mapping Studio surface</option>
        </select>
      </CardHeader>
      {structure.mode === 'surface' && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-[11px] text-slate-400">Depth surface (geo_surfaces)</Label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs"
                data-testid="structure-surface-select">
                <option value="">{surfaces === null ? 'Loading…' : surfaces.length ? 'Pick a surface…' : 'No depth surfaces yet — map one in Mapping & Surface Studio'}</option>
                {(surfaces || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.nx}×{s.ny}{s.is_own ? '' : ' · shared'})</option>
                ))}
              </select>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedId || busy}
              onClick={importSurface} data-testid="structure-sample">
              {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Sample onto {nx}×{ny}
            </Button>
          </div>
          {stale && (
            <p className="text-[11px] text-amber-400">
              The sampled structure is for a different NX×NY. Sample again after grid changes.
            </p>
          )}
          {Array.isArray(structure.tops) && !stale && (
            <div className="flex gap-4 items-start">
              <StructurePreview tops={structure.tops} nx={nx} ny={ny} />
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="text-slate-300">{structure.surfaceName}</div>
                <div>Top depth {structure.stats.minFt}–{structure.stats.maxFt} ft</div>
                <div>Relief {structure.stats.reliefFt} ft · mean {structure.stats.meanFt} ft</div>
                <div>Cells resized to DX {structure.dxFt} ft × DY {structure.dyFt} ft to cover the surface.</div>
                <div className="text-slate-500">Layer thicknesses stack conformably below the surface. Depths must share the deck datum with wells and contacts.</div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default StructureCard;
