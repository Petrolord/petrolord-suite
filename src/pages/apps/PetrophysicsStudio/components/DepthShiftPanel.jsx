// Depth shift view (Petrophysics Studio PT11c, 2026-09-10): stretch and
// squeeze a curve against a reference through user-placed tie points.
// Reference and target side by side on one depth axis, click-to-place ties
// (reference track first, then the target track), drag a mark to adjust,
// a shift-versus-depth track, undo, reset to raw, and Save to a new
// `<KEY>_DS` registry curve whose provenance carries the tie pairs and
// every edit (who, when, pairs). The raw curve is never written; the
// stored pairs are re-applied on open (apply on read) and any mismatch
// with the stored samples is reported rather than hidden.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, RotateCcw, Save, MousePointerClick, Trash2 } from 'lucide-react';
import TrackViewer from './TrackViewer';
import { tiePointWarp } from '../engine/conditioning';
import {
  applyTies, buildShiftLog, dsName, isDsName, shiftLogFor, shiftOfLog, shiftTracks, verifyStoredShift,
} from '../services/depthShift';

const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs max-w-full';
const inputCls = 'w-20 rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-[11px] font-mono';
const btnCls = 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed';

const TIE_TRACKS = { ref: 0, target: 1 };
const toTies = (pairs) => pairs.map(([refMd, targetMd]) => ({ refMd, targetMd }));

