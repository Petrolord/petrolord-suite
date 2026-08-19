// Import external interpretation data INTO Seismolord:
//  - a SURFACE grid file (XYZ points on a regular lattice, CPS-3,
//    ZMAP+ or Irap classic — auto-detected) becomes a first-class
//    registry surface (geo_surfaces) tied to the active volume;
//  - a HORIZON PICKS file (Charisma 3D, five-column il/xl/x/y/z or
//    bare xyz — auto-detected) lands on the volume lattice and saves
//    as a seismic_horizons row, editable and mappable like any tracked
//    horizon. Picks import is TWT-only: depth picks would need an
//    inverse velocity model;
//  - a FAULT STICKS file (Charisma fault sticks or x/y/z/stick# rows —
//    auto-detected) lands as one seismic_faults row per named fault,
//    stick order preserved (the barrier/ribbon invariant). TWT-only,
//    like picks.
// Z sign is auto-detected from the data (mostly-negative = suite
// negative-down, mostly-positive = Petrel positive-down) and can be
// overridden. Parsing is all client-side (engine parsers); nothing
// uploads until Import is pressed.

import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Upload, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { parseSurfaceFile, surfaceGridStats } from '@/lib/gridding/surfaceImport';
import { parsePickFile, rowsToPickLattice } from '../../../engine/pickImport';
import { parseFaultStickFile, faultSticksToLattice } from '../../../engine/faultImport';
import { surveyAffine } from '../../../engine/surveyGeometry';
import { geomFromManifest } from '../../../engine/sliceAssembly';
import { saveImportedSurface } from '../../../services/surfacesService';
import { saveHorizon } from '../../../services/horizonsService';
import { saveFault } from '../../../services/faultsService';

const NULL_F32 = Math.fround(1.0e30);

const SURFACE_FORMAT_LABELS = {
  xyz: 'XYZ points (regular grid)',
  cps3: 'CPS-3 grid',
  zmap: 'ZMAP+ grid',
  irap: 'Irap classic grid',
};
const PICK_FORMAT_LABELS = {
  charisma: 'Charisma 3D horizon',
  ilxlxyz: 'IL/XL/X/Y/Z points',
  xyz: 'XYZ points',
};
const FAULT_FORMAT_LABELS = {
  charisma: 'Charisma fault sticks',
  xyzn: 'X/Y/Z + stick number',
};

/** Auto sign: mostly-negative live z = negative-down (suite), else
 *  positive-down (Petrel). */
const detectSign = (zs) => {
  let neg = 0;
  let pos = 0;
  for (const z of zs) {
    if (Math.abs(z) > 1e29) continue;
    if (z < 0) neg += 1;
    else if (z > 0) pos += 1;
  }
  return neg >= pos ? 'negative' : 'positive';
};

