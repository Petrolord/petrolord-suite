// Ribbon · Home: volume selection, line navigation and display controls.
// All enable/disable rules are carried over verbatim from the pre-ribbon
// control rows (everything but the volume select gates on a manifest).

import React from 'react';
import { Undo2, Redo2, BookMarked, HardDrive, Palette } from 'lucide-react';
import {
  RibbonGroup, RibbonButton, RibbonSelect, RibbonSlider, RibbonToggle, RibbonField, RIBBON_FIELD,
} from '../Ribbon';
import { SEISMIC_COLORMAPS } from '../../../viewer/SliceRenderer';
import SlicePlayerControls from '../SlicePlayerControls';

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
  rangeLow = null, setRangeLow = () => {}, rangeHigh = null, setRangeHigh = () => {}, sliceRange = null,
  agcOn, setAgcOn, agcWindowMs, setAgcWindowMs,
  wiggleMode, setWiggleMode, reverseCmap, setReverseCmap,
  overlayCandidates, overlayVolumeId, selectOverlayVolume,
  overlayColormap, setOverlayColormap, overlayOpacity, setOverlayOpacity,
  overlayBlend, setOverlayBlend,
  onUndo, onRedo, canUndo, canRedo, undoLabel, redoLabel, onOpenSessions,
  sectionDomain, setSectionDomain, depthReady, nativeDepth = null, depthUnit = 'm', setDepthUnit = null, unitNote = null,
  flattenHorizonId = null, setFlattenHorizonId = null, flattenChoices = [], flattenInfo = null,
  player = null, onOpenLocalWorkspace = null, spectralRgb = null,
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
        {onOpenLocalWorkspace && (
          <RibbonButton
            icon={HardDrive}
            label="Local workspace"
            onClick={onOpenLocalWorkspace}
            title="Keep seismic on this computer: the workspace folder, what is stored here, where jobs run and copy requests"
          />
        )}
      </RibbonGroup>

      <RibbonGroup label="Volume">
        <RibbonSelect
          label="Active volume"
          value={volume?.id || ''}
          onChange={(e) => selectVolume(e.target.value)}
          className="w-40"
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
        {player && (
          <SlicePlayerControls
            disabled={!manifest}
            orientation={orientation}
            currentValue={player.currentValue}
            player={player.state}
            onStep={player.onStep}
            onGoTo={player.onGoTo}
          />
        )}
        <RibbonSelect
          label="Domain"
          testId="sl-section-domain"
          value={sectionDomain}
          onChange={(e) => setSectionDomain(e.target.value)}
          disabled={!manifest || isTimeSlice || orientation === 'traverse' || !depthReady}
          title={nativeDepth
            ? `This volume is in depth already (${nativeDepth}), so its sections show on a depth axis without a velocity model`
            : depthReady
              ? 'Depth stretches the section per column through the velocity model (display only; picking is disabled in depth)'
              : 'Depth needs a velocity model (layer cakes also need their boundary horizons loaded)'}
        >
          <option value="twt">Time (TWT)</option>
          <option value="depth">Depth</option>
        </RibbonSelect>
        {setFlattenHorizonId && (
          <RibbonSelect
            label="Flatten"
            testId="sl-section-flatten"
            value={flattenHorizonId || ''}
            onChange={(e) => setFlattenHorizonId(e.target.value || null)}
            disabled={!manifest || isTimeSlice || sectionDomain === 'depth' || !flattenChoices.length}
            title={flattenChoices.length
              ? `Hang the section on a horizon: every trace shifts so the pick sits on one datum (display only; picks land in true time)${flattenInfo ? `. ${flattenInfo.tracked} of ${flattenInfo.nTraces} traces tracked, datum sample ${flattenInfo.datum.toFixed(1)}` : ''}`
              : 'Show a horizon in the explorer to flatten on it'}
          >
            <option value="">Structural</option>
            {flattenChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </RibbonSelect>
        )}
        <RibbonSelect
          label="Depth unit"
          value={depthUnit}
          onChange={(e) => setDepthUnit && setDepthUnit(e.target.value)}
          disabled={!setDepthUnit}
          testId="sl-depth-unit"
          title="Depth display unit for sections, the map and the cursor readout; starts from your units profile, a change here holds for this session"
        >
          <option value="m">m</option>
          <option value="ft">ft</option>
        </RibbonSelect>
        {unitNote && <div className="row-span-3 flex items-center leading-tight">{unitNote}</div>}
      </RibbonGroup>

      <RibbonGroup label="Display">
        <RibbonSelect
          label="Colormap"
          value={colormap}
          onChange={(e) => setColormap(e.target.value)}
          disabled={!manifest}
        >
          {SEISMIC_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </RibbonSelect>
        <RibbonToggle
          on={reverseCmap}
          onClick={() => setReverseCmap((r) => !r)}
          disabled={!manifest}
          title="Reverse the colormap end for end"
        >
          Reverse colors
        </RibbonToggle>
        <RibbonSlider
          label={`Gain ×${gain.toFixed(1)}`}
          min={0.1} max={10} step={0.1}
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
          disabled={!manifest}
          className="w-36"
        />
        <RibbonToggle
          on={polarity === 1}
          onClick={() => setPolarity((p) => -p)}
          disabled={!manifest}
        >
          {polarity === 1 ? 'SEG normal' : 'Reversed'}
        </RibbonToggle>
        <RibbonToggle
          on={traceBalance && scaleMode !== 'range'}
          onClick={() => setTraceBalance((t) => !t)}
          disabled={!manifest || scaleMode === 'range'}
          title={scaleMode === 'range' ? 'Trace balance rescales seismic amplitudes by trace energy, so it is off while values show as they are (Value range)' : undefined}
        >
          Trace balance
        </RibbonToggle>
      </RibbonGroup>

      <RibbonGroup label="Scaling">
        <RibbonSelect
          label="Amplitude scale"
          value={scaleMode}
          onChange={(e) => setScaleMode(e.target.value)}
          disabled={!manifest}
          title="How the color range maps to amplitude; Value range spans a property volume's own low to high (impedance, porosity, probability)"
        >
          <option value="rms">RMS multiple</option>
          <option value="pct">Percentile</option>
          <option value="manual">Manual clip</option>
          <option value="range">Value range</option>
        </RibbonSelect>
        {scaleMode === 'rms' && (
          <RibbonSlider
            label={`Clip ×${clipRms.toFixed(1)} RMS`}
            min={0.5} max={10} step={0.5}
            value={clipRms}
            onChange={(e) => setClipRms(Number(e.target.value))}
            disabled={!manifest}
            className="w-40"
          />
        )}
        {scaleMode === 'pct' && (
          <RibbonSlider
            label={`P${clipPct} of current slice`}
            min={80} max={99.9} step={0.1}
            value={clipPct}
            onChange={(e) => setClipPct(Number(e.target.value))}
            disabled={!manifest}
            className="w-40"
          />
        )}
        {scaleMode === 'manual' && (
          <RibbonField label="Clip amplitude">
            <input
              type="number"
              min="0"
              step="any"
              value={manualClip || ''}
              placeholder="absolute"
              onChange={(e) => setManualClip(Number(e.target.value) || 0)}
              disabled={!manifest}
              className={`${RIBBON_FIELD} w-24`}
            />
          </RibbonField>
        )}
        {scaleMode === 'range' && (
          <>
            <RibbonSlider
              label={`P${(100 - clipPct).toFixed(1).replace(/\.0$/, '')} to P${String(clipPct)} of current slice`}
              min={80} max={100} step={0.5}
              value={clipPct}
              onChange={(e) => setClipPct(Number(e.target.value))}
              disabled={!manifest}
              className="w-40"
            />
            <RibbonField label="Low">
              <input
                type="number"
                step="any"
                data-testid="sl-range-low"
                value={Number.isFinite(rangeLow) ? rangeLow : ''}
                placeholder={sliceRange ? Number(sliceRange.low.toPrecision(4)).toString() : 'auto'}
                title="The value at the low end of the colormap; empty = from the slice"
                onChange={(e) => setRangeLow(e.target.value === '' ? null : Number(e.target.value))}
                disabled={!manifest}
                className={`${RIBBON_FIELD} w-20`}
              />
            </RibbonField>
            <RibbonField label="High">
              <input
                type="number"
                step="any"
                data-testid="sl-range-high"
                value={Number.isFinite(rangeHigh) ? rangeHigh : ''}
                placeholder={sliceRange ? Number(sliceRange.high.toPrecision(4)).toString() : 'auto'}
                title="The value at the high end of the colormap; empty = from the slice"
                onChange={(e) => setRangeHigh(e.target.value === '' ? null : Number(e.target.value))}
                disabled={!manifest}
                className={`${RIBBON_FIELD} w-20`}
              />
            </RibbonField>
          </>
        )}
        <span className="flex items-center gap-1">
          <RibbonToggle
            on={agcOn && scaleMode !== 'range'}
            onClick={() => setAgcOn((a) => !a)}
            disabled={!manifest || isTimeSlice || scaleMode === 'range'}
            title={scaleMode === 'range' ? 'AGC rescales seismic amplitudes, so it is off while values show as they are (Value range)'
              : isTimeSlice ? 'AGC applies to sections and traverses'
                : 'Windowed automatic gain control (display only)'}
          >
            AGC
          </RibbonToggle>
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
        </span>
        <RibbonSelect
          label="Trace style"
          value={wiggleMode}
          onChange={(e) => setWiggleMode(e.target.value)}
          disabled={!manifest || isTimeSlice}
          title={isTimeSlice ? 'Wiggle display applies to sections and traverses'
            : 'Density image, wiggle overlay, or wiggle only'}
          className="w-28"
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
          className="w-32"
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
              className="w-36"
            />
          </>
        )}
      </RibbonGroup>

      {spectralRgb && (
        <RibbonGroup label="Spectral RGB">
          {['Red', 'Green', 'Blue'].map((word, c) => (
            <RibbonSelect
              key={word}
              label={word}
              testId={`sl-rgb-${word.toLowerCase()}`}
              value={spectralRgb.ids[c] || ''}
              onChange={(e) => spectralRgb.setChannel(c, e.target.value)}
              disabled={!manifest || !spectralRgb.candidates.length}
              title={spectralRgb.candidates.length
                ? `${word}: the ${['low', 'middle', 'high'][c]} frequency of the blend on the Map's time slice and horizons`
                : 'Compute spectral decomposition volumes of this volume (Attributes, three frequencies) to blend them'}
              className="w-28"
            >
              <option value="">None</option>
              {spectralRgb.candidates.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </RibbonSelect>
          ))}
          <RibbonButton
            icon={Palette}
            label="Auto"
            testId="sl-rgb-auto"
            onClick={() => spectralRgb.autoPick()}
            disabled={!manifest || spectralRgb.candidates.length < 3}
            active={spectralRgb.active}
            title="Pick a low, a middle and a high frequency of this volume's spectral decomposition volumes"
          />
          {spectralRgb.ids.some(Boolean) && (
            <RibbonButton
              label="Clear"
              testId="sl-rgb-clear"
              onClick={() => spectralRgb.clear()}
              title="Back to the amplitude time slice"
            />
          )}
        </RibbonGroup>
      )}
    </>
  );
}
