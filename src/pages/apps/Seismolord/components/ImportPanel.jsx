import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle, Play, Ban,
  RotateCcw, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { MAPPING_PRESETS, DEFAULT_MAPPING } from '../engine/segyScan';
import { crsHintsFromText } from '../engine/crsHint';
import { scanFile, ingestVolume } from '../services/ingestService';
import { listVolumes, deleteVolume } from '../services/volumesService';
import CrsPicker from '@/components/crs/CrsPicker';
import CrsBadge from '@/components/crs/CrsBadge';
import { sanityCheck, crsDisplayName } from '@/lib/crs';
import { getProjectCrs, addCustomDef } from '@/lib/crs/settingsService';
import { isTransformableTag, normalizeTag, UNKNOWN } from '@/lib/crs/tags';

const fmtInt = (v) => (v == null ? '—' : v.toLocaleString('en-US'));

const PHASE_LABEL = {
  scan: 'Scanning trace headers',
  transcode: 'Transcoding to bricks',
  upload: 'Uploading bricks',
};

/**
 * @param {Object} p
 * @param {(row: Object) => void} [p.onIngested] fired when a volume lands
 * @param {(busy: boolean) => void} [p.onBusyChange] true while an ingest
 *   is running — a hosting dialog uses it to block closing mid-import
 * @param {boolean} [p.frameless] render without the Card chrome (dialogs)
 */