export default function ImportSurfaceDialog({
  open, onOpenChange, volume, manifest, onSurfaceImported, onHorizonImported,
  onFaultsImported,
}) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [kind, setKind] = useState('surface');   // 'surface' | 'picks' | 'faults'
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);  // parsed file, kind-shaped
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('twt');   // surface only: 'twt' | 'depth'
  const [zSign, setZSign] = useState('auto');    // 'auto' | 'negative' | 'positive'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setFileName('');
    setPreview(null);
    setName('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPickKind = (k) => {
    setKind(k);
    reset();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setFileName(file.name);
    setName(file.name.replace(/\.[^.]+$/, ''));
    try {
      const text = await file.text();
      if (kind === 'surface') {
        const g = parseSurfaceFile(text);
        const stats = surfaceGridStats(g);
        if (!stats.live) throw new Error('The grid has no live nodes.');
        setPreview({ g, stats, autoSign: detectSign(g.z) });
      } else if (kind === 'faults') {
        const { format, faults, points } = parseFaultStickFile(
          text, null, file.name.replace(/\.[^.]+$/, ''),
        );
        const zs = faults.flatMap((f) => f.sticks.flat().map((p) => p.z));
        setPreview({ format, faults, points, zs, autoSign: detectSign(zs) });
      } else {
        const { format, rows } = parsePickFile(text);
        setPreview({ format, rows, autoSign: detectSign(rows.map((r) => r.z)) });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const effSign = zSign === 'auto' ? preview?.autoSign || 'negative' : zSign;

  const doImport = async () => {
    if (!preview || !volume) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'surface') {
        // storage convention is negative-down: flip a positive-down file
        const g = preview.g;
        const z = new Float32Array(g.z);
        if (effSign === 'positive') {
          for (let i = 0; i < z.length; i++) {
            if (Math.abs(z[i]) < 1e29) z[i] = -z[i];
          }
        }
        await saveImportedSurface({
          volume,
          name: name || fileName,
          g: { ...g, z },
          domain,
          fileName,
          format: preview.g.format,
          stats: preview.stats,
        });
        toast({
          title: 'Surface imported',
          description: 'Now in the Surfaces section and Mapping & Surface Studio.',
        });
        onSurfaceImported?.();
      } else if (kind === 'faults') {
        const geom = geomFromManifest(manifest);
        const affine = surveyAffine(manifest.geometry);
        const geo = manifest.geometry;
        const dtMs = geo.dt_us / 1000;
        const lines = {
          il0: geo.il.min, ilStep: geo.il.step, xl0: geo.xl.min, xlStep: geo.xl.step,
        };
        const sign = effSign === 'negative' ? -1 : 1;
        const { faults, placed, skipped, droppedSticks } = faultSticksToLattice(
          preview.faults, geom, lines, affine, (z) => (sign * z) / dtMs,
        );
        const source = {
          file_name: fileName,
          format: preview.format,
          rows: preview.points,
          placed,
          skipped,
          dropped_sticks: droppedSticks,
          z_sign: effSign === 'negative' ? 'negative_down' : 'positive_down',
        };
        // a single-fault file takes the editable dialog name; multi-fault
        // files keep each fault's own file name
        const saved = [];
        for (const f of faults) {
          // eslint-disable-next-line no-await-in-loop
          saved.push(await saveFault({
            volumeId: volume.id,
            name: faults.length === 1 ? (name || f.name) : f.name,
            sticks: f.sticks,
            params: { mode: 'imported', source },
          }));
        }
        toast({
          title: `${faults.length} fault${faults.length === 1 ? '' : 's'} imported`,
          description: `${placed.toLocaleString()} stick points placed`
            + `${skipped ? `, ${skipped} skipped` : ''}`
            + `${droppedSticks ? `, ${droppedSticks} sticks dropped (fewer than 2 points left)` : ''}.`,
        });
        onFaultsImported?.(saved);
      } else {
        const geom = geomFromManifest(manifest);
        const affine = surveyAffine(manifest.geometry);
        const geo = manifest.geometry;
        const dtMs = geo.dt_us / 1000;
        const lines = {
          il0: geo.il.min, ilStep: geo.il.step, xl0: geo.xl.min, xlStep: geo.xl.step,
        };
        const sign = effSign === 'negative' ? -1 : 1;
        const { picks, placed, skipped, collisions } = rowsToPickLattice(
          preview.rows, geom, lines, affine, (z) => (sign * z) / dtMs,
        );
        const seedCell = picks.findIndex((v) => v !== NULL_F32);
        const seed = {
          ilIdx: Math.floor(seedCell / geom.nXl),
          xlIdx: seedCell % geom.nXl,
          sample: picks[seedCell],
        };
        await saveHorizon({
          volume,
          name: name || fileName,
          picks,
          seed,
          params: {
            mode: 'imported',
            source: {
              file_name: fileName,
              format: preview.format,
              rows: preview.rows.length,
              placed,
              skipped,
              collisions,
              z_sign: effSign === 'negative' ? 'negative_down' : 'positive_down',
            },
          },
          dtUs: geo.dt_us,
        });
        toast({
          title: 'Horizon picks imported',
          description: `${placed.toLocaleString()} picks placed`
            + `${skipped ? `, ${skipped} skipped` : ''}`
            + `${collisions ? `, ${collisions} collisions (last wins)` : ''}.`,
        });
        onHorizonImported?.();
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const previewLine = useMemo(() => {
    if (!preview) return null;
    if (kind === 'surface') {
      const { g, stats } = preview;
      return `${SURFACE_FORMAT_LABELS[g.format] || g.format}: ${g.nx}×${g.ny} nodes, `
        + `cell ${g.dx.toFixed(1)}×${g.dy.toFixed(1)} m, ${stats.live.toLocaleString()} live, `
        + `z ${stats.zMin?.toFixed(1)} to ${stats.zMax?.toFixed(1)}`;
    }
    if (kind === 'faults') {
      const nSticks = preview.faults.reduce((n, f) => n + f.sticks.length, 0);
      return `${FAULT_FORMAT_LABELS[preview.format] || preview.format}: `
        + `${preview.faults.length} fault${preview.faults.length === 1 ? '' : 's'}, `
        + `${nSticks} sticks, ${preview.points.toLocaleString()} points, `
        + `z ${Math.min(...preview.zs).toFixed(1)} to ${Math.max(...preview.zs).toFixed(1)}`;
    }
    const zs = preview.rows.map((r) => r.z);
    return `${PICK_FORMAT_LABELS[preview.format] || preview.format}: `
      + `${preview.rows.length.toLocaleString()} rows, `
      + `z ${Math.min(...zs).toFixed(1)} to ${Math.max(...zs).toFixed(1)}`;
  }, [preview, kind]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <FileUp className="w-5 h-5 mr-2 text-cyan-400" />
            Import surface, picks or faults
          </DialogTitle>
        </DialogHeader>

        {!volume && (
          <p className="text-sm text-slate-400">Select a volume in the viewer first.</p>
        )}
        {volume && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">Import as</Label>
                <select
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={kind}
                  onChange={(e) => onPickKind(e.target.value)}
                >
                  <option value="surface">Surface (grid)</option>
                  <option value="picks">Horizon picks (TWT)</option>
                  <option value="faults">Fault sticks (TWT)</option>
                </select>
              </div>
              <div>
                <Label className="text-slate-300">File</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xyz,.dat,.txt,.grd,.irap,.asc,.chr,.flt,.pl"
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200 file:text-slate-300"
                  onChange={onFile}
                />
              </div>
            </div>

            {preview && (
              <>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                  {previewLine}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className={kind === 'surface' ? '' : 'col-span-2'}>
                    <Label className="text-slate-300">Name</Label>
                    <Input
                      value={name}
                      className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  {kind === 'surface' && (
                    <div>
                      <Label className="text-slate-300">Domain</Label>
                      <select
                        className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                      >
                        <option value="twt">TWT (ms)</option>
                        <option value="depth">Depth (ft)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <Label
                      className="text-slate-300"
                      title="Petrolord stores Z negative downward; Petrel files usually carry positive-down values"
                    >
                      Z sign
                    </Label>
                    <select
                      className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                      value={zSign}
                      onChange={(e) => setZSign(e.target.value)}
                    >
                      <option value="auto">
                        {`Auto (${preview.autoSign === 'negative'
                          ? 'negative down' : 'positive down'})`}
                      </option>
                      <option value="negative">Negative down (suite)</option>
                      <option value="positive">Positive down (Petrel)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={doImport}
                disabled={!preview || busy || (kind !== 'surface' && !manifest)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {busy
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Upload className="w-4 h-4 mr-2" />}
                Import
              </Button>
              {error && (
                <div className="flex items-start text-red-400 text-sm">
                  <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              {kind === 'surface'
                && 'Formats auto-detect: XYZ points on a regular lattice, CPS-3, ZMAP+ '
                  + 'or Irap classic. Scattered points are refused (grid them first); '
                  + 'the surface stores negative-down and lands in the shared registry.'}
              {kind === 'picks'
                && 'Formats auto-detect: Charisma 3D horizon, five-column il xl x y z, '
                  + 'or bare x y z (located through the survey geometry). Rows off the '
                  + 'lattice or outside the volume time range are skipped and counted. '
                  + 'TWT only; depth picks would need an inverse velocity model.'}
              {kind === 'faults'
                && 'Formats auto-detect: Charisma fault sticks (one row per point, '
                  + 'named faults) or x y z stick number. Each named fault saves as '
                  + 'its own fault; stick order is preserved. Points off the survey '
                  + 'or outside the time range are skipped; sticks left with fewer '
                  + 'than 2 points are dropped. TWT only.'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
