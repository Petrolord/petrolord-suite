// Ribbon · Interpretation: seed picking + autotracking, snap settings,
// horizon edit session tools, surface ops, fault sticks and the velocity
// dialog launcher. Enable/disable rules are verbatim from the pre-ribbon
// rows (picking tools stay disabled on time slices).

import React from 'react';
import {
  Crosshair, Route, Spline, Ban, Loader2, Pencil, Eraser, Undo2, Save,
  Wand2, PaintBucket, Ruler, Slash, CheckCheck, Trash2,
} from 'lucide-react';
import { RibbonGroup, RibbonButton, RibbonSelect } from '../Ribbon';
import { describeVelocity } from '../../../engine/velocityModel';

/** Event kinds a horizon can snap/track to (engine SNAP_MODES + labels). */
const SNAP_OPTIONS = [
  { key: 'peak', label: 'Peak (+)' },
  { key: 'trough', label: 'Trough (−)' },
  { key: 'zero_pos', label: 'Zero cross − → +' },
  { key: 'zero_neg', label: 'Zero cross + → −' },
];

/** Section eraser widths (traces): radius r erases 2r+1 traces per pass. */
const BRUSH_OPTIONS = [
  { radius: 0, label: '1' },
  { radius: 1, label: '3' },
  { radius: 2, label: '5' },
  { radius: 5, label: '11' },
  { radius: 10, label: '21' },
];

