// Docked interpretation toolbox (group 5): every horizon and fault
// picking tool in one vertical panel beside the viewports, so an
// interpreter never has to hunt through the ribbon mid-pick. It drives
// the SAME controller state and handlers as the Interpretation ribbon
// (ViewerPanel owns everything), so the two stay in step.
//
// Horizon: target, Manual / Seed / Erase tools, seeded tracking (2D, 3D,
// grow) with event, search window and correlation threshold, brush size,
// session save / discard. Fault: the active (named) fault, the stick
// tools of hooks/useFaultStickEditor, stick and fault actions.
// Presentational.

import React from 'react';
import {
  Pencil, Crosshair, Eraser, Spline, Route, Sprout, Save, Ban, Undo2, Redo2,
  Slash, Plus, MousePointer2, Scissors, Move, X, Trash2, ArrowUpToLine,
  ArrowDownToLine, Settings2, Loader2,
} from 'lucide-react';
import { FAULT_TOOLS } from '../../hooks/useFaultStickEditor';

export const SNAP_EVENTS = [
  { key: 'peak', label: 'Peak (+)' },
  { key: 'trough', label: 'Trough (-)' },
  { key: 'zero_pos', label: 'Zero cross - to +' },
  { key: 'zero_neg', label: 'Zero cross + to -' },
  { key: 'ncc', label: 'Correlation (NCC)' },
];
const WINDOWS = [2, 3, 5, 8, 12];
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];
const BRUSHES = [
  { radius: 0, label: '1 trace' },
  { radius: 1, label: '3 traces' },
  { radius: 2, label: '5 traces' },
  { radius: 5, label: '11 traces' },
  { radius: 10, label: '21 traces' },
];
const TOOL_ICONS = {
  extend: Pencil,
  select: MousePointer2,
  shorten: Scissors,
  move: Move,
  deleteNode: X,
  deleteStick: Trash2,
};

const selectCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs disabled:opacity-50';