export default function ImportPanel({ onIngested, onBusyChange, frameless }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const cancelRef = useRef(null);
  const scanSeqRef = useRef(0);      // last-wins guard for mapping-edit scans
  const resumeFileRef = useRef(null);
  const resumeRowRef = useRef(null); // row whose Resume opened the picker

  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({ ilByte: DEFAULT_MAPPING.ilByte, xlByte: DEFAULT_MAPPING.xlByte });
  const [showBytes, setShowBytes] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle|scanning|scanned|ingesting|done|error
  const [scanData, setScanData] = useState(null);
  const [showHeader, setShowHeader] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  // CRS step: the user's declaration for THIS file, the Project CRS it
  // will be stored in, and the plausibility verdict on the scanned
  // coordinates. crsPrefilled guards the one-time prefill per file.
  const [crsTag, setCrsTag] = useState(null);
  const [project, setProject] = useState(null);
  const [sanity, setSanity] = useState(null);
  const [sanityOverride, setSanityOverride] = useState(false);
  const crsPrefilledRef = useRef(false);
  const [interrupted, setInterrupted] = useState([]); // status 'ingesting' rows
  const [resuming, setResuming] = useState(null);     // row being resumed
  const [discardingId, setDiscardingId] = useState(null);

  const runScan = async (f, m) => {
    // rapid mapping edits fire overlapping scans; only the LATEST result
    // may land — a slower earlier scan finishing last must not overwrite
    // the preview with geometry measured under stale byte positions (ML2)
    const seq = ++scanSeqRef.current;
    setPhase('scanning');
    setError(null);
    setScanData(null);
    try {
      const data = await scanFile(f, m);
      if (seq !== scanSeqRef.current) return;
      setScanData(data);
      setPhase('scanned');
    } catch (e) {
      if (seq !== scanSeqRef.current) return;
      setError(e.message);
      setPhase('error');
    }
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setCrsTag(null);
    setSanityOverride(false);
    crsPrefilledRef.current = false;
    runScan(f, mapping);
  };

  const onMappingChange = (next) => {
    const m = { ...mapping, ...next };
    setMapping(m);
    if (file) runScan(file, m);
  };

  const startIngest = async () => {
    setPhase('ingesting');
    setError(null);
    setProgress(null);
    const cancelToken = {};
    cancelRef.current = cancelToken;
    try {
      const { row } = await ingestVolume({
        file,
        mapping,
        nativeCrs: crsTag,
        onProgress: (p) => setProgress(p),
        cancelToken,
      });
      setPhase('done');
      toast({ title: 'Volume ingested', description: `${row.name} is ready.` });
      if (onIngested) onIngested(row);
    } catch (e) {
      setError(e.message);
      setPhase('error');
    } finally {
      cancelRef.current = null;
    }
  };

  const scan = scanData?.scan;

  useEffect(() => {
    if (onBusyChange) onBusyChange(phase === 'ingesting');
  }, [phase, onBusyChange]);

  // Project CRS context for the CRS step (refreshes after each run in
  // case the first import just defined it).
  useEffect(() => {
    if (phase === 'ingesting') return;
    let stale = false;
    getProjectCrs()
      .then((p) => { if (!stale) setProject(p); })
      .catch(() => {});
    return () => { stale = true; };
  }, [phase]);

  const crsHints = useMemo(
    () => (scanData?.textLines ? crsHintsFromText(scanData.textLines) : { suggestions: [], unitHints: [] }),
    [scanData],
  );

  // One-time prefill per file: the Project CRS when set, else the
  // strongest header hint. Never overwrites a user choice.
  useEffect(() => {
    if (!scan || crsPrefilledRef.current) return;
    crsPrefilledRef.current = true;
    if (project?.tag && isTransformableTag(project.tag)) setCrsTag(project.tag);
    else if (crsHints.suggestions[0]?.code) setCrsTag(crsHints.suggestions[0].code);
  }, [scan, project, crsHints]);

  // Plausibility of the scanned coordinates under the declared CRS.
  useEffect(() => {
    if (!scan || !crsTag || !isTransformableTag(crsTag)) { setSanity(null); return; }
    const samples = [
      scan.corners?.first, scan.corners?.last,
      ...(scanData?.preview || []).map((r) => ({ x: r.x, y: r.y })),
    ].filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    try {
      setSanity(sanityCheck(crsTag, samples, project?.customDefs || {}));
    } catch {
      setSanity(null);
    }
  }, [scan, scanData, crsTag, project]);

  const onCrsPick = async (tag, meta) => {
    setSanityOverride(false);
    if (meta?.customDef) {
      try {
        const customTag = await addCustomDef(meta.customDef);
        setCrsTag(customTag);
        const p = await getProjectCrs();
        setProject(p);
      } catch (e) {
        toast({ title: 'Custom CRS not saved', description: e.message, variant: 'destructive' });
      }
    } else {
      setCrsTag(tag);
    }
  };

  const crsChosen = Boolean(crsTag);
  const sanityBlocks = Boolean(sanity && !sanity.ok && sanity.verdict === 'out-of-area' && !sanityOverride);
  const projectSet = Boolean(project?.tag && isTransformableTag(project.tag));
  const willConvert = projectSet && crsTag && isTransformableTag(crsTag)
    && normalizeTag(crsTag) !== normalizeTag(project.tag);

  // Interrupted imports ('ingesting' rows): loaded on mount and after
  // every run ends — a failed/cancelled ingest becomes resumable right
  // away, and a successful resume drops off the list.
  useEffect(() => {
    if (phase === 'ingesting' || phase === 'scanning') return;
    let stale = false;
    listVolumes()
      .then((vs) => {
        // derived (attribute) jobs are recomputed, never file-resumed
        if (!stale) {
          setInterrupted(vs.filter((v) => v.status === 'ingesting' && v.kind !== 'attribute'));
        }
      })
      .catch(() => {});   // the list is a convenience — never block importing on it
    return () => { stale = true; };
  }, [phase]);

  /** Resume drives the same pipeline as a fresh import; the service
   *  verifies the picked file's fingerprint against the row identity
   *  and reruns the transcode under the ORIGINAL header mapping,
   *  skipping bricks that already uploaded. */
  const startResume = async (row, f) => {
    setPhase('ingesting');
    setError(null);
    setProgress(null);
    setResuming(row);
    const cancelToken = {};
    cancelRef.current = cancelToken;
    try {
      const { row: updated } = await ingestVolume({
        file: f,
        resumeVolumeId: row.id,
        onProgress: (p) => setProgress(p),
        cancelToken,
      });
      setPhase('done');
      toast({ title: 'Import resumed and completed', description: `${updated.name} is ready.` });
      if (onIngested) onIngested(updated);
    } catch (e) {
      setError(e.message);
      setPhase('error');
    } finally {
      cancelRef.current = null;
      setResuming(null);
    }
  };

  const onResumePick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';               // same file may be picked again later
    const row = resumeRowRef.current;
    resumeRowRef.current = null;
    if (f && row) startResume(row, f);
  };

  const discardInterrupted = async (row) => {
    if (!window.confirm(`Discard the interrupted import "${row.name}" and delete its partial data?`)) return;
    setDiscardingId(row.id);
    try {
      await deleteVolume(row);
      setInterrupted((list) => list.filter((v) => v.id !== row.id));
      toast({ title: 'Interrupted import discarded', description: row.name });
    } catch (e) {
      toast({ title: 'Discard failed', description: e.message, variant: 'destructive' });
    } finally {
      setDiscardingId(null);
    }
  };

  const inner = (
    <div className="space-y-4">
        {interrupted.length > 0 && phase !== 'ingesting' && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 space-y-2">
            <div className="flex items-center text-sm text-amber-300">
              <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
              Interrupted imports — resume with the ORIGINAL file (verified
              by fingerprint), or discard the partial data.
            </div>
            {interrupted.map((v) => {
              const rec = v.survey_meta?.ingest;
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-white">{v.name}</span>
                  <span className="text-slate-500">
                    {rec
                      ? `${rec.file_name} · ${(rec.file_size / (1024 * 1024)).toFixed(1)} MB`
                      : 'source file unknown (predates resume support)'}
                  </span>
                  <Button
                    size="sm" variant="outline"
                    disabled={!rec?.fingerprint || discardingId === v.id}
                    title={rec?.fingerprint
                      ? 'Pick the original SEG-Y file to continue where the import stopped'
                      : 'No identity record to verify against — discard and import again'}
                    onClick={() => {
                      resumeRowRef.current = v;
                      resumeFileRef.current?.click();
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Resume
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-red-400 hover:text-red-300"
                    disabled={discardingId === v.id}
                    title="Delete the row and its partial bricks"
                    onClick={() => discardInterrupted(v)}
                  >
                    {discardingId === v.id
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                    Discard
                  </Button>
                </div>
              );
            })}
            <input
              ref={resumeFileRef}
              type="file"
              accept=".sgy,.segy,.SGY,.SEGY"
              className="hidden"
              onChange={onResumePick}
            />
          </div>
        )}

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".sgy,.segy,.SGY,.SEGY"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={phase === 'ingesting' || phase === 'scanning'}
          >
            <FileText className="w-4 h-4 mr-2" />
            {file ? file.name : 'Choose SEG-Y file'}
          </Button>
          {file && (
            <span className="ml-3 text-sm text-slate-400">
              {(file.size / (1024 * 1024)).toFixed(1)} MB — processed in windows, never fully loaded
            </span>
          )}
        </div>

        {phase === 'scanning' && (
          <div className="flex items-center text-slate-300">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Scanning headers…
          </div>
        )}

        {scan && (
          <>
            {/* Header mapping — the textual header lies; geometry is measured */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-slate-300">Header layout preset</Label>
                <select
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={`${mapping.ilByte}/${mapping.xlByte}`}
                  onChange={(e) => {
                    const preset = MAPPING_PRESETS.find(
                      (p) => `${p.ilByte}/${p.xlByte}` === e.target.value);
                    if (preset) onMappingChange({ ilByte: preset.ilByte, xlByte: preset.xlByte });
                  }}
                  disabled={phase === 'ingesting'}
                >
                  {MAPPING_PRESETS.map((p) => (
                    <option key={p.label} value={`${p.ilByte}/${p.xlByte}`}>{p.label}</option>
                  ))}
                  {!MAPPING_PRESETS.some((p) => p.ilByte === mapping.ilByte && p.xlByte === mapping.xlByte) && (
                    <option value={`${mapping.ilByte}/${mapping.xlByte}`}>
                      Custom ({mapping.ilByte}/{mapping.xlByte})
                    </option>
                  )}
                </select>
              </div>
              <div>
                <Label className="text-slate-300">Inline byte</Label>
                <Input
                  type="number" min="1" max="237" value={mapping.ilByte}
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => onMappingChange({ ilByte: Number(e.target.value) })}
                  disabled={phase === 'ingesting'}
                />
              </div>
              <div>
                <Label className="text-slate-300">Crossline byte</Label>
                <Input
                  type="number" min="1" max="237" value={mapping.xlByte}
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => onMappingChange({ xlByte: Number(e.target.value) })}
                  disabled={phase === 'ingesting'}
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                className="text-sm text-cyan-400 hover:underline"
                onClick={() => setShowBytes((s) => !s)}
              >
                {showBytes ? 'Hide' : 'Show'} coordinate byte positions (X, Y, scalar)
              </button>
              {showBytes && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-slate-300">X byte</Label>
                    <Input
                      type="number" min="1" max="237"
                      value={mapping.xByte ?? DEFAULT_MAPPING.xByte}
                      className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                      onChange={(e) => onMappingChange({ xByte: Number(e.target.value) })}
                      disabled={phase === 'ingesting'}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Y byte</Label>
                    <Input
                      type="number" min="1" max="237"
                      value={mapping.yByte ?? DEFAULT_MAPPING.yByte}
                      className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                      onChange={(e) => onMappingChange({ yByte: Number(e.target.value) })}
                      disabled={phase === 'ingesting'}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Scalar byte</Label>
                    <Input
                      type="number" min="1" max="239"
                      value={mapping.scalarByte ?? DEFAULT_MAPPING.scalarByte}
                      className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                      onChange={(e) => onMappingChange({ scalarByte: Number(e.target.value) })}
                      disabled={phase === 'ingesting'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Measured geometry */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300 grid grid-cols-2 md:grid-cols-4 gap-y-2">
              <div>Format: <span className="text-white">{scan.formatCode === 1 ? 'IBM float' : 'IEEE float'}</span></div>
              <div>Traces: <span className="text-white">{fmtInt(scan.totalTraces)}</span></div>
              <div>Samples: <span className="text-white">{fmtInt(scan.ns)}</span> @ {scan.dtUs / 1000} ms</div>
              <div>Scalar: <span className="text-white">{scan.coordScalar}</span></div>
              <div>Inlines: <span className="text-white">{scan.il.min}–{scan.il.max}</span> (step {scan.il.step})</div>
              <div>Crosslines: <span className="text-white">{scan.xl.min}–{scan.xl.max}</span> (step {scan.xl.step})</div>
              <div className="col-span-2">
                First CDP: <span className="text-white">
                  {scan.corners.first ? `${scan.corners.first.x}, ${scan.corners.first.y}` : '—'}
                </span>
              </div>
              {scan.sourceCoords && (
                <div className="col-span-2">
                  First source XY: <span className="text-white">
                    {scan.sourceCoords.x}, {scan.sourceCoords.y}
                  </span>
                  <span className="text-slate-500"> (bytes 73/77 cross-check)</span>
                </div>
              )}
              <div className="col-span-2">
                Header units words: <span className="text-white">
                  {scan.coordUnits === 1 ? 'length' : scan.coordUnits === 2 ? 'arc-seconds' : 'unstated'}
                </span>
                <span className="text-slate-500"> (byte 89)</span>
                {', '}
                <span className="text-white">
                  {scan.measurementSystem === 1 ? 'metres' : scan.measurementSystem === 2 ? 'feet' : 'unstated'}
                </span>
                <span className="text-slate-500"> (binary header)</span>
              </div>
              {scan.scalarStats?.varied && (
                <div className="col-span-2">
                  Scalars seen: <span className="text-white">{scan.scalarStats.distinct.join(', ')}</span>
                </div>
              )}
              {scan.sampled && (
                <div className="col-span-full text-slate-400">
                  Preview from sampled headers — every trace is validated during import.
                </div>
              )}
            </div>

            {/* CRS assignment: the Petrel step. Nothing imports without an
                explicit declaration; hints prefill, never commit. */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-200">Coordinate reference system of this file</Label>
                <CrsBadge tag={crsTag} name={crsTag ? crsDisplayName(crsTag, project?.customDefs || {}) : null} />
              </div>
              <CrsPicker
                value={crsTag}
                onChange={onCrsPick}
                customDefs={project?.customDefs || {}}
                suggestions={crsHints.suggestions}
                disabled={phase === 'ingesting'}
              />
              {crsHints.unitHints.length > 0 && (
                <div className="text-xs text-slate-500">
                  Header mentions units: {crsHints.unitHints.map((u) => `${u.unit} ("${u.match}")`).join(', ')}
                </div>
              )}
              <div className="text-sm text-slate-400">
                {projectSet ? (
                  <>
                    Stored in the Project CRS <CrsBadge tag={project.tag} name={project.name} className="mx-1" />
                    {willConvert
                      ? 'The survey placement will be converted at import. Traces are never resampled.'
                      : crsTag && normalizeTag(crsTag) === UNKNOWN
                        ? 'This volume will carry an unverified placement until a CRS is assigned.'
                        : 'No conversion needed.'}
                  </>
                ) : (
                  crsTag && isTransformableTag(crsTag)
                    ? 'No Project CRS is set yet. This first import will define it, like the first dataset in a new Petrel project.'
                    : 'No Project CRS is set yet.'
                )}
              </div>
              {sanity && sanity.ok && (
                <div className="flex items-center text-sm text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Scanned coordinates are plausible for this system.
                </div>
              )}
              {sanity && !sanity.ok && sanity.verdict === 'out-of-area' && (
                <div className="rounded-lg border border-red-700/50 bg-red-950/20 p-3 text-sm text-red-300 space-y-2">
                  <div className="flex items-start">
                    <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <div>
                      The scanned coordinates fall outside this system's area of use.
                      {sanity.suggestion === 'unit-feet'
                        && ' They read like feet values for a metric system. Check the scalar byte or pick the feet variant of this CRS.'}
                      {sanity.suggestion === 'unit-metres'
                        && ' They read like metre values for a feet-based system.'}
                      {sanity.suggestion === 'axes-swapped'
                        && ' X and Y look swapped. Check the X and Y byte positions.'}
                      {!sanity.suggestion
                        && ' Check the CRS choice and the X, Y and scalar byte positions.'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={sanityOverride}
                      onChange={(e) => setSanityOverride(e.target.checked)}
                    />
                    Import as declared anyway. I have verified the coordinates myself.
                  </label>
                </div>
              )}
            </div>

            {scan.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-300 space-y-1">
                {scan.warnings.map((w) => (
                  <div key={w} className="flex items-start">
                    <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{w}
                  </div>
                ))}
              </div>
            )}

            {/* Preview table under current mapping */}
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Trace</th>
                    <th className="px-3 py-1.5 text-left">Inline</th>
                    <th className="px-3 py-1.5 text-left">Crossline</th>
                    <th className="px-3 py-1.5 text-left">X</th>
                    <th className="px-3 py-1.5 text-left">Y</th>
                  </tr>
                </thead>
                <tbody>
                  {scanData.preview.map((r) => (
                    <tr key={r.trace} className="border-t border-slate-800">
                      <td className="px-3 py-1">{fmtInt(r.trace)}</td>
                      <td className="px-3 py-1 text-white">{r.il}</td>
                      <td className="px-3 py-1 text-white">{r.xl}</td>
                      <td className="px-3 py-1">{r.x}</td>
                      <td className="px-3 py-1">{r.y}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <button
                type="button"
                className="text-sm text-cyan-400 hover:underline"
                onClick={() => setShowHeader((s) => !s)}
              >
                {showHeader ? 'Hide' : 'Show'} textual header (display only — it may lie)
              </button>
              {showHeader && (
                <pre className="mt-2 bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 overflow-x-auto">
                  {scanData.textLines.join('\n')}
                </pre>
              )}
            </div>
          </>
        )}

        {phase === 'ingesting' && resuming && (
          <div className="text-sm text-slate-400">
            Resuming “{resuming.name}” — the file is re-verified and
            re-transcoded under the original mapping; bricks that already
            uploaded are skipped, so only the missing remainder transfers.
          </div>
        )}
        {phase === 'ingesting' && progress && (
          <div className="space-y-2">
            <div className="flex items-center text-slate-300 text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {PHASE_LABEL[progress.phase] || progress.phase}
              {' — '}
              {fmtInt(progress.done)}{progress.total ? ` / ${fmtInt(progress.total)}` : ''}
            </div>
            {progress.total && (
              <div className="h-2 rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="flex items-center text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Volume ingested and registered.
          </div>
        )}
        {error && (
          <div className="flex items-start text-red-400 text-sm">
            <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={startIngest}
            disabled={!scan || phase === 'ingesting' || phase === 'scanning' || !crsChosen || sanityBlocks}
            title={!scan ? undefined
              : !crsChosen ? 'Choose the coordinate reference system of this file first'
                : sanityBlocks ? 'The coordinates are implausible for the chosen CRS. Fix the choice or confirm the override.'
                  : undefined}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Play className="w-4 h-4 mr-2" />
            Start import
          </Button>
          {phase === 'ingesting' && (
            <Button
              variant="outline"
              onClick={() => { if (cancelRef.current) cancelRef.current.cancelled = true; }}
            >
              <Ban className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
    </div>
  );

  if (frameless) return inner;
  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Upload className="w-5 h-5 mr-2 text-cyan-400" />
          Import SEG-Y volume
        </CardTitle>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