export default function DepthShiftPanel({
  wellData, backend, projectId, depthUnit = 'm', snapSamples = false, onSaved, onStatus, isOwn = true,
}) {
  const mnemonics = useMemo(() => Object.keys(wellData?.logs || {}).filter((m) => m !== 'DEPT'), [wellData]);
  const sources = useMemo(() => mnemonics.filter((m) => !isDsName(m)), [mnemonics]);
  const [srcKey, setSrcKey] = useState(() => sources.find((m) => m === 'GR') || sources[0] || '');
  const [refKey, setRefKey] = useState(() => mnemonics.find((m) => m !== srcKey && m !== dsName(srcKey)) || '');
  const [pairs, setPairs] = useState([]);
  const [pending, setPending] = useState(null);       // { refMd } after the reference click
  const [placing, setPlacing] = useState(false);       // pickMode 'tie' on the tracks
  const [history, setHistory] = useState([]);          // undo stack of pair lists
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);        // the engine's refusal sentence
  const [drafts, setDrafts] = useState({});            // typed cell values until blur; a refused edit snaps back
  const loadedFor = useRef(null);

  const existing = useMemo(() => shiftLogFor(wellData?.allLogs, srcKey), [wellData, srcKey]);
  const depth = wellData?.curves?.DEPT;
  const raw = wellData?.logs?.[srcKey];
  const refData = wellData?.logs?.[refKey];
  const unitOf = useCallback((m) => (wellData?.allLogs || []).find((l) => l.mnemonic === m)?.unit || '', [wellData]);

  // apply on read: a saved shift's pairs come back from the row; the
  // reference it was made against is restored too
  useEffect(() => {
    if (!wellData || loadedFor.current === `${wellData.wellId}:${srcKey}`) return;
    loadedFor.current = `${wellData.wellId}:${srcKey}`;
    const stored = shiftOfLog(existing);
    setPairs(stored ? stored.pairs.map(([r, t]) => [r, t]) : []);
    setHistory([]);
    setPending(null);
    setProblem(null);
    if (stored?.reference?.mnemonic && wellData.logs[stored.reference.mnemonic]) setRefKey(stored.reference.mnemonic);
  }, [wellData, srcKey, existing]);

  const applied = useMemo(() => {
    if (!depth || !raw) return null;
    return applyTies(depth, raw, pairs);
  }, [depth, raw, pairs]);

  // the stored row versus the pairs re-applied to the raw curve
  const verification = useMemo(() => {
    const stored = shiftOfLog(existing);
    if (!stored || !depth || !raw) return null;
    const storedData = wellData.logs[existing.mnemonic];
    if (!storedData) return null;
    return verifyStoredShift(depth, raw, storedData, stored);
  }, [existing, depth, raw, wellData]);

  const tracks = useMemo(() => {
    if (!depth || !raw || !refData) return [];
    return shiftTracks({
      referenceMnemonic: refKey,
      referenceData: refData,
      sourceMnemonic: srcKey,
      sourceData: raw,
      shifted: applied?.ok ? applied.data : null,
      shift: applied?.ok ? applied.shift : null,
      depthUnit,
      unitOf,
    });
  }, [depth, raw, refData, refKey, srcKey, applied, depthUnit, unitOf]);

  const commit = useCallback((nextPairs) => {
    const w = tiePointWarp(nextPairs);
    if (!w.ok) { setProblem(w.error); onStatus(w.error); return false; }
    setHistory((h) => [...h, pairs]);
    setPairs(w.pairs.map(([r, t]) => [r, t]));
    setProblem(null);
    return true;
  }, [pairs, onStatus]);

  const onTiePick = useCallback((mdM, trackIndex) => {
    if (trackIndex === TIE_TRACKS.ref) {
      setPending({ refMd: mdM });
      onStatus(`Reference ${mdM} m picked. Now click ${srcKey} at the matching depth.`);
      return;
    }
    if (trackIndex === TIE_TRACKS.target) {
      if (!pending) { onStatus('Click the reference curve first, then the target.'); return; }
      if (commit([...pairs, [pending.refMd, mdM]])) {
        setPending(null);
        onStatus(`Tie ${pairs.length + 1}: ${srcKey} ${mdM} m moves to ${pending.refMd} m.`);
      }
      return;
    }
    onStatus('Click on the reference track or the target track.');
  }, [pending, pairs, commit, onStatus, srcKey]);

  const onTieMove = useCallback((index, side, mdM) => {
    const next = pairs.map((p, i) => (i === index ? (side === 'ref' ? [mdM, p[1]] : [p[0], mdM]) : p));
    commit(next);
  }, [pairs, commit]);

  const editPair = (index, side, value) => {
    setDrafts({});
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    onTieMove(index, side, v);
  };
  const cellValue = (i, side, stateValue) => (drafts[`${i}-${side}`] ?? String(stateValue));
  const removePair = (index) => commit(pairs.filter((_, i) => i !== index));
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setPairs(prev);
    setPending(null);
    setProblem(null);
  };

  const resetToRaw = async () => {
    if (existing) {
      if (!window.confirm(`Reset ${srcKey} to raw? This deletes the saved curve ${existing.mnemonic} (${(shiftOfLog(existing)?.pairs || []).length} ties). The raw ${srcKey} is untouched.`)) return;
      setBusy(true);
      try {
        await backend.deleteLog(existing);
        await onSaved();
        onStatus(`Deleted ${existing.mnemonic}; ${srcKey} is back to raw.`);
      } catch (e) {
        onStatus(e.message);
      } finally {
        setBusy(false);
      }
    }
    setHistory((h) => [...h, pairs]);
    setPairs([]);
    setPending(null);
    setProblem(null);
    loadedFor.current = null;
  };

  const save = async () => {
    if (!pairs.length) { onStatus('Place at least one tie point before saving.'); return; }
    setBusy(true);
    try {
      const by = backend.whoAmI ? await backend.whoAmI() : null;
      const log = buildShiftLog({ wellData, sourceMnemonic: srcKey, referenceMnemonic: refKey, pairs, projectId, by, previous: existing });
      await backend.publishCurves(wellData.wellId, [log], projectId);
      loadedFor.current = null;
      await onSaved();
      onStatus(`Saved ${log.mnemonic} with ${pairs.length} tie point${pairs.length === 1 ? '' : 's'}. Pick it as the ${srcKey} input in the explorer to use it.`);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!placing) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setPlacing(false); setPending(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!wellData || !depth) return <p className="p-3 text-xs text-slate-500">Open a well first.</p>;
  if (mnemonics.length < 2) return <p className="p-3 text-xs text-slate-500">Depth shifting needs at least two curves on the well.</p>;

  const storedShift = shiftOfLog(existing);
  const lastEdit = storedShift?.edits?.length ? storedShift.edits[storedShift.edits.length - 1] : null;

  return (
    <div className="h-full min-h-0 flex" data-testid="petro-shift-panel">
      <div className="flex-1 min-w-0">
        <TrackViewer
          depth={depth}
          tracks={tracks}
          depthUnit={depthUnit}
          pickMode={placing ? 'tie' : null}
          onPickCancel={() => { setPlacing(false); setPending(null); }}
          ties={toTies(pairs)}
          pendingTie={pending}
          tieTracks={TIE_TRACKS}
          onTiePick={onTiePick}
          onTieMove={onTieMove}
          snapSamples={snapSamples}
          isOwn={isOwn}
        />
      </div>
      <div className="w-72 shrink-0 border-l border-slate-800/60 bg-slate-900/60 overflow-auto p-2 space-y-2 text-xs" data-testid="petro-shift-side">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Depth shift (tie points)</div>
        <label className="block">
          <span className="text-slate-400">Reference curve</span>
          <select className={`${selCls} w-full mt-0.5`} data-testid="petro-shift-ref" value={refKey} onChange={(e) => setRefKey(e.target.value)}>
            {mnemonics.filter((m) => m !== srcKey).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-400">Curve to shift</span>
          <select className={`${selCls} w-full mt-0.5`} data-testid="petro-shift-src" value={srcKey}
            onChange={(e) => { setSrcKey(e.target.value); if (refKey === e.target.value) setRefKey(mnemonics.find((m) => m !== e.target.value) || ''); }}>
            {sources.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          <button type="button" data-testid="petro-shift-place" className={`${btnCls} ${placing ? 'border-cyan-500/60 text-cyan-300' : ''}`}
            onClick={() => { setPlacing((p) => !p); setPending(null); }}>
            <MousePointerClick className="w-3 h-3" /> {placing ? 'Placing ties (Esc to stop)' : 'Place ties'}
          </button>
          <button type="button" data-testid="petro-shift-undo" className={btnCls} disabled={!history.length} onClick={undo}>
            <Undo2 className="w-3 h-3" /> Undo
          </button>
          <button type="button" data-testid="petro-shift-reset" className={btnCls} disabled={busy || (!pairs.length && !existing)} onClick={resetToRaw}>
            <RotateCcw className="w-3 h-3" /> Reset to raw
          </button>
          <button type="button" data-testid="petro-shift-save" className={`${btnCls} border-emerald-700/60 text-emerald-300`} disabled={busy || !pairs.length || !applied?.ok || !isOwn} onClick={save}>
            <Save className="w-3 h-3" /> Save {dsName(srcKey)}
          </button>
        </div>
        {placing && (
          <p className="text-[10px] text-cyan-300/90">
            {pending ? `Reference ${pending.refMd} m picked: click ${srcKey} at the matching depth.` : 'Click the reference curve at a feature, then the target curve at the same feature.'}
          </p>
        )}
        {problem && <p className="text-[10px] text-amber-300/90" data-testid="petro-shift-problem">Refused: {problem}</p>}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Tie points ({pairs.length})</div>
          {!pairs.length && <p className="text-[10px] text-slate-500">None: the curve reads as raw. Place ties on the tracks or type them here.</p>}
          <table className="w-full text-[11px]" data-testid="petro-shift-pairs">
            {pairs.length > 0 && (
              <thead><tr className="text-slate-500"><th className="text-left font-normal">#</th><th className="text-left font-normal">Ref (m)</th><th className="text-left font-normal">Target (m)</th><th /></tr></thead>
            )}
            <tbody>
              {pairs.map(([r, t], i) => (
                <tr key={i} data-testid="petro-shift-pair">
                  <td className="text-slate-500">{i + 1}</td>
                  <td><input className={inputCls} value={cellValue(i, 'ref', r)} onChange={(e) => setDrafts((d) => ({ ...d, [`${i}-ref`]: e.target.value }))} onBlur={(e) => editPair(i, 'ref', e.target.value)} /></td>
                  <td><input className={inputCls} value={cellValue(i, 'target', t)} onChange={(e) => setDrafts((d) => ({ ...d, [`${i}-target`]: e.target.value }))} onBlur={(e) => editPair(i, 'target', e.target.value)} /></td>
                  <td><button type="button" title="Delete tie" className="text-slate-500 hover:text-red-300" onClick={() => removePair(i)}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={`${btnCls} mt-1`} data-testid="petro-shift-add"
            onClick={() => {
              // a zero-shift tie in the middle of the widest depth interval not
              // yet tied, so repeated adds never collide on one reference depth
              const refs = [depth[0], ...pairs.map((p) => p[0]).sort((a, b) => a - b), depth[depth.length - 1]];
              let lo = refs[0];
              let hi = refs[1];
              for (let i = 1; i < refs.length - 1; i++) if (refs[i + 1] - refs[i] > hi - lo) { lo = refs[i]; hi = refs[i + 1]; }
              const z = Number(((lo + hi) / 2).toFixed(2));
              commit([...pairs, [z, z]]);
            }}>
            Add a tie
          </button>
        </div>
        <p className="text-[10px] text-slate-500 leading-snug">
          Between ties the shift is linear; beyond the outermost ties it is constant. Resampling is
          linear between the two raw samples on either side of the requested depth (the same as the
          block shift); a null on either side stays null. Positive shift moves the curve deeper.
        </p>
        {storedShift && (
          <div className="rounded border border-slate-800 p-1.5 space-y-0.5" data-testid="petro-shift-stored">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Saved {existing.mnemonic}</div>
            <p className="text-[10px] text-slate-400">
              {storedShift.pairs.length} tie{storedShift.pairs.length === 1 ? '' : 's'} against {storedShift.reference?.mnemonic}; {storedShift.edits?.length || 0} edit{(storedShift.edits?.length || 0) === 1 ? '' : 's'}
              {lastEdit ? `, last by ${lastEdit.by || 'unknown'} on ${String(lastEdit.at).slice(0, 10)}` : ''}.
            </p>
            {verification && (
              <p className={`text-[10px] ${verification.mismatches === 0 ? 'text-slate-500' : 'text-amber-300/90'}`} data-testid="petro-shift-verify">
                {verification.ok
                  ? (verification.mismatches === 0
                    ? 'Re-applying the stored ties to the raw curve reproduces the saved samples.'
                    : `${verification.mismatches} saved samples differ from the stored ties re-applied; save again to refresh.`)
                  : `Stored ties cannot be applied: ${verification.error}`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
