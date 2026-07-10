import React, { useRef, useState } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle, Play, Ban,
  Wand2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { MAPPING_PRESETS, DEFAULT_MAPPING } from '../engine/segyScan';
import { scanFile, ingestVolume } from '../services/ingestService';

const fmtInt = (v) => (v == null ? '—' : v.toLocaleString('en-US'));

const PHASE_LABEL = {
  scan: 'Scanning trace headers',
  transcode: 'Transcoding to bricks',
  upload: 'Uploading bricks',
};

export default function ImportPanel({ onIngested }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const cancelRef = useRef(null);

  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({ ilByte: DEFAULT_MAPPING.ilByte, xlByte: DEFAULT_MAPPING.xlByte });
  const [phase, setPhase] = useState('idle'); // idle|scanning|scanned|ingesting|done|error
  const [scanData, setScanData] = useState(null);
  const [detection, setDetection] = useState(null);
  const [showHeader, setShowHeader] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const scanSeqRef = useRef(0);

  // autodetect=true lets Seismolord pick the inline/crossline byte layout
  // itself so a non-expert never touches a byte field; manual edits from
  // the Advanced panel re-scan with autodetect off.
  const runScan = async (f, m, autodetect) => {
    const seq = ++scanSeqRef.current;
    setPhase('scanning');
    setError(null);
    setScanData(null);
    try {
      const data = await scanFile(f, m, undefined, autodetect);
      if (seq !== scanSeqRef.current) return;   // a newer scan superseded this one
      setScanData(data);
      if (autodetect && data.detection) {
        setDetection(data.detection);
        if (data.mapping) {
          setMapping({ ilByte: data.mapping.ilByte, xlByte: data.mapping.xlByte });
        }
        if (!data.detection.detected) setShowAdvanced(true);   // reveal manual controls
      }
      setPhase('scanned');
    } catch (e) {
      if (seq === scanSeqRef.current) { setError(e.message); setPhase('error'); }
    }
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setDetection(null);
    setShowAdvanced(false);
    runScan(f, mapping, true);                  // auto-detect on open
  };

  const onMappingChange = (next) => {
    const m = { ...mapping, ...next };
    setMapping(m);
    setDetection(null);                         // user is overriding detection
    if (file) runScan(file, m, false);
  };

  const reDetect = () => {
    if (file) { setShowAdvanced(false); runScan(file, mapping, true); }
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

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Upload className="w-5 h-5 mr-2 text-cyan-400" />
          Import SEG-Y volume
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
            {/* Auto-detection outcome — the user normally acts only on this */}
            {detection && detection.detected && (
              <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/25 p-3 text-sm text-emerald-200 flex items-start">
                <Wand2 className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span>
                  Header layout detected automatically — inline at byte {detection.mapping.ilByte},
                  crossline at byte {detection.mapping.xlByte}
                  {detection.coords
                    ? `, coordinates at ${detection.coords.xByte}/${detection.coords.yByte}`
                    : ' (no world coordinates found — export will lack real X/Y)'}.
                  {detection.confidence === 'low' && ' Confidence is low — check the geometry below.'}
                  {' '}You can just click Start import.
                </span>
              </div>
            )}
            {detection && !detection.detected && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200 flex items-start">
                <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span>{detection.note}</span>
              </div>
            )}

            {/* Advanced: manual byte mapping — hidden by default so
                non-experts never see it; auto-opened if detection fails. */}
            <div className="rounded-lg border border-slate-800">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300"
                onClick={() => setShowAdvanced((s) => !s)}
              >
                <span className="flex items-center">
                  {showAdvanced ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                  Advanced — header byte mapping
                </span>
                {!showAdvanced && (
                  <span className="text-xs text-slate-500">
                    IL {mapping.ilByte} · XL {mapping.xlByte}
                  </span>
                )}
              </button>
              {showAdvanced && (
                <div className="p-3 pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Only needed if auto-detection got it wrong. The textual header can lie —
                      geometry below is measured from the bytes you choose.
                    </p>
                    <Button variant="outline" size="sm" onClick={reDetect} disabled={phase === 'ingesting'}>
                      <Wand2 className="w-3.5 h-3.5 mr-1" /> Re-detect
                    </Button>
                  </div>
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
              {scan.sampled && (
                <div className="col-span-full text-slate-400">
                  Preview from sampled headers — every trace is validated during import.
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
            disabled={!scan || phase === 'ingesting' || phase === 'scanning'}
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
      </CardContent>
    </Card>
  );
}
