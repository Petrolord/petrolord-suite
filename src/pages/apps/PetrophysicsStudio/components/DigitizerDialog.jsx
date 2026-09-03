// Log digitizer (Petrophysics Studio G2.6, rebuilt at PT7): a scanned
// log image in, a NEW registry curve out. Steps: load -> calibrate
// (two depth lines, two value lines, values typed inline) -> trace
// (automatic colour trace inside a box, or click by click) -> review
// (drag, add, remove points) -> save as <MNEM>_DIG.
//
// "Read this scan" asks the petro-scan-read edge function what is printed
// on the header and shows it as a proposal; Accept only fills the form.
// Neither the reader nor the tracer ever writes: the user checks the
// preview and presses Save. Provenance records the mode, the box, the
// colour, the edits and the AI reading so downstream apps know exactly
// how the curve was made. Everything below works in NATURAL image pixels
// (ScanCanvas owns the display scale).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Image as ImageIcon, Sparkles, Undo2, Wand2, MousePointerClick } from 'lucide-react';
import { digitizeCurve } from '../engine/digitizer';
import { traceColorRoi } from '../engine/scanTrace';
import { digitizedCurveName } from '@/lib/curveNames';
import { imageToImageData, imageToDataUrl } from '../services/scanImage';
import { proposalToCalibration, proposalEdited } from '../services/scanProposal';
import { toDisplay, fromDisplay } from '../viewer/depthModes';
import ScanCanvas from './digitizer/ScanCanvas';
import ProposalCard from './digitizer/ProposalCard';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const SLOTS = ['d0', 'd1', 'v0', 'v1'];
const emptyCal = () => ({ d0: { pixel: null, text: '' }, d1: { pixel: null, text: '' }, v0: { pixel: null, text: '' }, v1: { pixel: null, text: '' } });
const fmt = (v, digits = 2) => (Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : '');

