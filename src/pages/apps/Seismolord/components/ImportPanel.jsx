import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle, Play, Ban,
  RotateCcw, Trash2, Eye, Server, Pause, Link2,
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
import { publishConversionProgress, clearConversionProgress } from '../sources/conversionProgress';
import { getImportJobs, v4ImportSupport, V4_STATUS } from '../services/importJobsRuntime';
import {
  serverImportAdvice, startServerImport, fetchFromLink, scanRemoteFile, startRemoteConversion,
} from '../services/serverImport';
import CrsPicker from '@/components/crs/CrsPicker';
import StorageMeter from './StorageMeter';
import CrsBadge from '@/components/crs/CrsBadge';
import { sanityCheck, crsDisplayName } from '@/lib/crs';
import { getProjectCrs, addCustomDef } from '@/lib/crs/settingsService';
import { isTransformableTag, normalizeTag, UNKNOWN } from '@/lib/crs/tags';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { COORD_UNITS, SAMPLE_FORMATS, needsTraceLattice } from '../lib/segyDoor';

const fmtInt = (v) => (v == null ? EMPTY_VALUE : v.toLocaleString('en-US'));
const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

/** SEIS-U1-012: a trace-header byte position is committed on Enter or
 *  blur, only when it is a whole number the header can hold. Typing
 *  "189" no longer rescans at bytes 1 and 18 first, and clearing the box
 *  no longer scans at byte 0 (a raw DataView range error). */
export function ByteField({ value, max, onCommit, disabled, ariaLabel }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = Number(text.trim());
    if (Number.isInteger(n) && n >= 1 && n <= max) {
      if (n !== value) onCommit(n);
    } else {
      setText(String(value));
    }
  };
  return (
    <Input
      type="text" inputMode="numeric" value={text} aria-label={ariaLabel}
      className="mt-1 bg-pl-surface border-pl-border-strong text-pl-text"
      title={`A trace-header byte position from 1 to ${max}; applied on Enter or when you leave the box`}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      disabled={disabled}
    />
  );
}

/** Why Start import stays off for this scan (SEIS-U1-002, -005), or null. */
export function importBlockReason({ scan, domain, useV4, v4Support, compress16 }) {
  if (!scan) return null;
  if (domain === 'depth') {
    return 'Seismolord interprets volumes in two-way time: a depth volume\'s sample axis would read as '
      + 'milliseconds, and horizons picked on it would be depth converted a second time. Import the '
      + 'time-migrated volume, or declare Two-way time if the header is wrong.';
  }
  if (needsTraceLattice(scan) && !useV4) {
    return 'This survey has an irregular outline or is not inline-sorted. It imports through the '
      + 'background import, which indexes every trace'
      + (compress16 ? '; untick 16-bit storage to use it.'
        : v4Support && !v4Support.ok ? ', and this browser cannot run it.' : '.');
  }
  return null;
}

const MB = 1024 * 1024;
// display copy with its levels of detail, compressed, as a share of the
// SEG-Y (measured on the tester-shaped synthetic survey)
const DISPLAY_SHARE = 0.09;

/** Plain expectations before a large import (plan: on a machine that
 *  reports 8 GB of memory or less, say what to expect). */
export function importExpectation(fileSize, deviceMemoryGb) {
  const displayMb = Math.max(1, Math.round((fileSize * DISPLAY_SHARE) / MB));
  const minutesAt10 = Math.max(1, Math.round((fileSize * DISPLAY_SHARE * 8) / 10e6 / 60));
  const lowMemory = Number.isFinite(deviceMemoryGb) && deviceMemoryGb <= 8;
  return {
    lowMemory,
    displayMb,
    minutesAt10,
    text: `${lowMemory ? 'This computer reports 8 GB of memory or less. ' : ''}`
      + 'The import runs in the background: this dialog closes and you can keep working. '
      + 'Converting takes a few minutes and uses up to about 400 MB of memory. '
      + `The survey opens as soon as its display copy (about ${displayMb.toLocaleString('en-US')} MB, `
      + `roughly ${minutesAt10} min at 10 Mbps) is uploaded; the full-precision copy follows. `
      + 'Keep this tab open until the upload finishes, or come back later to resume it.',
  };
}