function Block({ title, icon: Icon, children, testId }) {
  return (
    <section className="border-b border-slate-800 px-2.5 py-2" data-testid={testId}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid grid-cols-[76px_1fr] items-center gap-1.5 py-0.5 text-[11px] text-slate-400">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ToolButton({
  icon: Icon, label, active = false, onClick, disabled = false, title, tone = 'cyan', testId,
}) {
  const on = {
    cyan: 'bg-cyan-500/15 text-cyan-200 border-cyan-600/60',
    yellow: 'bg-yellow-500/15 text-yellow-200 border-yellow-600/60',
    orange: 'bg-orange-500/15 text-orange-200 border-orange-600/60',
    red: 'bg-red-500/15 text-red-200 border-red-600/60',
    emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-600/60',
  }[tone];
  return (
    <button
      type="button"
      title={title || label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] text-left
        disabled:opacity-40 disabled:cursor-not-allowed ${active ? on
        : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100'}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * @param {Object} p
 * @param {boolean} p.hasSection a volume is open on an inline or crossline
 * @param {Object} p.horizon horizon controller slice (see ViewerPanel)
 * @param {Object} p.fault fault controller slice (see ViewerPanel)
 * @param {Object} p.history {undo, redo, canUndo, canRedo, undoLabel, redoLabel}
 */
export default function InterpretationToolbox({
  hasSection, horizon: hz, fault: ft, history,
}) {
  const picking = (mode) => hz.pickMode === mode;
  const faultOn = hz.pickMode === 'fault';
  const tool = FAULT_TOOLS.find((t) => t.key === ft.tool) || FAULT_TOOLS[0];
  const sticks = ft.draftSticks;
  const nPoints = sticks.reduce((n, s) => n + s.length, 0);
  const savable = sticks.some((s) => s.length >= 2);
  const activeId = ft.editingFault ? ft.editingFault.id : 'new';

  const chooseFaultTool = (key) => {
    ft.setTool(key);
    if (!faultOn) hz.setPickMode('fault');
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto text-slate-200" data-testid="sl-toolbox">
      <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-slate-800">
        <ToolButton
          icon={Undo2}
          label="Undo"
          onClick={history.undo}
          disabled={!history.canUndo}
          title={history.undoLabel ? `Undo ${history.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
          testId="sl-toolbox-undo"
        />
        <ToolButton
          icon={Redo2}
          label="Redo"
          onClick={history.redo}
          disabled={!history.canRedo}
          title={history.redoLabel ? `Redo ${history.redoLabel} (Ctrl+Shift+Z)` : 'Redo (Ctrl+Shift+Z)'}
          testId="sl-toolbox-redo"
        />
      </div>

      <Block title="Horizon picking" icon={Spline} testId="sl-toolbox-horizon">
        <Field label="Target">
          <select
            className={selectCls}
            value={hz.editTarget}
            onChange={(e) => hz.changeEditTarget(e.target.value)}
            disabled={!hz.hasVolume}
            aria-label="Horizon target"
          >
            <option value="new">New horizon…</option>
            {hz.horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-1 mt-1.5">
          <ToolButton
            icon={Pencil}
            label="Manual"
            tone="yellow"
            active={picking('manual')}
            onClick={() => hz.toggleEditTool('manual')}
            disabled={!hasSection}
            title="Click or drag on the section to pick; picks snap to the chosen event within the window"
            testId="sl-toolbox-manual"
          />
          <ToolButton
            icon={Crosshair}
            label="Seed"
            tone="yellow"
            active={picking('seed')}
            onClick={() => hz.setPickMode((p) => (p === 'seed' ? null : 'seed'))}
            disabled={!hasSection}
            title="Click an event to seed auto-tracking"
            testId="sl-toolbox-seed"
          />
          <ToolButton
            icon={Eraser}
            label="Erase"
            tone="red"
            active={picking('erase')}
            onClick={() => hz.toggleEditTool('erase')}
            disabled={!hasSection}
            title="Drag on the section to delete picks with the brush"
            testId="sl-toolbox-erase"
          />
        </div>

        <p className="mt-2 mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Seeded auto-tracking</p>
        <Field label="Event">
          <select
            className={selectCls}
            value={hz.snapMode}
            onChange={(e) => hz.setSnapMode(e.target.value)}
            disabled={!hz.hasVolume}
            aria-label="Tracking event"
          >
            {SNAP_EVENTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Window">
          <select
            className={selectCls}
            value={String(hz.snapWindow)}
            onChange={(e) => hz.setSnapWindow(Number(e.target.value))}
            disabled={!hz.hasVolume}
            aria-label="Search window"
          >
            {WINDOWS.map((w) => <option key={w} value={String(w)}>{`±${w} samples`}</option>)}
          </select>
        </Field>
        <Field label="Correlation">
          <select
            className={selectCls}
            value={String(hz.corrThreshold)}
            onChange={(e) => hz.setCorrThreshold(Number(e.target.value))}
            disabled={!hz.hasVolume}
            aria-label="Correlation threshold"
          >
            {THRESHOLDS.map((t) => <option key={t} value={String(t)}>{`≥ ${t.toFixed(1)}`}</option>)}
          </select>
        </Field>
        {hz.snapMode !== 'ncc' && (
          <p className="text-[10px] text-slate-500 leading-snug">
            The threshold is used when tracking by correlation.
            {' '}
            <button
              type="button"
              className="text-cyan-400 hover:underline"
              onClick={() => hz.setSnapMode('ncc')}
              disabled={!hz.hasVolume}
            >
              Track by correlation
            </button>
          </p>
        )}
        <div className="grid grid-cols-3 gap-1 mt-1.5">
          <ToolButton
            icon={Spline}
            label="Track 2D"
            onClick={hz.track2D}
            disabled={!hz.seedPick || !hasSection}
            title="Track the seed along the displayed line"
          />
          <ToolButton
            icon={Route}
            label="Track 3D"
            onClick={hz.trackHorizon}
            disabled={!hz.hasVolume || !hz.seedPick || hz.tracking !== null}
            title="Track the seed across the survey"
          />
          <ToolButton
            icon={Sprout}
            label="Grow"
            onClick={hz.growHorizon}
            disabled={!hz.hasVolume || hz.editTarget === 'new' || hz.tracking !== null}
            title="Grow the target horizon outward from all its picks"
          />
        </div>
        {hz.tracking && (
          <p className="mt-1 flex items-center text-[11px] text-slate-300">
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            {`${hz.tracking.tracked.toLocaleString()} / ${hz.tracking.total.toLocaleString()}`}
            <button type="button" className="ml-2 text-red-400 hover:underline" onClick={hz.cancelTracking}>
              Cancel
            </button>
          </p>
        )}

        <p className="mt-2 mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Eraser</p>
        <Field label="Brush">
          <select
            className={selectCls}
            value={String(hz.eraseSize)}
            onChange={(e) => hz.setEraseSize(Number(e.target.value))}
            disabled={!hz.hasVolume}
            aria-label="Eraser brush"
          >
            {BRUSHES.map((b) => <option key={b.radius} value={String(b.radius)}>{b.label}</option>)}
          </select>
        </Field>

        {hz.edit.active && (
          <div className="grid grid-cols-2 gap-1 mt-1.5">
            <ToolButton
              icon={Save}
              label={hz.editTarget === 'new' ? 'Save as…' : 'Save'}
              tone="emerald"
              active
              onClick={hz.saveEdits}
              disabled={!hz.edit.undo || hz.editBusy}
              title="Save the horizon edits (undoable)"
            />
            <ToolButton icon={Ban} label="Discard" onClick={hz.discardEdits} disabled={hz.editBusy} />
          </div>
        )}
      </Block>

      <Block title="Fault picking" icon={Slash} testId="sl-toolbox-fault">
        <Field label="Active fault">
          <select
            className={selectCls}
            value={activeId}
            onChange={(e) => ft.setActiveFault(e.target.value)}
            disabled={!hz.hasVolume}
            aria-label="Active fault"
          >
            <option value="new">New fault…</option>
            {ft.faults.filter((f) => f.is_own !== false).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </Field>
        {activeId === 'new' ? (
          <Field label="Name">
            <input
              className={selectCls}
              value={ft.newFaultName}
              onChange={(e) => ft.setNewFaultName(e.target.value)}
              placeholder={ft.defaultFaultName}
              aria-label="New fault name"
            />
          </Field>
        ) : (
          <p className="text-[10px] text-slate-500 leading-snug">
            New sticks and edits go to this fault; Save writes them to it.
          </p>
        )}

        <div className="grid grid-cols-2 gap-1 mt-1.5">
          {FAULT_TOOLS.map((t) => (
            <ToolButton
              key={t.key}
              icon={TOOL_ICONS[t.key]}
              label={t.label}
              tone="orange"
              active={faultOn && ft.tool === t.key}
              onClick={() => chooseFaultTool(t.key)}
              disabled={!hasSection}
              title={t.hint}
              testId={`sl-fault-tool-${t.key}`}
            />
          ))}
        </div>
        {faultOn && (
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">
            {tool.hint}
            {' Alt+click deletes the nearest point.'}
          </p>
        )}

        <p className="mt-2 text-[11px] text-slate-400" data-testid="sl-fault-readout">
          {sticks.length
            ? `Stick ${ft.selected + 1} of ${sticks.length} selected (${ft.selectedPoints} points); ${nPoints} points in all`
            : 'No sticks yet'}
        </p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <ToolButton
            icon={Plus}
            label="New stick"
            onClick={() => { ft.newStick(); if (!faultOn) hz.setPickMode('fault'); ft.setTool('extend'); }}
            disabled={!hasSection}
            title="Start a new stick on the active fault"
            testId="sl-fault-new-stick"
          />
          <ToolButton
            icon={Trash2}
            label="Delete stick"
            onClick={ft.deleteSelected}
            disabled={!sticks.length}
            title="Delete the selected stick"
            testId="sl-fault-delete-stick"
          />
          <ToolButton
            icon={ArrowUpToLine}
            label="Trim top"
            onClick={() => ft.trim('top')}
            disabled={ft.selectedPoints === 0}
            title="Shorten the selected stick by its shallowest point"
            testId="sl-fault-trim-top"
          />
          <ToolButton
            icon={ArrowDownToLine}
            label="Trim bottom"
            onClick={() => ft.trim('bottom')}
            disabled={ft.selectedPoints === 0}
            title="Shorten the selected stick by its deepest point"
            testId="sl-fault-trim-bottom"
          />
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1.5">
          <ToolButton
            icon={Save}
            label={ft.editingFault ? 'Save fault' : 'Save as new'}
            tone="emerald"
            active={savable}
            onClick={ft.saveDraftFault}
            disabled={!savable}
            title={ft.editingFault
              ? `Write the sticks to "${ft.editingFault.name}"`
              : 'Save the sticks as a new named fault'}
            testId="sl-fault-save"
          />
          <ToolButton
            icon={Ban}
            label="Discard"
            onClick={ft.discardDraft}
            disabled={!sticks.length}
            title="Drop the unsaved sticks (undoable)"
          />
          <ToolButton
            icon={Trash2}
            label="Delete fault"
            tone="red"
            onClick={ft.deleteActiveFault}
            disabled={!ft.editingFault && !sticks.length}
            title={ft.editingFault
              ? `Delete "${ft.editingFault.name}" (undoable)`
              : 'Drop the unsaved fault (undoable)'}
            testId="sl-fault-delete-fault"
          />
          <ToolButton
            icon={Settings2}
            label="Properties"
            onClick={() => ft.editingFault && ft.openFaultSettings(ft.editingFault)}
            disabled={!ft.editingFault}
            title="Name, colour, line weight and opacity of the active fault"
          />
        </div>
      </Block>
    </div>
  );
}