export default function DigitizerDialog({
  open, onOpenChange, wellName, onSave,
  existingMnemonics = [], depthUnit = 'm', canReadScan = false, onReadScan,
}) {
  const imgRef = useRef(null);
  const imageDataRef = useRef(null);
  const [img, setImg] = useState(null);           // {url, width, height, name}
  const [imgReady, setImgReady] = useState(false);
  const [step, setStep] = useState('load');       // load|calibrate|trace|review
  const [cal, setCal] = useState(emptyCal);       // slot -> {pixel, text (display unit for depths)}
  const [armed, setArmed] = useState('d0');
  const [assumedEdges, setAssumedEdges] = useState(false);
  const [meta, setMeta] = useState({ mnemonic: 'GR', unit: 'GAPI', step: '0.5', valueLog: false });
  const [mode, setMode] = useState('auto');        // auto|manual
  const [roi, setRoi] = useState(null);
  const [seed, setSeed] = useState(null);
  const [seedHex, setSeedHex] = useState(null);
  const [tolerance, setTolerance] = useState(1);
  const [points, setPoints] = useState([]);
  const [history, setHistory] = useState([]);
  const [edits, setEdits] = useState(0);
  const [traceStats, setTraceStats] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [proposal, setProposal] = useState(null);  // {original, current, model, prompt_version}
  const [aiUsed, setAiUsed] = useState(null);      // recorded at Accept
  const [reading, setReading] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedName, setSavedName] = useState(null);

  const reset = () => {
    if (img?.url) URL.revokeObjectURL(img.url);
    imageDataRef.current = null;
    setImg(null); setImgReady(false); setStep('load'); setCal(emptyCal()); setArmed('d0'); setAssumedEdges(false);
    setMode('auto'); setRoi(null); setSeed(null); setSeedHex(null); setTolerance(1);
    setPoints([]); setHistory([]); setEdits(0); setTraceStats(null); setHoverIndex(null);
    setProposal(null); setAiUsed(null); setReading(false); setTracing(false); setBusy(false); setError(null); setSavedName(null);
  };
  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const loadImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (img?.url) URL.revokeObjectURL(img.url);
    imageDataRef.current = null;
    const url = URL.createObjectURL(f);
    setImg({ url, width: 0, height: 0, name: f.name });
    setImgReady(false);
    setCal(emptyCal()); setArmed('d0'); setAssumedEdges(false); setRoi(null); setSeed(null);
    setPoints([]); setHistory([]); setEdits(0); setTraceStats(null); setProposal(null); setAiUsed(null); setSavedName(null); setError(null);
    setStep('calibrate');
  };
  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    setImg((i) => (i ? { ...i, width: el.naturalWidth, height: el.naturalHeight } : i));
    setImgReady(true);
  };
  const imageData = () => {
    if (!imageDataRef.current) imageDataRef.current = imageToImageData(imgRef.current);
    return imageDataRef.current;
  };

  // ---- calibration -------------------------------------------------------
  const depthCal = useMemo(() => [cal.d0, cal.d1].map((c) => ({ pixel: c.pixel, value: fromDisplay(Number(c.text), depthUnit) })), [cal, depthUnit]);
  const valueCal = useMemo(() => [cal.v0, cal.v1].map((c) => ({ pixel: c.pixel, value: Number(c.text) })), [cal]);
  const calProblem = useMemo(() => {
    for (const k of SLOTS) {
      if (cal[k].pixel == null) return `Pick the ${k[0] === 'd' ? 'depth' : 'value'} reference line ${k[1] === '0' ? 1 : 2} on the image.`;
      if (cal[k].text === '' || !Number.isFinite(Number(cal[k].text))) return `Type the ${k[0] === 'd' ? 'depth' : 'value'} at reference line ${k[1] === '0' ? 1 : 2}.`;
    }
    if (cal.d0.pixel === cal.d1.pixel) return 'The two depth lines must sit at different rows.';
    if (cal.v0.pixel === cal.v1.pixel) return 'The two value lines must sit at different columns.';
    if (Number(cal.d0.text) === Number(cal.d1.text)) return 'The two depths must differ.';
    if (Number(cal.v0.text) === Number(cal.v1.text)) return 'The two values must differ.';
    if (meta.valueLog && (Number(cal.v0.text) <= 0 || Number(cal.v1.text) <= 0)) return 'A log axis needs positive reference values.';
    return null;
  }, [cal, meta.valueLog]);

  const nextArmed = (c) => SLOTS.find((k) => c[k].pixel == null) || null;
  const setPixel = (slot, pixel) => {
    setCal((c) => {
      const next = { ...c, [slot]: { ...c[slot], pixel: Math.round(pixel * 10) / 10 } };
      setArmed(nextArmed(next));
      return next;
    });
    setAssumedEdges(false);
  };
  const onCalibratePoint = (pt) => {
    if (!armed) return;
    setPixel(armed, armed[0] === 'd' ? pt.y : pt.x);
  };

  // ---- AI read -----------------------------------------------------------
  const readScan = async () => {
    setError(null);
    setReading(true);
    try {
      const { dataUrl, width, height } = imageToDataUrl(imgRef.current);
      const r = await onReadScan({
        image: dataUrl,
        hints: { mnemonic: meta.mnemonic, unit: meta.unit, depthUnit, wellName, imageWidth: width, imageHeight: height },
      });
      setProposal({ original: r.proposal, current: r.proposal, model: r.model, prompt_version: r.prompt_version });
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  };
  const acceptProposal = () => {
    if (!proposal) return;
    const c = proposalToCalibration(proposal.current, { width: img.width, height: img.height });
    setMeta((m) => ({
      ...m,
      mnemonic: c.mnemonic || m.mnemonic,
      unit: c.unit ?? m.unit,
      valueLog: c.valueLog,
    }));
    setCal((prev) => {
      const next = { ...prev };
      if (c.depthCal) {
        next.d0 = { pixel: prev.d0.pixel ?? c.depthCal[0].pixel, text: fmt(toDisplay(c.depthCal[0].value, depthUnit)) };
        next.d1 = { pixel: prev.d1.pixel ?? c.depthCal[1].pixel, text: fmt(toDisplay(c.depthCal[1].value, depthUnit)) };
      }
      if (c.valueCal) {
        next.v0 = { pixel: prev.v0.pixel ?? c.valueCal[0].pixel, text: fmt(c.valueCal[0].value, 4) };
        next.v1 = { pixel: prev.v1.pixel ?? c.valueCal[1].pixel, text: fmt(c.valueCal[1].value, 4) };
      }
      setArmed(nextArmed(next));
      return next;
    });
    const anyPixelWasEmpty = SLOTS.some((k) => cal[k].pixel == null);
    setAssumedEdges(c.assumedEdges && anyPixelWasEmpty);
    if (c.seedHex) setSeedHex(c.seedHex);
    setAiUsed({
      model: proposal.model, prompt_version: proposal.prompt_version, accepted: true,
      edited: proposalEdited(proposal.original, proposal.current), confidence: proposal.current.confidence ?? null,
      depth_unit_in: c.depthUnitIn,
    });
    setProposal(null);
  };
  const dismissProposal = () => {
    if (proposal) setAiUsed({ model: proposal.model, prompt_version: proposal.prompt_version, accepted: false, edited: [], confidence: proposal.current.confidence ?? null });
    setProposal(null);
  };

  // ---- tracing -------------------------------------------------------------
  const pushHistory = useCallback(() => setHistory((h) => [...h.slice(-49), points]), [points]);
  const runTrace = () => {
    setError(null);
    setTracing(true);
    setTimeout(() => {
      try {
        const { points: pts, stats } = traceColorRoi(imageData(), { roi, tolerance, seed, seedHex: seed ? null : seedHex });
        setPoints(pts);
        setHistory([]);
        setEdits(0);
        setTraceStats(stats);
        setStep('review');
      } catch (e) {
        setError(e.message);
      } finally {
        setTracing(false);
      }
    }, 0);
  };
  const onManualPoint = (pt) => { pushHistory(); setPoints((p) => [...p, pt]); };
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setPoints(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };
  const movePoint = (i, pt, done) => {
    setPoints((p) => p.map((q, j) => (j === i ? pt : q)));
    if (done) setEdits((n) => n + 1);
  };
  const movePointStart = useRef(false);
  const onMovePoint = (i, pt, done) => {
    if (!movePointStart.current) { pushHistory(); movePointStart.current = true; }
    movePoint(i, pt, done);
    if (done) movePointStart.current = false;
  };
  const removePoint = (i) => { pushHistory(); setPoints((p) => p.filter((_, j) => j !== i)); setEdits((n) => n + 1); setHoverIndex(null); };
  const addPointInReview = (pt) => {
    pushHistory();
    setPoints((p) => {
      const next = [...p, pt].sort((a, b) => a.y - b.y);
      return next;
    });
    setEdits((n) => n + 1);
  };

  // ---- preview + save -------------------------------------------------------
  const saveName = digitizedCurveName(meta.mnemonic || 'CURVE', existingMnemonics);
  const buildLog = () => digitizeCurve({
    points,
    depthCal, valueCal, valueLog: meta.valueLog,
    step: Number(meta.step), mnemonic: saveName,
    unit: meta.unit.trim() || null, sourceImage: img?.name,
    provenance: {
      mode: step === 'review' && traceStats ? 'auto' : 'manual',
      roi: traceStats?.roi || null,
      tolerance: traceStats ? traceStats.tolerance : null,
      seed_color_hex: traceStats?.seed_color?.hex || null,
      trace_stats: traceStats ? { rows_hit: traceStats.rows_hit, rows_total: traceStats.rows_total, rejected: traceStats.rejected } : null,
      edited_points: edits,
      ai_calibration: aiUsed,
      image_px: img ? { width: img.width, height: img.height } : null,
      calibration: { depth: depthCal, value: valueCal, assumed_edges: assumedEdges },
      depth_unit_entered: depthUnit,
    },
  });
  const preview = useMemo(() => {
    if (step !== 'review' || points.length < 2 || calProblem) return null;
    try {
      const stepM = Number(meta.step);
      if (!(stepM > 0)) return { error: 'Depth step must be positive.' };
      const log = digitizeCurve({ points, depthCal, valueCal, valueLog: meta.valueLog, step: stepM, mnemonic: 'X' });
      let lo = Infinity; let hi = -Infinity;
      for (const v of log.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
      return { n: log.nSamples, top: log.startMdM, base: log.stopMdM, lo, hi };
    } catch (e) {
      return { error: e.message };
    }
  }, [step, points, depthCal, valueCal, meta.valueLog, meta.step, calProblem]);

  const save = async () => {
    setError(null);
    if (!meta.mnemonic.trim()) { setError('Name the curve (mnemonic).'); return; }
    if (!(Number(meta.step) > 0)) { setError('Depth step must be positive.'); return; }
    if (calProblem) { setError(calProblem); return; }
    if (points.length < 2) { setError('Trace at least two points on the curve.'); return; }
    setBusy(true);
    try {
      const saved = await onSave(buildLog());
      // keep the image and calibration for the next curve on the same scan
      setSavedName(saved?.mnemonic || saveName);
      setPoints([]); setHistory([]); setEdits(0); setTraceStats(null); setRoi(null); setSeed(null);
      setStep('trace');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unitLabel = depthUnit === 'ft' ? 'ft' : 'm';
  const instruction = {
    load: 'Load a scanned log image to begin.',
    calibrate: armed
      ? `Click the ${armed[0] === 'd' ? 'depth' : 'value'} reference line ${armed[1] === '0' ? 1 : 2} on the image, then type its ${armed[0] === 'd' ? `depth (${unitLabel} MD)` : 'value'} in the row.`
      : (calProblem || 'Calibration complete. Go to Trace.'),
    trace: mode === 'auto'
      ? 'Drag a box around the curve (or use the whole image). Shift-click a point on the curve to pick its colour, then Trace.'
      : `Click along the curve (${points.length} points), then Review.`,
    review: 'Check the red trace. Drag a point to move it, click empty space to add one, Alt-click or right-click to remove one.',
  }[step];
  const interaction = step === 'calibrate' ? 'calibrate' : step === 'trace' ? (mode === 'auto' ? 'roi' : 'manual') : step === 'review' ? 'review' : null;

  const calRow = (slot, label) => {
    const c = cal[slot];
    const isDepth = slot[0] === 'd';
    const idx = slot[1];
    return (
      <div key={slot} className={`flex items-center gap-1.5 ${armed === slot && step === 'calibrate' ? 'text-cyan-200' : 'text-slate-300'}`}>
        <button type="button" className={`px-1.5 py-0.5 rounded border text-[11px] ${armed === slot && step === 'calibrate' ? 'border-cyan-500 bg-cyan-500/15' : 'border-slate-700 hover:border-slate-500'}`}
          data-testid={`petro-digitizer-pick-${isDepth ? 'depth' : 'value'}-${idx}`}
          onClick={() => { setStep('calibrate'); setArmed(slot); }}>
          {label}
        </button>
        <span className="w-16 text-slate-500 tabular-nums">{c.pixel == null ? 'no pixel' : `px ${Math.round(c.pixel)}`}</span>
        <input className={`${inputCls} w-24`} value={c.text} inputMode="decimal"
          placeholder={isDepth ? `${unitLabel} MD` : 'value'}
          data-testid={`petro-digitizer-cal-${isDepth ? 'depth' : 'value'}-${idx}`}
          onChange={(e) => setCal((p) => ({ ...p, [slot]: { ...p[slot], text: e.target.value } }))} />
      </div>
    );
  };

  const canGoTrace = !calProblem && imgReady;
  const canSave = step === 'review' && points.length >= 2 && !calProblem && !busy && !preview?.error;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-digitizer">
        <DialogHeader>
          <DialogTitle>Digitize a curve from a scan, {wellName}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Calibrate, trace automatically or by hand, review, save. Every saved curve is a new row named
            {' '}<span className="text-slate-200 font-mono" data-testid="petro-digitizer-savename">{saveName}</span> and flagged digitized.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-3">
          {/* picture */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 cursor-pointer">
                <ImageIcon className="w-3.5 h-3.5" /> {img ? 'Replace image' : 'Load image…'}
                <input type="file" accept="image/*" className="hidden" data-testid="petro-digitizer-file" onChange={loadImage} />
              </label>
              {img && canReadScan && (
                <Button size="sm" variant="outline" className="h-7 border-violet-700/60 text-violet-200 hover:bg-violet-500/10"
                  disabled={reading || !imgReady} data-testid="petro-digitizer-ai-read" onClick={readScan}
                  title="Ask the scan reader what is printed on the header. It proposes values; you confirm them.">
                  {reading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  Read this scan (AI)
                </Button>
              )}
              {img && (
                <span className="text-slate-500 truncate">{img.name}{img.width ? ` (${img.width} x ${img.height} px)` : ''}</span>
              )}
            </div>
            <p className="text-xs text-cyan-300" data-testid="petro-digitizer-instruction">{instruction}</p>
            {proposal && (
              <ProposalCard proposal={proposal.current} meta={proposal}
                onChange={(cur) => setProposal((p) => ({ ...p, current: cur }))}
                onAccept={acceptProposal} onDismiss={dismissProposal} />
            )}
            {assumedEdges && step === 'calibrate' && (
              <p className="text-[11px] text-amber-300" data-testid="petro-digitizer-assumed">
                Reference pixels were assumed at the image edges. If the plot area is inset, pick the real lines with the row buttons.
              </p>
            )}
            <div className="bg-slate-950 rounded border border-slate-800 overflow-auto max-h-[56vh]">
              {img ? (
                <>
                  <img ref={imgRef} src={img.url} alt="" className="hidden" onLoad={onImgLoad} />
                  {imgReady ? (
                    <ScanCanvas imgEl={imgRef.current} width={img.width} height={img.height} interaction={interaction}
                      depthCal={[cal.d0, cal.d1]} valueCal={[cal.v0, cal.v1]} roi={roi} seed={seed}
                      points={points} hoverIndex={hoverIndex}
                      onPoint={step === 'calibrate' ? onCalibratePoint : step === 'trace' ? onManualPoint : addPointInReview}
                      onSeed={(pt) => { setSeed(pt); setSeedHex(null); }}
                      onRoi={setRoi} onMovePoint={onMovePoint} onRemovePoint={removePoint} onHover={setHoverIndex} />
                  ) : (
                    <div className="h-40 flex items-center justify-center text-slate-600 text-xs">Decoding image…</div>
                  )}
                </>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-600 text-xs">No image loaded</div>
              )}
            </div>
            {error && <div className="text-xs text-red-400" data-testid="petro-digitizer-error">{error}</div>}
            {savedName && (
              <div className="text-xs text-emerald-300" data-testid="petro-digitizer-saved">
                Saved {savedName}. Trace another curve on this scan or close.
              </div>
            )}
          </div>

          {/* controls */}
          <div className="space-y-3 text-xs">
            <section className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Curve</div>
              <div className="flex items-center gap-1.5">
                <input className={`${inputCls} w-24`} placeholder="Mnemonic" value={meta.mnemonic}
                  data-testid="petro-digitizer-mnemonic" onChange={(e) => setMeta((m) => ({ ...m, mnemonic: e.target.value.toUpperCase() }))} />
                <input className={`${inputCls} w-16`} placeholder="Unit" value={meta.unit}
                  data-testid="petro-digitizer-unit" onChange={(e) => setMeta((m) => ({ ...m, unit: e.target.value }))} />
                <input className={`${inputCls} w-16`} placeholder="Step m" value={meta.step} title="Depth step of the saved curve, metres"
                  data-testid="petro-digitizer-step" onChange={(e) => setMeta((m) => ({ ...m, step: e.target.value }))} />
              </div>
              <label className="inline-flex items-center gap-1 text-slate-400">
                <input type="checkbox" checked={meta.valueLog} data-testid="petro-digitizer-log"
                  onChange={(e) => setMeta((m) => ({ ...m, valueLog: e.target.checked }))} /> logarithmic value axis
              </label>
            </section>

            <section className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Calibration</div>
              {calRow('d0', 'Depth 1')}
              {calRow('d1', 'Depth 2')}
              {calRow('v0', 'Value 1')}
              {calRow('v1', 'Value 2')}
              {step === 'calibrate' && (
                <Button size="sm" className="h-7 w-full bg-cyan-600 hover:bg-cyan-500 text-white" disabled={!canGoTrace}
                  data-testid="petro-digitizer-to-trace" onClick={() => { setStep('trace'); setError(null); }}>
                  Go to trace
                </Button>
              )}
            </section>

            {(step === 'trace' || step === 'review') && (
              <section className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Trace</div>
                <div className="flex gap-1">
                  <button type="button" data-testid="petro-digitizer-mode-auto"
                    className={`flex-1 px-2 py-1 rounded border ${mode === 'auto' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
                    onClick={() => { setMode('auto'); setStep('trace'); }}>
                    <Wand2 className="w-3 h-3 inline mr-1" />Automatic
                  </button>
                  <button type="button" data-testid="petro-digitizer-mode-manual"
                    className={`flex-1 px-2 py-1 rounded border ${mode === 'manual' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
                    onClick={() => { setMode('manual'); setStep('trace'); }}>
                    <MousePointerClick className="w-3 h-3 inline mr-1" />By hand
                  </button>
                </div>
                {mode === 'auto' && step === 'trace' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300" data-testid="petro-digitizer-roi-all"
                        onClick={() => setRoi({ x1: 0, y1: 0, x2: img.width, y2: img.height })}>
                        Whole image
                      </Button>
                      <span className="text-slate-500">{roi ? `box ${Math.round(Math.abs(roi.x2 - roi.x1))} x ${Math.round(Math.abs(roi.y2 - roi.y1))} px` : 'no box yet'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Colour</span>
                      <span className="inline-block w-4 h-4 rounded border border-slate-600" style={{ background: seed ? 'transparent' : (seedHex || 'transparent') }} />
                      <span className="text-slate-500">{seed ? `picked at ${Math.round(seed.x)}, ${Math.round(seed.y)}` : (seedHex || 'box centre')}</span>
                    </div>
                    <label className="flex items-center gap-2 text-slate-400">
                      Tolerance
                      <input type="range" min="0.5" max="3" step="0.1" value={tolerance} data-testid="petro-digitizer-tolerance"
                        onChange={(e) => setTolerance(Number(e.target.value))} className="flex-1" />
                      <span className="w-7 tabular-nums">{tolerance.toFixed(1)}</span>
                    </label>
                    <Button size="sm" className="h-7 w-full bg-cyan-600 hover:bg-cyan-500 text-white" disabled={!roi || tracing}
                      data-testid="petro-digitizer-trace" onClick={runTrace}>
                      {tracing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                      Trace
                    </Button>
                  </>
                )}
                {mode === 'manual' && step === 'trace' && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300" disabled={!history.length}
                      data-testid="petro-digitizer-undo" onClick={undo}>
                      <Undo2 className="w-3.5 h-3.5 mr-1" />Undo
                    </Button>
                    <Button size="sm" className="h-7 flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" disabled={points.length < 2}
                      data-testid="petro-digitizer-to-review" onClick={() => setStep('review')}>
                      Review {points.length} points
                    </Button>
                  </div>
                )}
                {step === 'review' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300" disabled={!history.length}
                        data-testid="petro-digitizer-undo" onClick={undo}>
                        <Undo2 className="w-3.5 h-3.5 mr-1" />Undo
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300"
                        data-testid="petro-digitizer-retrace" onClick={() => { setStep('trace'); setError(null); }}>
                        Back to trace
                      </Button>
                    </div>
                    {traceStats && (
                      <div className="text-slate-500" data-testid="petro-digitizer-trace-stats">
                        {traceStats.rows_hit} of {traceStats.rows_total} rows hit, {traceStats.rejected} rejected, colour {traceStats.seed_color.hex}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {step === 'review' && (
              <section className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Preview</div>
                <div className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-300" data-testid="petro-digitizer-preview">
                  {preview?.error ? <span className="text-red-400">{preview.error}</span>
                    : preview ? (
                      <>
                        {points.length} points, {edits} edited. {preview.n} samples from {fmt(toDisplay(preview.top, depthUnit), 1)} to {fmt(toDisplay(preview.base, depthUnit), 1)} {unitLabel} MD.
                        {' '}Values {fmt(preview.lo, 2)} to {fmt(preview.hi, 2)}{meta.unit ? ` ${meta.unit}` : ''}.
                      </>
                    ) : 'Trace at least two points.'}
                </div>
              </section>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => close(false)}>
            Close
          </Button>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white" disabled={!canSave}
            data-testid="petro-digitizer-save" onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save as {saveName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
