// Ribbon · Home: volume selection, line navigation and display controls.
// All enable/disable rules are carried over verbatim from the pre-ribbon
// control rows (everything but the volume select gates on a manifest).

import React from 'react';
import { RibbonGroup, RibbonSelect, RibbonSlider } from '../Ribbon';
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
}) {
  return (
    <>
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
        <RibbonSlider
          label={`Gain ×${gain.toFixed(1)}`}
          min={0.1} max={10} step={0.1}
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
          disabled={!manifest}
          className="w-28"
        />
        <RibbonSlider
          label={`Clip ×${clipRms.toFixed(1)} RMS`}
          min={0.5} max={10} step={0.5}
          value={clipRms}
          onChange={(e) => setClipRms(Number(e.target.value))}
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
    </>
  );
}
