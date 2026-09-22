// Import external interpretation data INTO Seismolord. The file is read
// by CONTENT (any extension, or none): the dialog suggests what it is
// and the user can change it.
//  - HORIZONS: Charisma 3D interpretation lines (every INLINE/XLINE
//    marker form, optional horizon-name column), IESX, EarthVision,
//    CPS-3 points, CPS-3 / ZMAP+ / Irap grids, il/xl/x/y/z, xyz, or any
//    ASCII table through a column mapping. Each horizon lands on the
//    volume lattice and saves as a seismic_horizons row; a file holding
//    several named horizons creates one horizon per name (the user
//    ticks which). TWT only: depth picks would need an inverse velocity
//    model.
//  - FAULT STICKS: Charisma fault sticks (split/joined markers), IESX
//    fault sticks, x y z stick#, or a mapped ASCII table; one
//    seismic_faults row per named fault, stick order preserved.
//  - SURFACES: XYZ on a regular lattice, CPS-3, ZMAP+ or Irap classic,
//    saved to the shared geo_surfaces registry.
// Rows that cannot be read are listed by line and column (RejectReport)
// and the rest imports. Z sign is auto-detected (mostly negative =
// suite negative-down, mostly positive = Petrel positive-down) and can
// be overridden. Parsing is client-side; nothing uploads until Import.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Upload, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { parseSurfaceFile, surfaceGridStats } from '@/lib/gridding/surfaceImport';
import { classifyFile, parseWorkbook } from '@/lib/tabularFile';
import {
  detectHorizonFormat, parseHorizonFile, HORIZON_FORMAT_LABELS,
} from '../../../engine/horizonImport';
import {
  detectFaultFormat, parseFaultSticks, FAULT_FORMAT_LABELS,
} from '../../../engine/faultImport';
import { suggestImportKind } from '../../../engine/importSniff';
import { saveImportedSurface } from '../../../services/surfacesService';
import { saveImportedHorizons, saveImportedFaults } from '../../../services/interpretationImport';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { getTransformer, reprojectSurfaceGrid } from '@/lib/crs';
import { normalizeTag, compareTags } from '@/lib/crs/tags';
import RejectReport from './import/RejectReport';
import ColumnMappingStep, { mappingComplete } from './import/ColumnMappingStep';

const SURFACE_FORMAT_LABELS = {
  xyz: 'XYZ points (regular grid)',
  cps3: 'CPS-3 grid',
  zmap: 'ZMAP+ grid',
  irap: 'Irap classic grid',
};

export const KIND_LABELS = {
  picks: 'Horizon (TWT)',
  faults: 'Fault sticks (TWT)',
  surface: 'Surface (grid)',
};

const READ_AS = {
  picks: ['charisma', 'iesx', 'earthvision', 'cps3points', 'cps3', 'zmap', 'irap', 'ilxlxyz', 'xyz', 'columns'],
  faults: ['charisma', 'iesx', 'xyzn', 'columns'],
  surface: ['xyz', 'cps3', 'zmap', 'irap'],
};
const formatLabel = (kind, f) => (kind === 'surface' ? SURFACE_FORMAT_LABELS[f]
  : kind === 'faults' ? FAULT_FORMAT_LABELS[f] : HORIZON_FORMAT_LABELS[f]) || f;

/** Auto sign: mostly-negative live z = negative-down (suite), else
 *  positive-down (Petrel). */
export const detectSign = (zs) => {
  let neg = 0;
  let pos = 0;
  for (const z of zs) {
    if (Math.abs(z) > 1e29) continue;
    if (z < 0) neg += 1;
    else if (z > 0) pos += 1;
  }
  return neg >= pos ? 'negative' : 'positive';
};

const baseName = (f) => String(f || '').replace(/\.[^.]+$/, '');

/** A workbook's first sheet as tab-separated text for the column reader. */
async function readFileText(file) {
  if (classifyFile(file.name) === 'workbook') {
    const { sheets } = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
    return sheets[0].rows.map((r) => r.join('\t')).join('\n');
  }
  return file.text();
}

/**
 * Parse `text` as `kind`. Returns { preview, error, needsMapping,
 * detected }. Pure apart from the engine readers (exported for tests).
 */
