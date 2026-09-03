// What the scan reader thinks is printed on the image (PT7). Every field
// is editable; Accept only pre-fills the digitizer's calibration form and
// the dialog says so. Dismiss throws it away. Nothing here traces or saves.

import React from 'react';
import { Button } from '@/components/ui/button';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs w-full';
const NUM_FIELDS = [
  ['depth_top', 'Depth top'], ['depth_bottom', 'Depth bottom'],
  ['value_left', 'Scale left'], ['value_right', 'Scale right'],
];

export default function ProposalCard({ proposal, meta, onChange, onAccept, onDismiss }) {
  if (!proposal) return null;
  const set = (key, v) => onChange({ ...proposal, [key]: v });
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const pct = proposal.confidence == null ? null : Math.round(proposal.confidence * 100);
  return (
    <div className="rounded border border-violet-700/60 bg-violet-950/30 p-2 space-y-2 text-xs" data-testid="petro-digitizer-proposal">
      <div className="flex items-center justify-between">
        <div className="text-violet-200 font-medium">
          Read from the scan{meta?.model ? ` by ${meta.model}` : ''}{pct != null ? ` (confidence ${pct}%)` : ''}
        </div>
        <div className="text-slate-400">A proposal to check, not a trace.</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <label className="space-y-0.5">
          <div className="text-slate-400">Curve</div>
          <input className={inputCls} value={proposal.mnemonic ?? ''} data-testid="petro-digitizer-proposal-mnemonic"
            onChange={(e) => set('mnemonic', e.target.value.toUpperCase())} />
        </label>
        <label className="space-y-0.5">
          <div className="text-slate-400">Unit</div>
          <input className={inputCls} value={proposal.unit ?? ''} data-testid="petro-digitizer-proposal-unit"
            onChange={(e) => set('unit', e.target.value)} />
        </label>
        <label className="space-y-0.5">
          <div className="text-slate-400">Depth unit</div>
          <select className={inputCls} value={proposal.depth_unit ?? ''} data-testid="petro-digitizer-proposal-depth-unit"
            onChange={(e) => set('depth_unit', e.target.value || null)}>
            <option value="">not read</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <div className="text-slate-400">Curve colour</div>
          <div className="flex items-center gap-1">
            <input type="color" value={proposal.curve_color_hex || '#000000'} data-testid="petro-digitizer-proposal-color"
              className="h-6 w-8 bg-transparent border border-slate-700 rounded"
              onChange={(e) => set('curve_color_hex', e.target.value)} />
            <span className="text-slate-500">{proposal.curve_color_hex || 'not read'}</span>
          </div>
        </label>
        {NUM_FIELDS.map(([key, label]) => (
          <label key={key} className="space-y-0.5">
            <div className="text-slate-400">{label}</div>
            <input className={inputCls} value={proposal[key] ?? ''} inputMode="decimal"
              data-testid={`petro-digitizer-proposal-${key.replace('_', '-')}`}
              onChange={(e) => set(key, e.target.value === '' ? null : (num(e.target.value) ?? e.target.value))} />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <label className="inline-flex items-center gap-1 text-slate-300">
          <input type="checkbox" checked={!!proposal.value_log} data-testid="petro-digitizer-proposal-log"
            onChange={(e) => set('value_log', e.target.checked)} /> logarithmic scale
        </label>
        {proposal.notes && <span className="text-slate-400 italic truncate max-w-[50%]" title={proposal.notes}>{proposal.notes}</span>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300" data-testid="petro-digitizer-proposal-dismiss" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button size="sm" className="h-7 bg-violet-600 hover:bg-violet-500 text-white" data-testid="petro-digitizer-proposal-accept" onClick={onAccept}>
            Accept into the form
          </Button>
        </div>
      </div>
    </div>
  );
}
