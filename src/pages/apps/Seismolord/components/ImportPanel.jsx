import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle, Play, Ban,
  RotateCcw, Trash2, Eye, Server, Link2,
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
  serverImportAdvice, startServerImport, fetchFromLink, scanRemoteFile, startRemoteConversion, uploadForQi,
} from '../services/serverImport';
import {
  importSourceReader, isZgyFile, zgySummary, VOLUME_ACCEPT,
} from '../services/zgySource';
import { detectGatherLayout, normalizeCrop } from '../engine/segyCrop';
import {
  planImportCrop, cropSource, spotCheckCrop, conversionView, scanConversionView, cropFileLike,
  importCropProvenance, cropRequest, layoutFromDoor, rememberCropFor, recallCropFor, forgetCropFor,
  savedUploadSpeed, saveUploadSpeed, cropEstimate,
} from '../services/cropImport';
import CropPanel, { EMPTY_FORM, defFromForm } from './CropPanel';
import {
  beginImportDraft, updateImportDraft, clearImportDraft, getImportDraft,
} from '../services/importDraft';
import { startServerUpload } from '../services/serverUploadsRuntime';
import CrsPicker from '@/components/crs/CrsPicker';
import StorageMeter from './StorageMeter';
import LocalWorkspacePanel from '@/components/localWorkspace/LocalWorkspacePanel';
import { useLocalWorkspace, localReady } from '@/lib/localWorkspace/runtime';
import { currentProjectSettings, currentProjectId } from '@/lib/projects/projectScope';
import { saveProjectSettings } from '@/lib/projects/projectsService';
import { startLocalImport } from '../services/localImportRuntime';
import { localVsUploadEstimate, durationWords, sizeWords } from '../services/localImport';
import CrsBadge from '@/components/crs/CrsBadge';
import { sanityCheck, crsDisplayName } from '@/lib/crs';
import { getProjectCrs, addCustomDef } from '@/lib/crs/settingsService';
import { isTransformableTag, normalizeTag, UNKNOWN } from '@/lib/crs/tags';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  COORD_UNITS, SAMPLE_FORMATS, needsTraceLattice, inspectSegy, openSegyDoor, alignTraceDelay, scanOnReader,
} from '../lib/segyDoor';
import { depthDeclaration, depthDtUs, depthPrefill, VELOCITY_TYPES } from '../lib/verticalDomain';