export function readImportFile({
  text, kind, readAs = 'auto', mapping = null, fallbackName = 'Imported',
}) {
  if (!text) return { preview: null };
  try {
    if (kind === 'surface') {
      const g = parseSurfaceFile(text, readAs === 'auto' ? null : readAs);
      const stats = surfaceGridStats(g);
      if (!stats.live) throw new Error('The grid has no live nodes.');
      return { preview: { g, stats, autoSign: detectSign(g.z) }, detected: g.format };
    }
    const detect = kind === 'faults' ? detectFaultFormat : detectHorizonFormat;
    const det = readAs === 'auto' ? detect(text) : { format: readAs };
    if (det.format === 'columns') {
      const suggested = readAs === 'auto' ? det : (() => {
        try { return detect(text); } catch (e) { return {}; }
      })();
      const m = mapping || {
        columns: suggested.suggested || {}, delimiter: suggested.delimiter || 'auto', headerLines: 'auto',
      };
      if (!mappingComplete(m.columns)) {
        return {
          preview: null, needsMapping: true, mapping: m, detected: 'columns',
        };
      }
      const parsed = kind === 'faults'
        ? parseFaultSticks(text, { format: 'columns', mapping: m, fallbackName })
        : parseHorizonFile(text, { format: 'columns', mapping: m, fallbackName });
      return {
        preview: withSign(kind, parsed), needsMapping: true, mapping: m, detected: 'columns',
      };
    }
    const parsed = kind === 'faults'
      ? parseFaultSticks(text, { format: det.format, fallbackName })
      : parseHorizonFile(text, { format: det.format, fallbackName });
    return { preview: withSign(kind, parsed), detected: det.format };
  } catch (err) {
    return { preview: null, error: err.message, rejects: err.rejects, rejectCount: err.rejectCount };
  }
}

function withSign(kind, parsed) {
  if (kind === 'faults') {
    const zs = parsed.faults.flatMap((f) => f.sticks.flat().map((p) => p.z));
    return { ...parsed, zs, autoSign: detectSign(zs) };
  }
  const zs = parsed.kind === 'grid'
    ? Array.from(parsed.grid.z)
    : parsed.horizons.flatMap((h) => h.rows.map((r) => r.z));
  return { ...parsed, zs, autoSign: detectSign(zs) };
}

const zRange = (zs) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of zs) {
    if (Math.abs(z) > 1e29) continue;
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return Number.isFinite(lo) ? `z ${lo.toFixed(1)} to ${hi.toFixed(1)}` : 'no live z';
};