const V4_FALLBACK_REASON = {
  'no-opfs': 'this browser has no private file storage',
  'no-deflate': 'this browser cannot compress bricks',
  'no-worker': 'this browser cannot run background workers',
  'no-space': 'there is not enough free disk space for a local copy',
};

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
 * @param {(file: File, mapping: Object) => void} [p.onFilePicked] Stream L:
 *   the viewer opens the picked file for viewing straight away
 * @param {() => void} [p.onViewNow] show the viewer (the dialog closes)
 */
export default function ImportPanel({
  onIngested, onBusyChange, frameless, onFilePicked, onViewNow, onBackgroundStarted, onServerImportStarted,
}) {
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
  const [compress16, setCompress16] = useState(false); // W4.4 int16 storage
  // SEIS-U1-005: vertical domain of the file, declared like the CRS; a
  // textual-header hint prefills it once per file, never commits it
  const [domain, setDomain] = useState('time');
  const domainPrefilledRef = useRef(false);
  const crsPrefilledRef = useRef(false);
  const [interrupted, setInterrupted] = useState([]); // status 'ingesting' rows
  const [resuming, setResuming] = useState(null);     // row being resumed
  const [discardingId, setDiscardingId] = useState(null);
  // v4 background import (large-survey plan): available when the browser
  // can keep a local copy; otherwise the v1 path runs in this dialog
  const [v4Support, setV4Support] = useState(null);
  useEffect(() => {
    if (!file) { setV4Support(null); return undefined; }
    let stale = false;
    v4ImportSupport(file.size)
      .then((r) => { if (!stale) setV4Support(r); })
      .catch(() => { if (!stale) setV4Support({ ok: false, reason: 'no-opfs' }); });
    return () => { stale = true; };
  }, [file]);
  // Server import (QI programme Q0): offered for every file, chosen by
  // default from 2 GB or when this browser cannot run the background import
  const serverAdvice = useMemo(() => (file ? serverImportAdvice(file.size, v4Support) : null), [file, v4Support]);
  const [useServer, setUseServer] = useState(false);
  // a remote file only exists on the server: it is always converted there
  useEffect(() => { setUseServer(Boolean(file?.remote) || Boolean(serverAdvice?.preferred)); }, [serverAdvice, file]);
  const [upload, setUpload] = useState(null);       // {bytesDone, bytesTotal}
  const [serverStarted, setServerStarted] = useState(false);
  const uploadAbortRef = useRef(null);
  // QI Q0b-3: import from a link. The worker fetches the file; the dialog
  // then works with a remote file {remote, datasetId, name, size, fingerprint}
  // and scans and converts it on the server.
  const [source, setSource] = useState('local');   // local | link
  const [linkUrl, setLinkUrl] = useState('');
  const [linkProgress, setLinkProgress] = useState(null);
  const useV4 = Boolean(v4Support?.ok) && !compress16;

  const runScan = async (f, m) => {
    // rapid mapping edits fire overlapping scans; only the LATEST result
    // may land — a slower earlier scan finishing last must not overwrite
    // the preview with geometry measured under stale byte positions (ML2)
    const seq = ++scanSeqRef.current;
    setPhase('scanning');
    setError(null);
    setScanData(null);
    try {
      const data = f?.remote ? await scanRemoteFile(f, m) : await scanFile(f, m);
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
    setDomain('time');
    domainPrefilledRef.current = false;
    runScan(f, mapping);
    if (onFilePicked) onFilePicked(f, mapping);
  };

  const onMappingChange = (next) => {
    const m = { ...mapping, ...next };
    setMapping(m);
    if (file) runScan(file, m);
    if (file && !file.remote && onFilePicked) onFilePicked(file, m); // a remote file has no local bytes to view
  };

  const startBackground = async () => {
    setPhase('ingesting');
    setError(null);
    setProgress(null);
    try {
      await getImportJobs().start({
        file,
        mapping,
        scan: scanData.scan,
        nativeCrs: crsTag,
        // the viewer re-lists volumes as the row becomes openable
        onRowChange: (status) => { if (onIngested) onIngested({ status, name: file.name }); },
      });
      setPhase('background');
      toast({
        title: 'Import running in the background',
        description: `${file.name}: progress is in the status bar. The survey opens once its display copy is uploaded.`,
      });
      if (onIngested) onIngested({ status: V4_STATUS.CONVERTING, name: file.name });
      if (onBackgroundStarted) onBackgroundStarted();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const fetchLink = async () => {
    setPhase('fetching');
    setError(null);
    setLinkProgress({ progress: 0, message: 'Queued on the server' });
    try {
      const remote = await fetchFromLink({ url: linkUrl.trim(), onProgress: setLinkProgress });
      setFile(remote);
      setCrsTag(null);
      setSanityOverride(false);
      crsPrefilledRef.current = false;
      setDomain('time');
      domainPrefilledRef.current = false;
      setLinkProgress(null);
      runScan(remote, mapping);
    } catch (e) {
      setLinkProgress(null);
      setError(e.message);
      setPhase('error');
    }
  };

  const startRemote = async () => {
    setPhase('ingesting');
    setError(null);
    try {
      await startRemoteConversion({ remote: file, mapping, scan: scanData.scan, nativeCrs: crsTag });
      setServerStarted(true);
      setPhase('background');
      toast({ title: 'Converting on the server', description: `${file.name}: follow it under Server jobs.` });
      if (onIngested) onIngested({ status: V4_STATUS.CONVERTING, name: file.name });
      if (onServerImportStarted) onServerImportStarted();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const startServer = async () => {
    setPhase('uploading');
    setError(null);
    setUpload({ bytesDone: 0, bytesTotal: file.size });
    const ctl = new AbortController();
    uploadAbortRef.current = ctl;
    try {
      await startServerImport({
        file, mapping, scan: scanData.scan, nativeCrs: crsTag, onUploadProgress: setUpload, signal: ctl.signal,
      });
      setServerStarted(true);
      setPhase('background');
      toast({
        title: 'Converting on the server',
        description: `${file.name} is uploaded. The server converts it; follow it under Server jobs.`,
      });
      if (onIngested) onIngested({ status: V4_STATUS.CONVERTING, name: file.name });
      if (onServerImportStarted) onServerImportStarted();
    } catch (e) {
      if (e?.name === 'AbortError') {
        setError('Upload paused. Pick the same file again and start the import to continue from where it stopped.');
      } else {
        setError(e.message);
      }
      setPhase('error');
    } finally {
      uploadAbortRef.current = null;
    }
  };

  const startIngest = async () => {
    if (file?.remote) { await startRemote(); return; }
    if (useServer) { await startServer(); return; }
    if (useV4) { await startBackground(); return; }
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
        compress16,
        onProgress: (p) => {
          setProgress(p);
          publishConversionProgress({ ...p, fileName: file.name });
        },
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
      clearConversionProgress();
    }
  };

  const scan = scanData?.scan;

  useEffect(() => {
    if (onBusyChange) onBusyChange(phase === 'ingesting' || phase === 'uploading' || phase === 'fetching');
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

  useEffect(() => {
    if (!scan || domainPrefilledRef.current) return;
    domainPrefilledRef.current = true;
    if (scan.depthHint?.preselect) setDomain('depth');
  }, [scan]);

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
  // the server import is always the v4 path, so the lattice rule is met
  const blockReason = importBlockReason({
    scan, domain, useV4: useV4 || useServer, v4Support, compress16: useServer ? false : compress16,
  });
  const busy = phase === 'ingesting' || phase === 'uploading' || phase === 'fetching';
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
          // v4 rows still 'converting' with no job in this tab and no
          // local copy to resume (the status bar lists those) are
          // interrupted conversions: discard and import again
          const live = new Set(getImportJobs().getSnapshot().map((j) => j.id));
          setInterrupted(vs.filter((v) => v.kind !== 'attribute'
            && (v.status === 'ingesting' || (v.status === V4_STATUS.CONVERTING && !live.has(v.id)))));
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
        onProgress: (p) => {
          setProgress(p);
          publishConversionProgress({ ...p, fileName: f.name });
        },
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
      clearConversionProgress();
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
        <StorageMeter refreshKey={phase} />
        {interrupted.length > 0 && phase !== 'ingesting' && (
          <div className="rounded-lg border border-pl-warning/50 bg-pl-warning-bg p-3 space-y-2">
            <div className="flex items-center text-sm text-pl-warning-text">
              <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
              Interrupted imports: resume with the ORIGINAL file (verified
              by fingerprint), or discard the partial data.
            </div>
            {interrupted.map((v) => {
              const rec = v.survey_meta?.ingest;
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-pl-text">{v.name}</span>
                  <span className="text-pl-muted">
                    {rec
                      ? `${rec.file_name} · ${(rec.file_size / (1024 * 1024)).toFixed(1)} MB`
                      : 'source file unknown (predates resume support)'}
                  </span>
                  <Button
                    size="sm" variant="outline"
                    disabled={!rec?.fingerprint || discardingId === v.id || v.status === V4_STATUS.CONVERTING}
                    title={v.status === V4_STATUS.CONVERTING
                      ? 'The conversion stopped before it finished. Discard it and import the file again.'
                      : rec?.fingerprint
                        ? 'Pick the original SEG-Y file to continue where the import stopped'
                        : 'No identity record to verify against. Discard and import again.'}
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
                    className="text-pl-danger-text hover:text-pl-danger-text"
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

        <div className="flex gap-1 text-sm" role="tablist" aria-label="Where the SEG-Y is">
          {[['local', 'From this computer'], ['link', 'From a link']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={source === k}
              disabled={busy || phase === 'scanning'}
              onClick={() => setSource(k)}
              className={`px-3 py-1 rounded border ${source === k ? 'border-pl-primary text-pl-primary-text bg-pl-primary/10' : 'border-pl-border text-pl-muted hover:text-pl-text'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'local' ? (
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
              <span className="ml-3 text-sm text-pl-muted">
                {(file.size / (1024 * 1024)).toFixed(1)} MB, processed in windows and not loaded whole
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2" data-testid="sl-import-link">
            <div className="flex gap-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://… link to a .sgy or .segy file"
                aria-label="Link to the SEG-Y file"
                disabled={busy || phase === 'scanning'}
                className="flex-1 rounded border border-pl-border bg-pl-sunken px-2 py-1.5 text-sm text-pl-text"
              />
              <Button variant="outline" onClick={fetchLink} disabled={!/^https:\/\//i.test(linkUrl.trim()) || busy || phase === 'scanning'}>
                <Link2 className="w-4 h-4 mr-2" />
                Fetch
              </Button>
            </div>
            <p className="text-xs text-pl-muted">
              The Petrolord server downloads the file itself, so nothing passes through this computer. The link must be https and serve the file directly.
            </p>
            {phase === 'fetching' && linkProgress && (
              <div className="space-y-1">
                <div className="flex items-center text-sm text-pl-text">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {linkProgress.message || 'Fetching on the server'}
                </div>
                <div className="h-2 rounded bg-pl-sunken overflow-hidden">
                  <div className="h-full bg-pl-primary transition-all" style={{ width: `${Math.round(100 * (linkProgress.progress || 0))}%` }} />
                </div>
              </div>
            )}
            {file?.remote && (
              <div className="text-sm text-pl-muted">
                {file.name}: {(file.size / (1024 * 1024)).toFixed(1)} MB, stored on the Petrolord server
              </div>
            )}
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex items-center text-pl-text">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Scanning headers…
          </div>
        )}

        {scan && (
          <>
            {/* Header mapping — the textual header lies; geometry is measured */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-pl-text">Header layout preset</Label>
                <select
                  className="w-full mt-1 rounded-md bg-pl-surface border border-pl-border-strong text-pl-text p-2 text-sm"
                  value={`${mapping.ilByte}/${mapping.xlByte}`}
                  onChange={(e) => {
                    const preset = MAPPING_PRESETS.find(
                      (p) => `${p.ilByte}/${p.xlByte}` === e.target.value);
                    if (preset) onMappingChange({ ilByte: preset.ilByte, xlByte: preset.xlByte });
                  }}
                  disabled={busy}
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
                <Label className="text-pl-text">Inline byte</Label>
                <ByteField
                  value={mapping.ilByte} max={237} ariaLabel="Inline byte"
                  onCommit={(n) => onMappingChange({ ilByte: n })}
                  disabled={busy}
                />
              </div>
              <div>
                <Label className="text-pl-text">Crossline byte</Label>
                <ByteField
                  value={mapping.xlByte} max={237} ariaLabel="Crossline byte"
                  onCommit={(n) => onMappingChange({ xlByte: n })}
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                className="text-sm text-pl-primary-text hover:underline"
                onClick={() => setShowBytes((s) => !s)}
              >
                {showBytes ? 'Hide' : 'Show'} coordinate byte positions (X, Y, scalar)
              </button>
              {showBytes && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-pl-text">X byte</Label>
                    <ByteField
                      value={mapping.xByte ?? DEFAULT_MAPPING.xByte} max={237} ariaLabel="X byte"
                      onCommit={(n) => onMappingChange({ xByte: n })}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <Label className="text-pl-text">Y byte</Label>
                    <ByteField
                      value={mapping.yByte ?? DEFAULT_MAPPING.yByte} max={237} ariaLabel="Y byte"
                      onCommit={(n) => onMappingChange({ yByte: n })}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <Label className="text-pl-text">Scalar byte</Label>
                    <ByteField
                      value={mapping.scalarByte ?? DEFAULT_MAPPING.scalarByte} max={239} ariaLabel="Scalar byte"
                      onCommit={(n) => onMappingChange({ scalarByte: n })}
                      disabled={busy}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Measured geometry */}
            <div className="rounded-lg border border-pl-border bg-pl-sunken/60 p-4 text-sm text-pl-text grid grid-cols-2 md:grid-cols-4 gap-y-2">
              <div>Format: <span className="text-pl-text">{scan.formatCode === 1 ? 'IBM float' : scan.formatCode === 5 ? 'IEEE float' : SAMPLE_FORMATS[scan.formatCode] || `code ${scan.formatCode}`}</span></div>
              <div>Traces: <span className="text-pl-text">{fmtInt(scan.totalTraces)}</span></div>
              <div>Samples: <span className="text-pl-text">{fmtInt(scan.ns)}</span> @ {scan.dtUs / 1000} ms</div>
              <div>Scalar: <span className="text-pl-text">{scan.coordScalar}</span></div>
              <div>Inlines: <span className="text-pl-text">{scan.il.min}–{scan.il.max}</span> (step {scan.il.step})</div>
              <div>Crosslines: <span className="text-pl-text">{scan.xl.min}–{scan.xl.max}</span> (step {scan.xl.step})</div>
              <div className="col-span-2">
                First CDP: <span className="text-pl-text">
                  {scan.corners.first ? `${scan.corners.first.x}, ${scan.corners.first.y}` : EMPTY_VALUE}
                </span>
              </div>
              {scan.sourceCoords && (
                <div className="col-span-2">
                  First source XY: <span className="text-pl-text">
                    {scan.sourceCoords.x}, {scan.sourceCoords.y}
                  </span>
                  <span className="text-pl-muted"> (bytes 73/77 cross-check)</span>
                </div>
              )}
              <div className="col-span-2">
                Header units words: <span className="text-pl-text">
                  {COORD_UNITS[scan.coordUnits] || 'unstated'}
                </span>
                <span className="text-pl-muted"> (byte 89)</span>
                {', '}
                <span className="text-pl-text">
                  {scan.measurementSystem === 1 ? 'metres' : scan.measurementSystem === 2 ? 'feet' : 'unstated'}
                </span>
                <span className="text-pl-muted"> (binary header)</span>
              </div>
              {scan.scalarStats?.varied && (
                <div className="col-span-2">
                  Scalars seen: <span className="text-pl-text">{scan.scalarStats.distinct.join(', ')}</span>
                </div>
              )}
              {scan.sampled && (
                <div className="col-span-full text-pl-muted">
                  Preview from sampled headers. Every trace is validated during import.
                </div>
              )}
            </div>

            {/* SEIS-U1-005: vertical domain, declared like the CRS */}
            <div className="rounded-lg border border-pl-border bg-pl-sunken/60 p-4 space-y-2" data-testid="sl-import-domain">
              <Label className="text-pl-text">Vertical axis of this file</Label>
              <div className="flex flex-wrap gap-4 text-sm text-pl-text">
                <label className="flex items-center gap-2">
                  <input type="radio" name="sl-domain" checked={domain === 'time'} onChange={() => setDomain('time')} disabled={busy} />
                  Two-way time (sample interval {scan.dtUs / 1000} ms)
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="sl-domain" checked={domain === 'depth'} onChange={() => setDomain('depth')} disabled={busy} />
                  Depth (a depth-migrated volume)
                </label>
              </div>
              {scan.depthHint && (
                <div className="text-xs text-pl-muted">
                  {scan.depthHint.preselect
                    ? <>The textual header mentions &quot;{scan.depthHint.word}&quot;, so Depth was preselected. The header may be wrong: check it below.</>
                    : <>The textual header mentions &quot;{scan.depthHint.word}&quot; and also time, so Two-way time stays chosen. Check the header below if the volume is in depth.</>}
                </div>
              )}
            </div>

            {/* CRS assignment: the Petrel step. Nothing imports without an
                explicit declaration; hints prefill, never commit. */}
            <div className="rounded-lg border border-pl-border bg-pl-sunken/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-pl-text">Coordinate reference system of this file</Label>
                <CrsBadge tag={crsTag} name={crsTag ? crsDisplayName(crsTag, project?.customDefs || {}) : null} />
              </div>
              <CrsPicker
                value={crsTag}
                onChange={onCrsPick}
                customDefs={project?.customDefs || {}}
                suggestions={crsHints.suggestions}
                disabled={busy}
              />
              {crsHints.unitHints.length > 0 && (
                <div className="text-xs text-pl-muted">
                  Header mentions units: {crsHints.unitHints.map((u) => `${u.unit} ("${u.match}")`).join(', ')}
                </div>
              )}
              <div className="text-sm text-pl-muted">
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
                <div className="flex items-center text-sm text-pl-success-text">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Scanned coordinates are plausible for this system.
                </div>
              )}
              {sanity && !sanity.ok && sanity.verdict === 'out-of-area' && (
                <div className="rounded-lg border border-pl-danger/50 bg-pl-danger-bg p-3 text-sm text-pl-danger-text space-y-2">
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
                  <label className="flex items-center gap-2 text-pl-text">
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
              <div className="rounded-lg border border-pl-warning/50 bg-pl-warning-bg p-3 text-sm text-pl-warning-text space-y-1">
                {scan.warnings.map((w) => (
                  <div key={w} className="flex items-start">
                    <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{w}
                  </div>
                ))}
              </div>
            )}

            {/* Preview table under current mapping */}
            <div className="overflow-x-auto rounded-lg border border-pl-border">
              <table className="w-full text-sm text-pl-text">
                <thead className="bg-pl-surface text-pl-muted">
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
                    <tr key={r.trace} className="border-t border-pl-border">
                      <td className="px-3 py-1">{fmtInt(r.trace)}</td>
                      <td className="px-3 py-1 text-pl-text">{r.il}</td>
                      <td className="px-3 py-1 text-pl-text">{r.xl}</td>
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
                className="text-sm text-pl-primary-text hover:underline"
                onClick={() => setShowHeader((s) => !s)}
              >
                {showHeader ? 'Hide' : 'Show'} textual header (display only, it may lie)
              </button>
              {showHeader && (
                <pre className="mt-2 bg-pl-sunken/80 border border-pl-border rounded-lg p-3 text-xs text-pl-muted overflow-x-auto">
                  {scanData.textLines.join('\n')}
                </pre>
              )}
            </div>
          </>
        )}

        {phase === 'ingesting' && resuming && (
          <div className="text-sm text-pl-muted">
            Resuming “{resuming.name}”. The file is re-verified and
            re-transcoded under the original mapping; bricks that already
            uploaded are skipped, so only the missing remainder transfers.
          </div>
        )}
        {phase === 'ingesting' && progress && (
          <div className="space-y-2">
            <div className="flex items-center text-pl-text text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {PHASE_LABEL[progress.phase] || progress.phase}
              {': '}
              {fmtInt(progress.done)}{progress.total ? ` / ${fmtInt(progress.total)}` : ''}
            </div>
            {progress.total && (
              <div className="h-2 rounded bg-pl-sunken overflow-hidden">
                <div
                  className="h-full bg-pl-primary transition-all"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {phase === 'uploading' && upload && (
          <div className="space-y-2" data-testid="sl-server-upload">
            <div className="flex items-center text-pl-text text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {`Uploading to the Petrolord server: ${fmtBytes(upload.bytesDone)} of ${fmtBytes(upload.bytesTotal)}`}
            </div>
            <div className="h-2 rounded bg-pl-sunken overflow-hidden">
              <div
                className="h-full bg-pl-primary transition-all"
                style={{ width: `${Math.round((upload.bytesDone / Math.max(1, upload.bytesTotal)) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-pl-muted">
              Keep this tab open until the upload finishes. If it stops, pick the same file again: the upload continues from where it stopped.
            </div>
          </div>
        )}
        {phase === 'background' && (
          <div className="flex items-center text-pl-success-text text-sm">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {serverStarted
              ? 'Uploaded. The server is converting it; follow it under Server jobs. You can close this tab.'
              : 'Import started. It continues in the background; progress is in the status bar.'}
          </div>
        )}
        {file && scan && useV4 && !useServer && !busy && phase !== 'background' && (
          <div className="text-xs text-pl-muted leading-relaxed" data-testid="import-expectation">
            {importExpectation(file.size, typeof navigator !== 'undefined' ? navigator.deviceMemory : null).text}
          </div>
        )}
        {file && v4Support && !v4Support.ok && !useServer && (
          <div className="text-xs text-pl-warning-text leading-relaxed">
            The import will upload as it converts and this dialog stays open until it finishes,
            because {V4_FALLBACK_REASON[v4Support.reason] || 'this browser cannot run the background import'}.
          </div>
        )}
        {phase === 'done' && (
          <div className="flex items-center text-pl-success-text text-sm">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Volume ingested and registered.
          </div>
        )}
        {error && (
          <div className="flex items-start text-pl-danger-text text-sm">
            <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
          </div>
        )}

        {file && !file.remote && scan && serverAdvice?.offer && phase !== 'background' && (
          <fieldset className="rounded-lg border border-pl-border p-3 space-y-2 text-sm text-pl-text" data-testid="sl-import-where">
            <legend className="px-1 text-pl-muted">Where to convert</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="sl-import-where" checked={useServer} onChange={() => setUseServer(true)} disabled={busy} />
              <span>
                <Server className="inline w-4 h-4 mr-1 -mt-0.5" />
                On the Petrolord server
                {serverAdvice.reason === 'large' && <span className="text-pl-muted"> (recommended for files of 2 GB or more)</span>}
                {serverAdvice.reason === 'browser' && <span className="text-pl-muted"> (recommended: this browser cannot run the background import)</span>}
                <span className="block text-xs text-pl-muted">
                  The file uploads straight to the server, which converts it. Once the upload finishes you can close the tab;
                  the conversion carries on and shows under Server jobs.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="sl-import-where" checked={!useServer} onChange={() => setUseServer(false)} disabled={busy} />
              <span>
                In this browser
                <span className="block text-xs text-pl-muted">Converts on this computer, then uploads the result.</span>
              </span>
            </label>
          </fieldset>
        )}

        <div className="flex items-center gap-3 text-sm text-pl-text">
          <label className="flex items-center gap-2" title={`${v4Support?.ok ? 'Uses the older import path: it uploads while converting, keeps this dialog open and makes no display copy. ' : ''}Bricks store as scaled 16-bit integers with per-brick scaling: half the storage and egress. Quantization error is bounded by 1/65534 of each brick's own amplitude range; display and every computation still run in float32. Attribute volumes need a float32 parent.`}>
            <input
              type="checkbox"
              checked={compress16 && !useServer}
              onChange={(e) => setCompress16(e.target.checked)}
              disabled={busy || useServer || Boolean(file?.remote)}
            />
            16-bit storage (half size)
          </label>
        </div>

        {blockReason && phase !== 'ingesting' && (
          <div className="flex items-start text-pl-warning-text text-sm" data-testid="sl-import-blocked">
            <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{blockReason}
          </div>
        )}
        <div className="flex gap-3">
          <Button
            onClick={startIngest}
            disabled={!scan || busy || phase === 'scanning' || phase === 'background' || !crsChosen || sanityBlocks || Boolean(blockReason)}
            title={!scan ? undefined
              : blockReason ? blockReason
              : !crsChosen ? 'Choose the coordinate reference system of this file first'
                : sanityBlocks ? 'The coordinates are implausible for the chosen CRS. Fix the choice or confirm the override.'
                  : undefined}
            className="bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg"
          >
            <Play className="w-4 h-4 mr-2" />
            Start import
          </Button>
          {file && onViewNow && (
            // Stream L: the viewer already shows this file; the import
            // keeps running with the dialog closed and its progress
            // shows in the viewer (sources/conversionProgress)
            <Button
              variant="outline"
              onClick={onViewNow}
              title="Inlines and crosslines are shown straight from this file while it converts"
            >
              <Eye className="w-4 h-4 mr-2" />
              View it now
            </Button>
          )}
          {phase === 'uploading' && (
            <Button variant="outline" onClick={() => uploadAbortRef.current?.abort()}>
              <Pause className="w-4 h-4 mr-2" />
              Pause upload
            </Button>
          )}
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
    <Card>
      <CardHeader>
        <CardTitle className="text-pl-text flex items-center">
          <Upload className="w-5 h-5 mr-2 text-pl-primary-text" />
          Import SEG-Y volume
        </CardTitle>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
