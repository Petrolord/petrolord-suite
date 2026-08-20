// Ribbon · Home: volume selection, line navigation and display controls.
// All enable/disable rules are carried over verbatim from the pre-ribbon
// control rows (everything but the volume select gates on a manifest).

import React from 'react';
import { Undo2, Redo2, BookMarked } from 'lucide-react';
import {
  RibbonGroup, RibbonButton, RibbonSelect, RibbonSlider,
} from '../Ribbon';
import { SEISMIC_COLORMAPS } from '../../../viewer/SliceRenderer';

const ORIENTATIONS = [
  { key: 'inline', label: 'Inline' },
  { key: 'xline', label: 'Crossline' },
  { key: 'time', label: 'Time slice' },
];

export default function HomeTab({
  volumes, volume, selectVolume, manifest,
  orientation, setOrientation, lineLabel, sliceIndex, maxIndex, changeIndex,
  colormap, setColormap, gain, setGain, clipRms, setClipRms,
  polarity, setPolarity, traceBalance, setTraceBalance,
  scaleMode, setScaleMode, clipPct, setClipPct, manualClip, setManualClip,
  agcOn, setAgcOn, agcWindowMs, setAgcWindowMs,
  wiggleMode, setWiggleMode, reverseCmap, setReverseCmap,
  overlayCandidates, overlayVolumeId, selectOverlayVolume,
  overlayColormap, setOverlayColormap, overlayOpacity, setOverlayOpacity,
  overlayBlend, setOverlayBlend,
  onUndo, onRedo, canUndo, canRedo, undoLabel, redoLabel, onOpenSessions,
  sectionDomain, setSectionDomain, depthReady,
}) {
  const isTimeSlice = orientation === 'time';
  return (
    <>
      <RibbonGroup label="History">
        <RibbonButton
          icon={Undo2}
          label="Undo"
          onClick={onUndo}
          disabled={!canUndo}
          title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo (Ctrl+Z)'}
        />
        <RibbonButton
          icon={Redo2}
          label="Redo"
          onClick={onRedo}
          disabled={!canRedo}
          title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo (Ctrl+Shift+Z)'}
        />
        <RibbonButton
          icon={BookMarked}
          label="Sessions"
          onClick={onOpenSessions}
          title="Named sessions and viewport bookmarks"
        />
      </RibbonGroup>

      <RibbonGroup label="Volume">
        <RibbonSelect
          label="Active volume"
          value={volume?.id || ''}
          onChange={(e) => selectVolume(e.target.value)}
          className="w-48"
        >
          <option value="">Select a volume…</option>
          {volumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </RibbonSelect>
      </RibbonGroup>

      <RibbonGroup label="Line">
        <RibbonSelect
          label="Orientation"
          value={orientation}
          onChange={(e) => setOrientation(e.target.value)}
          disabled={!manifest}
        >
          {ORIENTATIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </RibbonSelect>
        <RibbonSlider
          label={manifest ? lineLabel : 'Line'}
          min={0} max={maxIndex} step={1}
          value={sliceIndex}
          onChange={(e) => changeIndex(orientation, Number(e.target.value))}
          disabled={!manifest}
          className="w-44"
        />
        <RibbonSelect
          label="Domain"
          value={sectionDomain}
          onChange={(e) => setSectionDomain(e.target.value)}
          disabled={!manifest || isTimeSlice || orientation === 'traverse' || !depthReady}
          title={depthReady
            ? 'Depth stretches the section per column through the velocity model (display only; picking is disabled in depth)'
            : 'Depth needs a velocity model (layer cakes also need their boundary horizons loaded)'}
        >
          <option value="twt">Time (TWT)</option>
          <option value="depth">Depth (m)</option>
        </RibbonSelect>
      </RibbonGroup>

      <RibbonGroup label="Display">
        <div className="flex flex-col gap-0.5">
          <RibbonSelect
            label="Colormap"
            value={colormap}
            onChange={(e) => setColormap(e.target.value)}
            disabled={!manifest}
          >
            {SEISMIC_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </RibbonSelect>
          <button
            type="button"
            className={`px-2 py-0.5 text-xs rounded border disabled:opacity-40 ${reverseCmap
              ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setReverseCmap((r) => !r)}
            disabled={!manifest}
            title="Reverse the colormap end for end"
          >
            Reverse colors
          </button>
        </div>
        <RibbonSlider
          label={`Gain ×${gain.toFixed(1)}`}
          min={0.1} max={10} step={0.1}
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
          disabled={!manifest}
          className="w-28"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`px-2 py-0.5 text-xs rounded border disabled:opacity-40 ${polarity === 1
              ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setPolarity((p) => -p)}
            disabled={!manifest}
          >
            {polarity === 1 ? 'SEG normal' : 'Reversed'}
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 text-xs rounded border disabled:opacity-40 ${traceBalance
              ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setTraceBalance((t) => !t)}
            disabled={!manifest}
          >
            Trace balance
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Scaling">
        <RibbonSelect
          label="Amplitude scale"
          value={scaleMode}
          onChange={(e) => setScaleMode(e.target.value)}
          disabled={!manifest}
          title="How the color range maps to amplitude"
        >
          <option value="rms">RMS multiple</option>
          <option value="pct">Percentile</option>
          <option value="manual">Manual clip</option>
        </RibbonSelect>
        {scaleMode === 'rms' && (
          <RibbonSlider
            label={`Clip ×${clipRms.toFixed(1)} RMS`}
            min={0.5} max={10} step={0.5}
            value={clipRms}
            onChange={(e) => setClipRms(Number(e.target.value))}
            disabled={!manifest}
            className="w-28"
          />
        )}
        {scaleMode === 'pct' && (
          <RibbonSlider
            label={`P${clipPct} of current slice`}
            min={80} max={99.9} step={0.1}
            value={clipPct}
            onChange={(e) => setClipPct(Number(e.target.value))}
            disabled={!manifest}
            className="w-28"
          />
        )}
        {scaleMode === 'manual' && (
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            Clip amplitude
            <input
              type="number"
              min="0"
              step="any"
              value={manualClip || ''}
              placeholder="absolute"
              onChange={(e) => setManualClip(Number(e.target.value) || 0)}
              disabled={!manifest}
              className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs w-24 disabled:opacity-40"
            />
          </label>
        )}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className={`px-2 py-0.5 text-xs rounded border disabled:opacity-40 ${agcOn
              ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setAgcOn((a) => !a)}
            disabled={!manifest || isTimeSlice}
            title={isTimeSlice ? 'AGC applies to sections and traverses'
              : 'Windowed automatic gain control (display only)'}
          >
            AGC
          </button>
          <RibbonSelect
            label="Window"
            value={String(agcWindowMs)}
            onChange={(e) => setAgcWindowMs(Number(e.target.value))}
            disabled={!manifest || !agcOn || isTimeSlice}
          >
            {[50, 80, 120, 200, 300, 500].map((ms) => (
              <option key={ms} value={String(ms)}>{`${ms} ms`}</option>
            ))}
          </RibbonSelect>
        </div>
        <RibbonSelect
          label="Trace style"
          value={wiggleMode}
          onChange={(e) => setWiggleMode(e.target.value)}
          disabled={!manifest || isTimeSlice}
          title={isTimeSlice ? 'Wiggle display applies to sections and traverses'
            : 'Density image, wiggle overlay, or wiggle only'}
        >
          <option value="off">Density</option>
          <option value="overlay">Wiggle + VA over density</option>
          <option value="only">Wiggle + VA only</option>
        </RibbonSelect>
      </RibbonGroup>

      <RibbonGroup label="Co-render">
        <RibbonSelect
          label="Overlay volume"
          value={overlayVolumeId || ''}
          onChange={(e) => selectOverlayVolume(e.target.value)}
          disabled={!manifest || !overlayCandidates?.length}
          title={overlayCandidates?.length
            ? 'Blend a second volume on the same lattice over the section (attributes of this volume list first)'
            : 'Compute an attribute volume of this volume to co-render it'}
          className="w-40"
        >
          <option value="">None</option>
          {(overlayCandidates || []).map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </RibbonSelect>
        {overlayVolumeId && (
          <>
            <RibbonSelect
              label="Overlay colors"
              value={overlayColormap}
              onChange={(e) => setOverlayColormap(e.target.value)}
            >
              {SEISMIC_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </RibbonSelect>
            <RibbonSelect
              label="Blend"
              value={overlayBlend}
              onChange={(e) => setOverlayBlend(e.target.value)}
              title="Opacity mix paints the overlay over the seismic; multiply darkens the seismic by the overlay (good for variance)"
            >
              <option value="mix">Opacity mix</option>
              <option value="multiply">Multiply</option>
            </RibbonSelect>
            <RibbonSlider
              label={`Opacity ${Math.round(overlayOpacity * 100)}%`}
              min={0.05} max={1} step={0.05}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              className="w-24"
            />
          </>
        )}
      </RibbonGroup>
    </>
  );
}