export default function ImportSurfaceDialog({
  open, onOpenChange, volume, manifest, onSurfaceImported, onHorizonImported,
  onFaultsImported, initialKind = null,
}) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [kind, setKind] = useState(initialKind || 'picks');
  const [kindTouched, setKindTouched] = useState(Boolean(initialKind));
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState(null);   // suggestImportKind result
  const [readAs, setReadAs] = useState('auto');
  const [mapping, setMapping] = useState(null);
  const [include, setInclude] = useState(null);          // Set of horizon names, null = all
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('twt');           // surface only: 'twt' | 'depth'
  const [zSign, setZSign] = useState('auto');            // 'auto' | 'negative' | 'positive'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { crsContext } = useCrsContext();
  const [fileCrs, setFileCrs] = useState(null);
  const volumeTag = normalizeTag(volume?.crs);

  // each opening starts from the caller's kind (the Horizons or Faults
  // section icon) or from content sniffing
  useEffect(() => {
    if (!open) return;
    setKind(initialKind || 'picks');
    setKindTouched(Boolean(initialKind));
  }, [open, initialKind]);

  const reset = () => {
    setFileName('');
    setText('');
    setSuggestion(null);
    setReadAs('auto');
    setMapping(null);
    setInclude(null);
    setName('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const read = useMemo(() => readImportFile({
    text, kind, readAs, mapping, fallbackName: baseName(fileName) || 'Imported',
  }), [text, kind, readAs, mapping, fileName]);
  const preview = read.preview;
  const horizonsInFile = kind === 'picks' && preview?.horizons ? preview.horizons : [];
  const multi = horizonsInFile.length > 1;
  const chosen = multi ? horizonsInFile.filter((h) => !include || include.has(h.name)) : horizonsInFile;

  const onPickKind = (k) => {
    setKind(k);
    setKindTouched(true);
    setReadAs('auto');
    setMapping(null);
    setInclude(null);
    setError(null);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setReadAs('auto');
    setMapping(null);
    setInclude(null);
    setFileName(file.name);
    setName(baseName(file.name));
    try {
      const t = await readFileText(file);
      let s = null;
      try { s = suggestImportKind(t); } catch (err) { s = null; }
      setSuggestion(s);
      if (s && !kindTouched) setKind(s.kind);
      setText(t);
    } catch (err) {
      setText('');
      setError(err.message);
    }
  };

  const effSign = zSign === 'auto' ? preview?.autoSign || 'negative' : zSign;
  const sign = effSign === 'negative' ? -1 : 1;

  const declaredTag = fileCrs ? normalizeTag(fileCrs) : volumeTag;
  const needsConvert = fileCrs && compareTags(declaredTag, volumeTag) === 'transformable';
  const convertBlocked = fileCrs && declaredTag !== volumeTag && !needsConvert;

  /** Transform world-space {x, y} rows into the volume frame. */
  const toVolumeFrame = (points) => {
    if (!needsConvert) return points;
    const t = getTransformer(declaredTag, volumeTag, crsContext?.customDefs || {});
    return points.map((p) => (Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { ...p, ...t.forward(p.x, p.y) } : p));
  };

  const reprojectGrid = (g) => {
    const r = reprojectSurfaceGrid({
      spec: { x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny },
      z: g.z,
      fromTag: declaredTag,
      toTag: volumeTag,
      customDefs: crsContext?.customDefs || {},
    });
    return {
      g: {
        ...g, x0: r.spec.x0, y0: r.spec.y0, dx: r.spec.dx, dy: r.spec.dy, nx: r.spec.nx, ny: r.spec.ny, z: r.z,
      },
      coverage: r.coverage,
    };
  };

  const crsSource = fileCrs ? { declared_crs: declaredTag, converted: Boolean(needsConvert) } : {};

  const doImport = async () => {
    if (!preview || !volume) return;
    if (convertBlocked) {
      setError('The file declares a different CRS but the volume has no usable CRS to convert into. Assign the volume CRS first, or import the file as being in the volume frame.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'surface') {
        // storage convention is negative-down: flip a positive-down file
        let g = preview.g;
        const z = new Float32Array(g.z);
        if (effSign === 'positive') {
          for (let i = 0; i < z.length; i++) {
            if (Math.abs(z[i]) < 1e29) z[i] = -z[i];
          }
        }
        g = { ...g, z };
        let reprojected = null;
        if (needsConvert) {
          const r = reprojectGrid(g);
          g = r.g;
          reprojected = { coverage: r.coverage };
        }
        await saveImportedSurface({
          volume,
          name: name || fileName,
          g,
          domain,
          fileName,
          format: preview.g.format,
          stats: preview.stats,
          declaredCrs: fileCrs ? declaredTag : null,
          reprojected,
        });
        toast({
          title: 'Surface imported',
          description: 'Now in the Surfaces section and Mapping & Surface Studio.',
        });
        onSurfaceImported?.();
      } else if (kind === 'faults') {
        const parsed = needsConvert
          ? { ...preview, faults: preview.faults.map((f) => ({ ...f, sticks: f.sticks.map((s) => toVolumeFrame(s)) })) }
          : preview;
        const {
          saved, placed, skipped, droppedSticks,
        } = await saveImportedFaults({
          volume,
          manifest,
          parsed,
          sign,
          singleName: name || null,
          source: {
            file_name: fileName,
            z_sign: effSign === 'negative' ? 'negative_down' : 'positive_down',
            ...crsSource,
          },
        });
        toast({
          title: `${saved.length} fault${saved.length === 1 ? '' : 's'} imported`,
          description: `${placed.toLocaleString()} stick points placed`
            + `${skipped ? `, ${skipped} skipped` : ''}`
            + `${droppedSticks ? `, ${droppedSticks} sticks dropped (fewer than 2 points left)` : ''}`
            + `${preview.rejectCount ? `, ${preview.rejectCount} file lines unreadable` : ''}.`,
        });
        onFaultsImported?.(saved);
      } else {
        let parsed = preview;
        if (needsConvert) {
          parsed = parsed.kind === 'grid'
            ? { ...parsed, grid: reprojectGrid(parsed.grid).g }
            : { ...parsed, horizons: parsed.horizons.map((h) => ({ ...h, rows: toVolumeFrame(h.rows) })) };
        }
        const { saved, landed, failed } = await saveImportedHorizons({
          volume,
          manifest,
          parsed,
          sign,
          include: multi ? chosen.map((h) => h.name) : null,
          singleName: multi ? null : (name || null),
          source: {
            file_name: fileName,
            z_sign: effSign === 'negative' ? 'negative_down' : 'positive_down',
            ...crsSource,
          },
        });
        const placed = landed.reduce((n, h) => n + h.placed, 0);
        const skipped = landed.reduce((n, h) => n + h.skipped, 0);
        toast({
          title: saved.length === 1 ? 'Horizon imported' : `${saved.length} horizons imported`,
          description: `${placed.toLocaleString()} picks placed`
            + `${skipped ? `, ${skipped} skipped` : ''}`
            + `${preview.rejectCount ? `, ${preview.rejectCount} file lines unreadable` : ''}`
            + `${failed.length ? `. Not imported: ${failed.map((f) => `${f.name} (${f.error})`).join('; ')}` : ''}.`,
        });
        onHorizonImported?.(saved);
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
        + `${nSticks} sticks, ${preview.points.toLocaleString()} points, ${zRange(preview.zs)}`;
    }
    if (preview.kind === 'grid') {
      const { grid } = preview;
      return `${HORIZON_FORMAT_LABELS[preview.format]}: ${grid.nx}×${grid.ny} nodes, sampled onto the `
        + `volume lattice, ${zRange(preview.zs)}`;
    }
    return `${HORIZON_FORMAT_LABELS[preview.format] || preview.format}: `
      + `${preview.horizons.length} horizon${preview.horizons.length === 1 ? '' : 's'}, `
      + `${preview.rows.toLocaleString()} points, ${zRange(preview.zs)}`;
  }, [preview, kind]);

  const suggestionDiffers = suggestion && suggestion.kind !== kind;
  const importLabel = kind === 'picks' && multi
    ? `Import ${chosen.length} horizon${chosen.length === 1 ? '' : 's'}` : 'Import';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <FileUp className="w-5 h-5 mr-2 text-cyan-400" />
            Import horizons, faults or surfaces
          </DialogTitle>
        </DialogHeader>

        {!volume && (
          <p className="text-sm text-slate-400">Select a volume in the viewer first.</p>
        )}
        {volume && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">File</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  data-testid="sl-import-file"
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200 file:text-slate-300"
                  onChange={onFile}
                />
              </div>
              <div>
                <Label className="text-slate-300">Import as</Label>
                <select
                  data-testid="sl-import-kind"
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={kind}
                  onChange={(e) => onPickKind(e.target.value)}
                >
                  <option value="picks">{KIND_LABELS.picks}</option>
                  <option value="faults">{KIND_LABELS.faults}</option>
                  <option value="surface">{KIND_LABELS.surface}</option>
                </select>
              </div>
            </div>

            {suggestion && (
              <div className="text-xs text-slate-400" data-testid="sl-import-suggestion">
                {suggestionDiffers ? (
                  <span className="text-amber-300">
                    {`This file looks like ${suggestion.reason}. `}
                    <button
                      type="button"
                      className="underline hover:text-amber-200"
                      onClick={() => onPickKind(suggestion.kind)}
                    >
                      {`Import it as ${KIND_LABELS[suggestion.kind]}`}
                    </button>
                  </span>
                ) : `Read as ${suggestion.reason}.`}
              </div>
            )}

            {text && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300" title="Detected from the content; choose a format to override the detection">
                    Format
                  </Label>
                  <select
                    data-testid="sl-import-readas"
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={readAs}
                    onChange={(e) => { setReadAs(e.target.value); setMapping(null); setInclude(null); }}
                  >
                    <option value="auto">
                      {`Detect${read.detected ? ` (${formatLabel(kind, read.detected)})` : ''}`}
                    </option>
                    {READ_AS[kind].map((f) => <option key={f} value={f}>{formatLabel(kind, f)}</option>)}
                  </select>
                </div>
              </div>
            )}

            {read.needsMapping && (
              <ColumnMappingStep
                text={text}
                kind={kind}
                mapping={read.mapping}
                onChange={(m) => setMapping(m)}
              />
            )}

            {read.error && (
              <div className="flex items-start text-red-400 text-sm" data-testid="sl-import-read-error">
                <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{read.error}
              </div>
            )}
            {!preview && read.rejectCount > 0 && (
              <RejectReport rejects={read.rejects || []} count={read.rejectCount} read={0} />
            )}

            {preview && (
              <>
                <div
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300"
                  data-testid="sl-import-preview"
                >
                  {previewLine}
                </div>
                {kind !== 'surface' && (
                  <RejectReport
                    rejects={preview.rejects || []}
                    count={preview.rejectCount || 0}
                    read={kind === 'faults' ? preview.points : preview.rows}
                  />
                )}
                {multi && (
                  <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/20 p-3 text-sm" data-testid="sl-import-multi">
                    <p className="text-cyan-200">
                      {`This file holds ${horizonsInFile.length} horizons. Each ticked one is imported as its own horizon, named as in the file.`}
                    </p>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                      {horizonsInFile.map((h) => (
                        <label key={h.name} className="flex items-center gap-2 text-slate-300">
                          <input
                            type="checkbox"
                            checked={!include || include.has(h.name)}
                            onChange={(e) => {
                              const next = new Set(include || horizonsInFile.map((x) => x.name));
                              if (e.target.checked) next.add(h.name);
                              else next.delete(h.name);
                              setInclude(next);
                            }}
                          />
                          <span className="truncate">{h.name}</span>
                          <span className="text-slate-500 text-xs">{`${h.rows.length.toLocaleString()} points`}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {kind === 'faults' && preview.faults.length > 1 && (
                  <p className="text-xs text-slate-400">
                    {`${preview.faults.length} faults in the file (${preview.faults.map((f) => f.name).join(', ')}); each is saved as its own fault.`}
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {!multi && !(kind === 'faults' && preview.faults.length > 1) && (
                    <div className={kind === 'surface' ? '' : 'col-span-2'}>
                      <Label className="text-slate-300">Name</Label>
                      <Input
                        value={name}
                        data-testid="sl-import-name"
                        className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}
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
                  <div className="col-span-2 md:col-span-3">
                    <Label className="text-slate-300">File CRS</Label>
                    <div className="mt-1 grid grid-cols-[auto,1fr] items-center gap-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!fileCrs}
                          onChange={(e) => setFileCrs(e.target.checked ? null : (volume?.crs || 'UNKNOWN'))}
                        />
                        Same frame as the volume{volume?.crs ? ` (${volumeTag})` : ''}
                      </label>
                      {fileCrs && (
                        <CrsPicker
                          value={fileCrs}
                          onChange={(tag) => setFileCrs(tag)}
                          customDefs={crsContext?.customDefs || {}}
                        />
                      )}
                    </div>
                    {needsConvert && (
                      <div className="mt-1 text-xs text-cyan-300">
                        The data will be converted from {declaredTag} into the volume frame ({volumeTag}) before it lands.
                      </div>
                    )}
                    {convertBlocked && (
                      <div className="mt-1 text-xs text-amber-300">
                        The volume has no usable CRS to convert into. Assign the volume CRS first, or import the file as being in the volume frame.
                      </div>
                    )}
                  </div>
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
                data-testid="sl-import-go"
                disabled={!preview || busy || (kind !== 'surface' && !manifest) || (multi && !chosen.length)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {busy
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Upload className="w-4 h-4 mr-2" />}
                {importLabel}
              </Button>
              {error && (
                <div className="flex items-start text-red-400 text-sm" data-testid="sl-import-error">
                  <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              {kind === 'surface'
                && 'Any file name or extension: the content decides. XYZ points on a regular '
                  + 'lattice, CPS-3, ZMAP+ or Irap classic. Scattered points are refused here (import them '
                  + 'as a horizon, or grid them first); the surface stores negative-down and lands in the '
                  + 'shared registry.'}
              {kind === 'picks'
                && 'Any file name or extension: the content decides. Charisma 3D interpretation lines, '
                  + 'IESX, EarthVision, CPS-3 points, CPS-3 or ZMAP+ grids, il xl x y z, x y z, or any table '
                  + 'through the column mapping. Points off the lattice or outside the volume time range '
                  + 'are skipped and counted. TWT only; depth picks would need an inverse velocity model.'}
              {kind === 'faults'
                && 'Any file name or extension: the content decides. Charisma fault sticks, IESX fault '
                  + 'sticks, x y z stick number, or any table through the column mapping. Each named fault '
                  + 'saves as its own fault; stick order is preserved. Points off the survey or outside the '
                  + 'time range are skipped; sticks left with fewer than 2 points are dropped. TWT only.'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