export default function InterpretationTab({
  manifest, orientation, slice,
  pickMode, setPickMode, seedPick, snapMode, setSnapMode, snapWindow, setSnapWindow,
  tracking, trackHorizon, cancelTracking, track2D,
  editTarget, changeEditTarget, horizons, toggleEditTool,
  eraseSize, setEraseSize, edit, editBusy, undoEdit, saveEdits, discardEdits,
  smoothEdits, smoothMethod, setSmoothMethod, smoothRadius, setSmoothRadius, fillHoles,
  draftSticks, endStick, saveDraftFault, discardDraft,
  openVelocity, velocityModel,
}) {
  const noSection = !manifest || orientation === 'time';

  return (
    <>
      <RibbonGroup label="Seed & track">
        <RibbonButton
          icon={Crosshair}
          label={pickMode === 'seed' ? 'Picking…' : 'Pick seed'}
          active={pickMode === 'seed'}
          accent="yellow"
          onClick={() => setPickMode((p) => (p === 'seed' ? null : 'seed'))}
          disabled={noSection}
          title="Click an event on the section to seed tracking"
        />
        <RibbonButton
          icon={Spline}
          label="Track 2D"
          onClick={track2D}
          disabled={!seedPick || !slice || noSection}
          title="Autotrack the seed along the displayed line only"
        />
        <RibbonButton
          icon={Route}
          label="Track 3D"
          onClick={trackHorizon}
          disabled={!manifest || !seedPick || tracking !== null}
          title="Autotrack the seed across the whole survey (worker)"
        />
        {tracking && (
          <>
            <span className="text-xs text-slate-300 flex items-center whitespace-nowrap">
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {tracking.tracked.toLocaleString()} / {tracking.total.toLocaleString()}
            </span>
            <RibbonButton icon={Ban} label="Cancel" onClick={cancelTracking} />
          </>
        )}
        {seedPick && !tracking && (
          <span className="text-[10px] text-slate-500 max-w-[110px] leading-tight">
            Seed: IL idx {seedPick.ilIdx}, XL idx {seedPick.xlIdx},
            s {seedPick.sample.toFixed(2)}
          </span>
        )}
      </RibbonGroup>

      <RibbonGroup label="Snap">
        <RibbonSelect
          label="Event"
          value={snapMode}
          onChange={(e) => setSnapMode(e.target.value)}
          disabled={!manifest}
          title="Event kind for seed snapping and 2D/3D autotracking"
        >
          {SNAP_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </RibbonSelect>
        <RibbonSelect
          label="Window"
          value={String(snapWindow)}
          onChange={(e) => setSnapWindow(Number(e.target.value))}
          disabled={!manifest}
          title="Search half-window (samples) for snapping and tracking — wider follows rougher events but can jump reflectors"
        >
          {[2, 3, 5, 8, 12].map((w) => (
            <option key={w} value={String(w)}>{`±${w}`}</option>
          ))}
        </RibbonSelect>
      </RibbonGroup>

      <RibbonGroup label="Edit horizon">
        <RibbonSelect
          label="Target"
          value={editTarget}
          onChange={(e) => changeEditTarget(e.target.value)}
          disabled={!manifest}
          title="Horizon that manual picking / erasing / 2D tracking edits"
          className="max-w-[130px]"
        >
          <option value="new">New horizon…</option>
          {horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </RibbonSelect>
        <RibbonButton
          icon={Pencil}
          label={pickMode === 'manual' ? 'Picking…' : 'Manual'}
          active={pickMode === 'manual'}
          accent="yellow"
          onClick={() => toggleEditTool('manual')}
          disabled={noSection}
          title="Click or drag on the section to pick (snaps to the selected event)"
        />
        <RibbonButton
          icon={Eraser}
          label={pickMode === 'erase' ? 'Erasing…' : 'Erase'}
          active={pickMode === 'erase'}
          accent="red"
          onClick={() => toggleEditTool('erase')}
          disabled={noSection}
          title="Drag on the section to delete picks (map window has rectangle / polygon erase)"
        />
        <RibbonSelect
          label="Brush"
          value={String(eraseSize)}
          onChange={(e) => setEraseSize(Number(e.target.value))}
          disabled={!manifest}
          title="Eraser width (traces per pass)"
        >
          {BRUSH_OPTIONS.map((b) => (
            <option key={b.radius} value={String(b.radius)}>{b.label}</option>
          ))}
        </RibbonSelect>
        {edit.active && (
          <>
            <RibbonButton
              icon={Undo2}
              label={edit.undo ? `Undo (${edit.undo})` : 'Undo'}
              onClick={undoEdit}
              disabled={!edit.undo}
            />
            <RibbonButton
              icon={Save}
              label={editTarget === 'new' ? 'Save as…' : 'Save'}
              active
              accent="emerald"
              onClick={saveEdits}
              disabled={!edit.undo || editBusy}
              busy={editBusy}
              title={editTarget === 'new' ? 'Save the edit session as a new horizon' : 'Save edits to the horizon'}
            />
            <RibbonButton
              icon={Ban}
              label="Discard"
              onClick={discardEdits}
              disabled={editBusy}
            />
          </>
        )}
      </RibbonGroup>

      <RibbonGroup label="Surface ops">
        <RibbonButton
          icon={Wand2}
          label="Smooth"
          onClick={smoothEdits}
          disabled={!manifest || editBusy}
          title="One null-aware smoothing pass over the edited horizon (undoable; click again for more)"
        />
        <RibbonSelect
          label="Method"
          value={smoothMethod}
          onChange={(e) => setSmoothMethod(e.target.value)}
          disabled={!manifest}
          title="Mean smooths gently; median kills single-pick spikes"
        >
          <option value="mean">mean</option>
          <option value="median">median</option>
        </RibbonSelect>
        <RibbonSelect
          label="Size"
          value={String(smoothRadius)}
          onChange={(e) => setSmoothRadius(Number(e.target.value))}
          disabled={!manifest}
          title="Smoothing filter size"
        >
          {[1, 2, 4].map((r) => (
            <option key={r} value={String(r)}>{`${2 * r + 1}×${2 * r + 1}`}</option>
          ))}
        </RibbonSelect>
        <RibbonButton
          icon={PaintBucket}
          label="Fill holes"
          onClick={fillHoles}
          disabled={!manifest || editBusy}
          title="Interpolate across interior holes of the edited horizon (the uninterpreted exterior never grows; undoable)"
        />
      </RibbonGroup>

      <RibbonGroup label="Faults">
        <RibbonButton
          icon={Slash}
          label={pickMode === 'fault' ? 'Picking…' : 'Pick fault'}
          active={pickMode === 'fault'}
          accent="orange"
          onClick={() => setPickMode((p) => (p === 'fault' ? null : 'fault'))}
          disabled={noSection}
          title="Click points along the fault on a section"
        />
        {pickMode === 'fault' && (
          <>
            <RibbonButton
              icon={CheckCheck}
              label="End stick"
              onClick={endStick}
              title="Finish the current stick and start a new one"
            />
            <RibbonButton
              icon={Save}
              label="Save fault"
              active
              accent="orange"
              onClick={saveDraftFault}
              disabled={!draftSticks.some((s) => s.length >= 2)}
            />
            <RibbonButton
              icon={Trash2}
              label="Discard"
              onClick={discardDraft}
              disabled={!draftSticks.length}
            />
          </>
        )}
      </RibbonGroup>

      <RibbonGroup label="Velocity">
        <RibbonButton
          icon={Ruler}
          label="Velocity model…"
          onClick={openVelocity}
          disabled={!manifest}
          title={velocityModel
            ? `${describeVelocity(velocityModel)} — drives depth maps and depth exports`
            : 'Not set — depth maps and model-based exports unavailable'}
        />
      </RibbonGroup>
    </>
  );
}
