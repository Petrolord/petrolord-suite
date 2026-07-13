// Log digitizer import wizard (Petrophysics Studio G2.6): load a
// scanned log image, calibrate the depth and value axes with two
// clicks each, trace the curve, and save it to the selected well as a
// utility-grade digitized curve. The numeric work lives in
// engine/digitizer.js (jest-validated); this is the click surface.
//
// Steps cycle: 'depth' (2 clicks) -> 'value' (2 clicks) -> 'trace'
// (many clicks) -> save. Each calibration click prompts for the real
// value at that pixel.

import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { digitizeCurve } from '../engine/digitizer';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';

export default function DigitizerDialog({ open, onOpenChange, wellName, onSave }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [step, setStep] = useState('load');   // load|depth|value|trace
  const [depthCal, setDepthCal] = useState([]);   // [{pixel(y), value}]
  const [valueCal, setValueCal] = useState([]);   // [{pixel(x), value}]
  const [trace, setTrace] = useState([]);         // [{x, y}]
  const [meta, setMeta] = useState({ mnemonic: 'GR', unit: 'GAPI', step: '0.5', valueLog: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setImgUrl(null); setStep('load'); setDepthCal([]); setValueCal([]);
    setTrace([]); setBusy(false); setError(null);
  };
  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const loadImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImgUrl(URL.createObjectURL(f));
    setMeta((m) => ({ ...m, source: f.name }));
    setStep('depth');
  };

  // draw image + calibration/trace overlays
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgUrl) return;
    const draw = () => {
      const w = Math.min(520, img.naturalWidth || 400);
      const scale = w / (img.naturalWidth || 400);
      const h = (img.naturalHeight || 600) * scale;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // depth calibration marks (horizontal)
      ctx.strokeStyle = '#22d3ee';
      for (const c of depthCal) {
        ctx.beginPath(); ctx.moveTo(0, c.pixel); ctx.lineTo(w, c.pixel); ctx.stroke();
      }
      ctx.strokeStyle = '#fbbf24';
      for (const c of valueCal) {
        ctx.beginPath(); ctx.moveTo(c.pixel, 0); ctx.lineTo(c.pixel, h); ctx.stroke();
      }
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      trace.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke();
      for (const p of trace) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    };
    if (img.complete) draw();
    else img.onload = draw;
  }, [imgUrl, depthCal, valueCal, trace]);

  const onCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (step === 'depth' && depthCal.length < 2) {
      // eslint-disable-next-line no-alert
      const v = Number(window.prompt(`Depth (m MD) at this line? (point ${depthCal.length + 1} of 2)`));
      if (Number.isFinite(v)) {
        const next = [...depthCal, { pixel: y, value: v }];
        setDepthCal(next);
        if (next.length === 2) setStep('value');
      }
    } else if (step === 'value' && valueCal.length < 2) {
      // eslint-disable-next-line no-alert
      const v = Number(window.prompt(`${meta.mnemonic} value at this line? (point ${valueCal.length + 1} of 2)`));
      if (Number.isFinite(v)) {
        const next = [...valueCal, { pixel: x, value: v }];
        setValueCal(next);
        if (next.length === 2) setStep('trace');
      }
    } else if (step === 'trace') {
      setTrace((t) => [...t, { x, y }]);
    }
  };

  const save = async () => {
    setError(null);
    const stepM = Number(meta.step);
    if (!meta.mnemonic.trim()) { setError('Name the curve (mnemonic).'); return; }
    if (!(stepM > 0)) { setError('Depth step must be positive.'); return; }
    if (trace.length < 2) { setError('Trace at least two points on the curve.'); return; }
    setBusy(true);
    try {
      const log = digitizeCurve({
        points: trace,
        depthCal, valueCal, valueLog: meta.valueLog,
        step: stepM, mnemonic: meta.mnemonic.trim().toUpperCase(),
        unit: meta.unit.trim() || null, sourceImage: meta.source,
      });
      await onSave(log);
      close(false);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const stepLabel = {
    load: 'Load a scanned log image to begin.',
    depth: `Click two DEPTH reference lines on the image (${depthCal.length}/2).`,
    value: `Click two ${meta.mnemonic} VALUE reference lines (${valueCal.length}/2).`,
    trace: `Click along the curve (${trace.length} points). Adjust settings, then Save.`,
  }[step];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-digitizer">
        <DialogHeader>
          <DialogTitle>Digitize log — {wellName}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Utility-grade: a hand trace is only as accurate as the clicks. Saved curves are flagged digitized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 cursor-pointer">
              <ImageIcon className="w-3.5 h-3.5" /> {imgUrl ? 'Replace image' : 'Load image…'}
              <input type="file" accept="image/*" className="hidden" data-testid="petro-digitizer-file" onChange={loadImage} />
            </label>
            <input className={`${inputCls} w-20`} placeholder="Mnemonic" value={meta.mnemonic}
              data-testid="petro-digitizer-mnemonic" onChange={(e) => setMeta((m) => ({ ...m, mnemonic: e.target.value }))} />
            <input className={`${inputCls} w-16`} placeholder="Unit" value={meta.unit}
              onChange={(e) => setMeta((m) => ({ ...m, unit: e.target.value }))} />
            <input className={`${inputCls} w-16`} placeholder="Step m" value={meta.step}
              data-testid="petro-digitizer-step" onChange={(e) => setMeta((m) => ({ ...m, step: e.target.value }))} />
            <label className="inline-flex items-center gap-1 text-slate-400">
              <input type="checkbox" checked={meta.valueLog}
                onChange={(e) => setMeta((m) => ({ ...m, valueLog: e.target.checked }))} /> log value axis
            </label>
            {step === 'trace' && (
              <button type="button" className="text-slate-500 hover:text-slate-300"
                data-testid="petro-digitizer-undo" onClick={() => setTrace((t) => t.slice(0, -1))}>
                undo point
              </button>
            )}
          </div>

          <p className="text-xs text-cyan-300" data-testid="petro-digitizer-instruction">{stepLabel}</p>

          <div className="bg-slate-950 rounded border border-slate-800 overflow-auto max-h-[52vh]">
            {imgUrl ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                <img ref={imgRef} src={imgUrl} alt="" className="hidden" />
                <canvas ref={canvasRef} data-testid="petro-digitizer-canvas"
                  className="cursor-crosshair" onClick={onCanvasClick} />
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-600 text-xs">
                No image loaded
              </div>
            )}
          </div>
          {error && <div className="text-xs text-red-400" data-testid="petro-digitizer-error">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white"
            disabled={busy || step !== 'trace' || trace.length < 2}
            data-testid="petro-digitizer-save" onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save digitized curve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