/** What a picked Petrel ZGY holds and how it is read. */
function ZgyNote({ info }) {
  const vertical = info.vertical === 'time' ? `two-way time${info.verticalUnit ? ` in ${info.verticalUnit}` : ''}`
    : info.vertical === 'depth' ? `depth${info.verticalUnit ? ` in ${info.verticalUnit}` : ''}` : null;
  return (
    <div className="mt-2 rounded border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-muted space-y-1" data-testid="sl-import-zgy">
      <div className="text-pl-text">
        Petrel ZGY (version {info.version}), stored as {info.stored}{info.compressed ? ', compressed' : ''}.
        It is read in place as SEG-Y with 32-bit samples ({fmtBytes(info.segyBytes)}); nothing is written to disk first.
      </div>
      <div>
        {vertical ? `The file records its vertical axis as ${vertical}.` : 'The file does not record whether its vertical axis is time or depth: declare it below.'}
        {info.hasCoordinates ? '' : ' It holds no world coordinates.'}
        {info.projection ? ` Projection named in the file: ${info.projection}.` : ' Declare its CRS below.'}
      </div>
      {info.notes.map((n) => <div key={n}>{n}</div>)}
    </div>
  );
}

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
export function importBlockReason({ scan, domain, useV4, v4Support, compress16, verticalError = null }) {
  if (!scan) return null;
  if (domain === 'depth') {
    // QI upgrade P1.6 (2026-10-15): depth volumes import with their declared
    // unit and interval, through the background import or the server
    if (verticalError) return verticalError;
    if (!useV4) {
      return 'A depth volume imports through the background import or the Petrolord server. '
        + (compress16 ? 'Untick 16-bit storage, or choose the server.' : 'Choose the server: this browser cannot run the background import.');
    }
    return null;
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
  // a Petrel ZGY is read in place as the SEG-Y it holds (zgySource.js);
  // everything sized by the file (advice, estimates, the upload) uses that SEG-Y's size
  const [zgyInfo, setZgyInfo] = useState(null);
  useEffect(() => {
    if (!isZgyFile(file)) { setZgyInfo(null); return undefined; }
    let stale = false;
    importSourceReader(file, { headersOnly: true })
      .then((r) => { if (!stale) setZgyInfo(zgySummary(r)); })
      .catch(() => { if (!stale) setZgyInfo(null); }); // the scan reports why
    return () => { stale = true; };
  }, [file]);
  const srcBytes = zgyInfo?.segyBytes ?? file?.size ?? 0;
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
  // P1.6: a depth file's unit, sample interval and whether it holds velocities
  const [depthForm, setDepthForm] = useState({ unit: 'm', dz: '', velocity: false, velocityType: 'interval' });
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
    v4ImportSupport(srcBytes)
      .then((r) => { if (!stale) setV4Support(r); })
      .catch(() => { if (!stale) setV4Support({ ok: false, reason: 'no-opfs' }); });
    return () => { stale = true; };
  }, [file, srcBytes]);
  // Server import (QI programme Q0): offered for every file, chosen by
  // default from 2 GB or when this browser cannot run the background import
  const serverAdvice = useMemo(() => (file ? serverImportAdvice(srcBytes, v4Support) : null), [file, srcBytes, v4Support]);
  const [useServer, setUseServer] = useState(false);
  // a remote file only exists on the server: it is always converted there
  const userChoseWhereRef = useRef(false);
  useEffect(() => {
    if (file?.remote) { setUseServer(true); return; }
    if (!userChoseWhereRef.current) setUseServer(Boolean(serverAdvice?.preferred));
  }, [serverAdvice, file]);
  const [serverStarted, setServerStarted] = useState(false);
  // QI Q0b-3: import from a link. The worker fetches the file; the dialog
  // then works with a remote file {remote, datasetId, name, size, fingerprint}
  // and scans and converts it on the server.
  const [source, setSource] = useState('local');   // local | link
  const [linkUrl, setLinkUrl] = useState('');
  const [linkProgress, setLinkProgress] = useState(null);
  const useV4 = Boolean(v4Support?.ok) && !compress16;
  // Local Workspace (owner decision 7): where this import's seismic lives.
  // The project's choice is the default; a project with none asks here,
  // defaulting to this computer, and remembers the answer.
  const lws = useLocalWorkspace();
  const projectStorage = currentProjectSettings()?.seismic?.storage || null;
  const localOffered = lws.schemaReady && lws.support.any;
  const [keepLocal, setKeepLocal] = useState(() => (projectStorage ? projectStorage === 'local' : true));
  const [rememberChoice, setRememberChoice] = useState(true);
  useEffect(() => { if (projectStorage) setKeepLocal(projectStorage === 'local'); }, [projectStorage]);
  const goLocal = localOffered && keepLocal && Boolean(file) && !file?.remote;
  // Crop before upload (2026-10-14): the crop step, the file's layout and
  // whether it holds prestack gathers (both read from the first traces)
  const [cropOn, setCropOn] = useState(false);
  const [cropEst, setCropEst] = useState(null);   // the crop's size estimate, for the where-it-lives choice
  const [cropForm, setCropForm] = useState(EMPTY_FORM);
  const [cropDefId, setCropDefId] = useState(null);
  const [cropStatus, setCropStatus] = useState(null);
  const [cropRestored, setCropRestored] = useState(false);
  const [layoutInfo, setLayoutInfo] = useState(null); // {door, gathers}
  const [speed, setSpeed] = useState(() => savedUploadSpeed());

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
    // an unfinished cropped upload of this file: its crop comes back, so the
    // same bytes are produced and the upload continues where it stopped
    const remembered = recallCropFor(f);
    setCropOn(Boolean(remembered));
    setCropForm(remembered ? { ...EMPTY_FORM, ...remembered } : EMPTY_FORM);
    setCropRestored(Boolean(remembered));
    setCropDefId(null);
    setLayoutInfo(null);
    setCrsTag(null);
    setSanityOverride(false);
    crsPrefilledRef.current = false;
    setDomain('time');
    setDepthForm({ unit: 'm', dz: '', velocity: false, velocityType: 'interval' });
    domainPrefilledRef.current = false;
    runScan(f, mapping);
    // the picked file and its choices outlive the dialog until the import starts
    beginImportDraft(f, mapping);
    userChoseWhereRef.current = false;
    if (onFilePicked) onFilePicked(f, mapping);
  };

  const onMappingChange = (next) => {
    const m = { ...mapping, ...next };
    setMapping(m);
    if (file) runScan(file, m);
    if (file && !file.remote && onFilePicked) onFilePicked(file, m); // a remote file has no local bytes to view
  };

  // F-5: an uncropped file's trace delay, and the scan of the shifted file
  // the conversion reads (a crop applies it in its own conversion view)
  const delayedScan = async () => {
    const { reader } = await openSegyDoor(await importSourceReader(file, { headersOnly: true }));
    const { reader: aligned, traceDelay } = await alignTraceDelay(reader, { domain: vertical ? 'depth' : 'time' });
    return { traceDelay, scan: traceDelay.applied ? await scanOnReader(scanData.scan, aligned) : scanData.scan };
  };

  const startBackground = async () => {
    setPhase('ingesting');
    setError(null);
    setProgress(null);
    try {
      const cropped = cropOn ? await buildCrop({ forUpload: false }) : null;
      const delayed = cropped ? null : await delayedScan();
      await getImportJobs().start({
        file,
        mapping,
        scan: cropped ? cropped.convScan : delayed.scan,
        ...(delayed ? { traceDelay: delayed.traceDelay } : {}),
        crop: cropped ? { request: cropRequest(cropped.prep, file.name, mapping), provenance: cropped.provenance, bytes: cropped.cropped.size } : null,
        nativeCrs: crsTag,
        ...(vertical ? { vertical } : {}),
        // the viewer re-lists volumes as the row becomes openable
        onRowChange: (status) => { if (onIngested) onIngested({ status, name: file.name }); },
      });
      clearImportDraft();
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
      setDepthForm({ unit: 'm', dz: '', velocity: false, velocityType: 'interval' });
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
      const def = cropOn ? defFromForm(cropForm) : null;
      const est = def && remoteCrop ? cropEstimate({ crop: remoteCrop, scan: scanData.scan, door: null, fileSize: file.size }) : null;
      await startRemoteConversion({
        remote: file, mapping, scan: scanData.scan, nativeCrs: crsTag,
        crop: def ? { def, definitionId: cropDefId, estimatedBytes: est?.croppedBytes } : null,
        ...(vertical ? { vertical } : {}),
      });
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

  /**
   * The crop for this file: snapped, its kept traces found (from the headers
   * when the grid is irregular, gathers, or the arithmetic plan fails its
   * spot check), the cropped file and the scan its conversion runs on.
   */
  const buildCrop = async ({ forUpload, gathersOnly = false }) => {
    const raw = await importSourceReader(file);
    const def = defFromForm(cropForm);
    setCropStatus('Finding the kept traces');
    try {
      const onProgress = (done, total) => setCropStatus(`Finding the kept traces from the headers: ${Math.round((100 * done) / Math.max(1, total))} percent`);
      const dtOpt = cropDtUs ? { dtUs: cropDtUs } : {};
      let prep = await planImportCrop({ raw, scan: scanData.scan, def, mapping, onProgress, ...dtOpt });
      let cropped = cropSource(raw, prep, { sourceName: file.name, mapping });
      if (prep.plan.verify) {
        try {
          await spotCheckCrop(cropped, prep.plan);
        } catch (e) {
          if (e?.name !== 'CropGridMismatch') throw e;
          prep = await planImportCrop({ raw, scan: scanData.scan, def, mapping, fromHeaders: true, onProgress, ...dtOpt });
          cropped = cropSource(raw, prep, { sourceName: file.name, mapping });
        }
      }
      const provenance = importCropProvenance(prep, { file, mode: forUpload ? 'upload' : 'browser', definitionId: cropDefId, vertical });
      if (gathersOnly) return { prep, cropped, provenance };
      setCropStatus('Checking the cropped file');
      const view = await conversionView(cropped, prep.crop);
      const convScan = await scanConversionView(view, mapping);
      // the conversion keeps the import's placement checks
      convScan.coordScalar = convScan.coordScalar ?? scanData.scan.coordScalar;
      return { prep, cropped, provenance, convScan };
    } finally {
      setCropStatus(null);
    }
  };



  // The upload runs as a background job (serverUploadsRuntime): the dialog
  // closes, the status bar shows the progress, and leaving Seismolord does
  // not stop it.
  const startServer = async () => {
    setPhase('uploading');
    setError(null);
    try {
      let crop = null;
      if (cropOn) {
        const c = await buildCrop({ forUpload: true });
        crop = {
          fileLike: cropFileLike(c.cropped, { file, crop: c.prep.crop }),
          scan: c.convScan, padTop: c.prep.crop.samples.first, provenance: c.provenance,
        };
        rememberCropFor(file, cropForm);
      }
      // a ZGY goes up as it is: the worker reads it as the SEG-Y it holds
      const args = {
        file, mapping, scan: scanData.scan, nativeCrs: crsTag, crop, ...(vertical ? { vertical } : {}),
      };
      const picked = file;
      startServerUpload({
        name: picked.name,
        bytesTotal: crop ? crop.fileLike.size : picked.size,
        task: ({ signal, onUploadProgress }) => startServerImport({ ...args, signal, onUploadProgress }),
        onDone: () => {
          forgetCropFor(picked);
          toast({ title: 'Converting on the server', description: `${picked.name} is uploaded. The server converts it; follow it under Server jobs.` });
          if (onIngested) onIngested({ status: V4_STATUS.CONVERTING, name: picked.name });
          if (onServerImportStarted) onServerImportStarted();
        },
        onError: (e) => toast({ title: 'Upload stopped', description: `${picked.name}: ${e.message} Resume it from the status bar.`, variant: 'destructive' }),
      });
      clearImportDraft();
      setServerStarted(true);
      setPhase('background');
      toast({ title: 'Uploading in the background', description: `${picked.name}: progress, pause and resume are in the status bar. You can keep working.` });
      if (onBackgroundStarted) onBackgroundStarted();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  /** Prestack gathers: upload (cropped or not) for QI Studio's gather store, in the background. */
  const startGatherUpload = async () => {
    setPhase('uploading');
    setError(null);
    try {
      let crop = null;
      if (cropOn) {
        const c = await buildCrop({ forUpload: true, gathersOnly: true });
        crop = { fileLike: cropFileLike(c.cropped, { file, crop: c.prep.crop }) };
        rememberCropFor(file, cropForm);
      }
      const picked = file;
      startServerUpload({
        name: picked.name,
        kind: 'gathers',
        bytesTotal: crop ? crop.fileLike.size : picked.size,
        task: ({ signal, onUploadProgress }) => uploadForQi({ file: picked, onUploadProgress, signal, crop }),
        onDone: () => {
          forgetCropFor(picked);
          toast({ title: 'Gathers uploaded', description: `${picked.name}: build the gather store in QI Studio, Prestack tab.` });
        },
        onError: (e) => toast({ title: 'Upload stopped', description: `${picked.name}: ${e.message} Resume it from the status bar.`, variant: 'destructive' }),
      });
      clearImportDraft();
      setServerStarted(true);
      setPhase('background');
      if (onBackgroundStarted) onBackgroundStarted();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const startLocal = async () => {
    setPhase('ingesting');
    setError(null);
    try {
      if (!projectStorage && rememberChoice && currentProjectId()) {
        await saveProjectSettings(currentProjectId(), { seismic: { storage: 'local' } }).catch(() => {});
      }
      const cropped = cropOn ? await buildCrop({ forUpload: false }) : null;
      const delayed = cropped ? null : await delayedScan();
      await startLocalImport({
        file,
        mapping,
        scan: cropped ? cropped.convScan : delayed.scan,
        ...(delayed ? { traceDelay: delayed.traceDelay } : {}),
        crop: cropped ? { request: cropRequest(cropped.prep, file.name, mapping), provenance: cropped.provenance } : null,
        nativeCrs: crsTag,
        ...(vertical ? { vertical } : {}),
        onDone: () => { if (onIngested) onIngested({ status: V4_STATUS.READY, name: file.name }); },
      });
      clearImportDraft();
      setPhase('background');
      toast({ title: 'Importing to this computer', description: `${file.name}: nothing is uploaded. Progress is in the status bar; keep this tab open until it finishes.` });
      if (onBackgroundStarted) onBackgroundStarted();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const startIngest = async () => {
    if (goLocal) { await startLocal(); return; }
    if (!projectStorage && rememberChoice && localOffered && currentProjectId() && file && !file.remote) {
      saveProjectSettings(currentProjectId(), { seismic: { storage: 'cloud' } }).catch(() => {});
    }
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
      clearImportDraft();
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

  /** Start the import, then show the file while it converts (the viewer reads it from disk). */
  const startAndView = async () => {
    const picked = file;
    const m = mapping;
    await startIngest();
    if (!getImportDraft() && onViewNow) onViewNow(picked, m);
  };

  // The dialog's choices travel with the draft, so reopening the dialog
  // (here, or after a visit to another app) finds them as they were.
  useEffect(() => {
    if (!file || file.remote || phase === 'background' || phase === 'done') return;
    updateImportDraft(file, {
      mapping,
      choices: {
        crsTag, sanityOverride, domain, depthForm, keepLocal, useServer, compress16, cropOn, cropForm, cropDefId,
      },
    });
  }, [file, mapping, crsTag, sanityOverride, domain, depthForm, keepLocal, useServer, compress16, cropOn, cropForm, cropDefId, phase]);

  // Reopened with a draft: the same file, mapping and choices, scanned again.
  useEffect(() => {
    const d = getImportDraft();
    if (!d?.file || file) return;
    const c = d.choices;
    setFile(d.file);
    setMapping(d.mapping);
    if (c) {
      setCrsTag(c.crsTag);
      setSanityOverride(Boolean(c.sanityOverride));
      setDomain(c.domain);
      setDepthForm(c.depthForm);
      setKeepLocal(c.keepLocal);
      setUseServer(c.useServer);
      userChoseWhereRef.current = true;
      setCompress16(Boolean(c.compress16));
      setCropOn(Boolean(c.cropOn));
      setCropForm(c.cropForm || EMPTY_FORM);
      setCropDefId(c.cropDefId || null);
      // the restored choices are the user's: the one-time prefills stay off
      crsPrefilledRef.current = Boolean(c.crsTag);
      domainPrefilledRef.current = true;
    }
    runScan(d.file, d.mapping);
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = scanData?.scan;
  // P1.6: the depth declaration (null for time), or why it cannot be used
  const { vertical, verticalError } = useMemo(() => {
    if (domain !== 'depth') return { vertical: null, verticalError: null };
    try {
      return {
        vertical: depthDeclaration({ unit: depthForm.unit, dz: depthForm.dz, velocity: depthForm.velocity ? { type: depthForm.velocityType } : null }),
        verticalError: null,
      };
    } catch (e) { return { vertical: null, verticalError: e.message }; }
  }, [domain, depthForm]);
  // the sample interval a depth window is read in (x 1000); null for time
  const cropDtUs = vertical ? depthDtUs(vertical) : null;
  // F-5: a time import reads the crop window from the file's first sample time
  const cropT0Ms = domain === 'time' && scan?.door?.traceDelay?.applied ? scan.door.traceDelay.applied_ms : 0;

  // the file's layout and gathers check (local files), for the crop step
  useEffect(() => {
    if (!file || file.remote || !scan) { setLayoutInfo(null); return undefined; }
    let stale = false;
    (async () => {
      try {
        const raw = await importSourceReader(file, { headersOnly: true });
        const door = await inspectSegy(raw);
        const layout = layoutFromDoor(door, raw.size);
        const gathers = await detectGatherLayout(raw, layout, mapping);
        if (!stale) setLayoutInfo({ door, gathers });
      } catch { if (!stale) setLayoutInfo(null); }
    })();
    return () => { stale = true; };
  }, [file, scan, mapping]);
  const gathers = layoutInfo?.gathers?.gathers ? layoutInfo.gathers : null;
  // a link import's crop is applied on the server; checked here against the scan
  const remoteCrop = useMemo(() => {
    if (!file?.remote || !cropOn || !scan) return null;
    try { return normalizeCrop(defFromForm(cropForm), { il: scan.il, xl: scan.xl, ns: scan.ns, dtUs: cropDtUs || scan.dtUs, t0Ms: cropT0Ms }); } catch { return null; }
  }, [file, cropOn, scan, cropForm, cropDtUs, cropT0Ms]);
  const cropProblem = useMemo(() => {
    if (!cropOn || !scan) return null;
    try {
      normalizeCrop(defFromForm(cropForm), { il: scan.il, xl: scan.xl, ns: layoutInfo?.door?.ns || scan.ns, dtUs: cropDtUs || layoutInfo?.door?.dtUs || scan.dtUs, t0Ms: cropT0Ms });
      return null;
    } catch (e) { return e.message; }
  }, [cropOn, scan, cropForm, layoutInfo, cropDtUs, cropT0Ms]);

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
    // P1.6: the depth unit and interval as the header gives them, editable
    setDepthForm((f) => ({ ...f, ...depthPrefill(scan) }));
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
  const blockReason = gathers
    ? domain === 'depth'
      ? 'This file holds prestack gathers in depth. QI Studio\'s prestack tools work in two-way time, so depth gathers cannot be used there yet.'
      : 'This file holds prestack gathers (several traces at each inline and crossline), so it does not become a Seismolord volume. Upload it for QI Studio instead.'
    : cropProblem ? `The crop is not valid: ${cropProblem}`
      : cropOn && !file?.remote && !useServer && !useV4
        ? 'Cropping runs in the background import or the server import. Choose the server, or untick 16-bit storage.'
        : importBlockReason({
          scan, domain, useV4: useV4 || useServer, v4Support, compress16: useServer ? false : compress16, verticalError,
        });
  const busy = phase === 'ingesting' || phase === 'uploading' || phase === 'fetching';
  const sanityBlocks = Boolean(sanity && !sanity.ok && sanity.verdict === 'out-of-area' && !sanityOverride);
  const startDisabled = !scan || busy || phase === 'scanning' || phase === 'background' || !crsChosen || sanityBlocks
    || Boolean(blockReason) || (goLocal && !localReady(lws));
  const startTitle = !scan ? undefined
    : blockReason ? blockReason
      : !crsChosen ? 'Choose the coordinate reference system of this file first'
        : sanityBlocks ? 'The coordinates are implausible for the chosen CRS. Fix the choice or confirm the override.'
          : undefined;
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
              accept={VOLUME_ACCEPT}
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
              accept={VOLUME_ACCEPT}
              className="hidden"
              onChange={onPickFile}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={phase === 'ingesting' || phase === 'scanning'}
            >
              <FileText className="w-4 h-4 mr-2" />
              {file ? file.name : 'Choose a SEG-Y or ZGY file'}
            </Button>
            {file && (
              <span className="ml-3 text-sm text-pl-muted">
                {(file.size / (1024 * 1024)).toFixed(1)} MB, processed in windows and not loaded whole
              </span>
            )}
            {zgyInfo && <ZgyNote info={zgyInfo} />}
          </div>
        ) : (
          <div className="space-y-2" data-testid="sl-import-link">
            <div className="flex gap-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://… link to a .sgy, .segy or .zgy file"
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
              The Petrolord server reads the file from the link itself, so nothing passes through this computer. When the link's server allows partial downloads, only what the import needs is read (with a crop, just the kept traces); otherwise the whole file is copied to the server first. The link must be https and serve the file directly.
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
                {file.name}: {(file.size / (1024 * 1024)).toFixed(1)} MB, {file.linked ? 'read from the link as needed (nothing copied yet)' : 'stored on the Petrolord server'}
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
              {domain === 'time' && scan.door?.traceDelay?.note && (
                <div className="text-xs text-pl-muted" data-testid="sl-import-trace-delay">{scan.door.traceDelay.note}</div>
              )}
              {domain === 'depth' && (
                <div className="space-y-2 text-sm text-pl-text" data-testid="sl-import-depth">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      Depth unit
                      <select
                        className="rounded border border-pl-border-strong bg-pl-surface p-1 text-sm text-pl-text"
                        value={depthForm.unit} onChange={(e) => setDepthForm({ ...depthForm, unit: e.target.value })}
                        disabled={busy} aria-label="Depth unit" data-testid="sl-depth-unit"
                      >
                        <option value="m">metres</option>
                        <option value="ft">feet</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      Sample interval
                      <input
                        className="w-24 rounded border border-pl-border-strong bg-pl-surface px-2 py-1 text-sm text-pl-text"
                        inputMode="decimal" value={depthForm.dz} onChange={(e) => setDepthForm({ ...depthForm, dz: e.target.value })}
                        disabled={busy} aria-label="Depth sample interval" data-testid="sl-depth-dz"
                      />
                      {depthForm.unit === 'ft' ? 'ft' : 'm'}
                    </label>
                  </div>
                  <p className="text-xs text-pl-muted">
                    Prefilled from the file header (sample interval {scan.dtUs}, measurement system {scan.measurementSystem === 1 ? 'metres' : scan.measurementSystem === 2 ? 'feet' : 'unstated'}).
                    Depth files store the interval in different ways, so check it against the processing report: {fmtInt(scan.ns)} samples at the interval above reach {vertical ? fmtInt(Math.round((scan.ns - 1) * vertical.dz)) : EMPTY_VALUE} {depthForm.unit === 'ft' ? 'ft' : 'm'}.
                  </p>
                  <label className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={depthForm.velocity} onChange={(e) => setDepthForm({ ...depthForm, velocity: e.target.checked })} disabled={busy} data-testid="sl-depth-velocity" />
                    This volume holds velocities
                    {depthForm.velocity && (
                      <select
                        className="rounded border border-pl-border-strong bg-pl-surface p-1 text-sm text-pl-text"
                        value={depthForm.velocityType} onChange={(e) => setDepthForm({ ...depthForm, velocityType: e.target.value })}
                        disabled={busy} aria-label="Velocity type" data-testid="sl-depth-velocity-type"
                      >
                        {Object.entries(VELOCITY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    )}
                    {depthForm.velocity && <span className="text-xs text-pl-muted">in {depthForm.unit === 'ft' ? 'ft/s' : 'm/s'}</span>}
                  </label>
                  <p className="text-xs text-pl-muted">
                    Seismolord shows a depth volume on a depth axis. Tools that work in two-way time (well ties and synthetics, the velocity model, tops to horizons, frequency attributes and QI Studio) say so and do not use it.
                  </p>
                  {verticalError && <p className="text-xs text-pl-danger-text" data-testid="sl-depth-error">{verticalError}</p>}
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

            <CropPanel
              scan={cropDtUs ? { ...scan, dtUs: cropDtUs } : scan}
              door={layoutInfo?.door && cropDtUs ? { ...layoutInfo.door, dtUs: cropDtUs } : layoutInfo?.door || null}
              fileSize={srcBytes}
              domain={domain}
              t0Ms={cropT0Ms}
              enabled={cropOn}
              onEnabled={(on) => { setCropOn(on); setCropRestored(false); }}
              form={cropForm}
              onForm={setCropForm}
              onDefinitionId={setCropDefId}
              showUpload={!file?.remote && (useServer || Boolean(gathers))}
              speed={speed}
              onSpeed={(v) => { setSpeed(v); if (v) saveUploadSpeed(v); }}
              gathers={layoutInfo?.gathers || null}
              onEstimate={setCropEst}
              disabled={busy}
              status={cropStatus}
            />
            {cropRestored && cropOn && (
              <div className="text-xs text-pl-muted" data-testid="sl-crop-restored">
                The crop of the unfinished upload of this file was restored, so the upload continues where it stopped. Change it only to start a new upload.
              </div>
            )}
            {file?.remote && cropOn && (
              <div className="text-xs text-pl-muted">The Petrolord server keeps only this crop while it converts the stored file.</div>
            )}

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

        {phase === 'uploading' && (
          <div className="flex items-center text-pl-text text-sm" data-testid="sl-server-upload">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Preparing the upload
          </div>
        )}
        {phase === 'background' && (
          <div className="flex items-center text-pl-success-text text-sm">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {serverStarted
              ? 'Uploading in the background. Progress, pause and resume are in the status bar; you can keep working.'
              : 'Import started. It continues in the background; progress is in the status bar.'}
          </div>
        )}
        {file && scan && useV4 && !useServer && !busy && phase !== 'background' && (
          <div className="text-xs text-pl-muted leading-relaxed" data-testid="import-expectation">
            {importExpectation(srcBytes, typeof navigator !== 'undefined' ? navigator.deviceMemory : null).text}
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

        {file && !file.remote && scan && localOffered && phase !== 'background' && (() => {
          // a crop keeps only its traces and samples: estimate on the kept bytes
          const bytes = cropOn && cropEst?.croppedBytes ? cropEst.croppedBytes : file.size;
          const est = localVsUploadEstimate({ bytes, readMBps: 60, uploadMBps: speed || null });
          return (
            <fieldset className="rounded-lg border border-pl-border p-3 space-y-2 text-sm text-pl-text" data-testid="sl-import-keep">
              <legend className="px-1 text-pl-muted">Where the seismic lives</legend>
              <label className="flex items-start gap-2">
                <input type="radio" name="sl-import-keep" checked={keepLocal} onChange={() => setKeepLocal(true)} disabled={busy} data-testid="sl-import-keep-local" />
                <span>
                  Keep on this computer
                  <span className="block text-xs text-pl-muted">
                    {`Nothing is uploaded. It takes ${durationWords(est.keepSeconds)} on a typical laptop drive and needs about ${sizeWords(est.diskBytes)} on the drive with your workspace folder. Attributes and inversion run here; colleagues see it as living on ${lws.workspace?.label || 'this computer'}.`}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="sl-import-keep" checked={!keepLocal} onChange={() => setKeepLocal(false)} disabled={busy} data-testid="sl-import-keep-cloud" />
                <span>
                  Upload to Petrolord
                  <span className="block text-xs text-pl-muted">
                    {est.uploadSeconds != null ? `The upload takes ${durationWords(est.uploadSeconds)} at your measured upload speed. ` : ''}Opens on any computer and counts against the cloud storage.
                  </span>
                </span>
              </label>
              {!projectStorage && currentProjectId() && (
                <label className="flex items-center gap-2 text-xs text-pl-muted">
                  <input type="checkbox" checked={rememberChoice} onChange={(e) => setRememberChoice(e.target.checked)} />
                  Use this choice for the rest of this project (you can change it in Projects, Seismic storage)
                </label>
              )}
              {keepLocal && !localReady(lws) && <LocalWorkspacePanel compact />}
            </fieldset>
          );
        })()}

        {file && !file.remote && scan && serverAdvice?.offer && !goLocal && phase !== 'background' && (
          <fieldset className="rounded-lg border border-pl-border p-3 space-y-2 text-sm text-pl-text" data-testid="sl-import-where">
            <legend className="px-1 text-pl-muted">Where to convert</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="sl-import-where" checked={useServer} onChange={() => { userChoseWhereRef.current = true; setUseServer(true); }} disabled={busy} />
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
              <input type="radio" name="sl-import-where" checked={!useServer} onChange={() => { userChoseWhereRef.current = true; setUseServer(false); }} disabled={busy} />
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
            disabled={startDisabled}
            title={startTitle}
            className="bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg"
          >
            <Play className="w-4 h-4 mr-2" />
            Start import
          </Button>
          {gathers && file && !file.remote && (
            <Button
              variant="outline"
              onClick={startGatherUpload}
              disabled={busy || phase === 'background' || Boolean(cropProblem) || domain === 'depth'}
              data-testid="sl-upload-gathers"
              title="The gathers go to the worker store; build the gather store in QI Studio, Prestack tab"
            >
              <Server className="w-4 h-4 mr-2" />
              Upload gathers for QI Studio
            </Button>
          )}
          {file && !file.remote && onViewNow && phase !== 'background' && !busy && (goLocal || useServer || useV4) && (
            // owner report 2026-10-17: viewing used to close the dialog before
            // the import started. This starts it, then shows the file.
            <Button
              variant="outline"
              onClick={startAndView}
              disabled={startDisabled}
              title={startTitle || 'Starts the import in the background and shows inlines and crosslines straight from this file while it converts'}
              data-testid="sl-import-start-view"
            >
              <Eye className="w-4 h-4 mr-2" />
              Start import and view now
            </Button>
          )}
          {file && !file.remote && onViewNow && phase !== 'background' && !busy && (
            <Button
              variant="ghost"
              onClick={() => onViewNow(file, mapping)}
              title="Shows inlines and crosslines straight from the file. Nothing is imported until you start the import; this setup stays under Import until then."
              data-testid="sl-import-preview"
            >
              Preview without importing
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
