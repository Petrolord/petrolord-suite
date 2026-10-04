// Choose the Hall plot windows of one injector (WF-U2-003): by date, or by
// clicking two points on the plot, with the reason kept beside them. The
// windows refit through the engine's least-squares line
// (src/utils/waterflooddesign/hallWindows.js); a window left blank stays the
// engine's third.
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hallChoiceProblems, hallChoiceText } from '@/utils/waterflooddesign/hallWindows';

const empty = { baseline: { from: '', to: '' }, recent: { from: '', to: '' }, reason: '' };
const fromChoice = (c) => ({
  baseline: { from: c?.baseline?.from || '', to: c?.baseline?.to || '' },
  recent: { from: c?.recent?.from || '', to: c?.recent?.to || '' },
  reason: c?.reason || '',
});

export default function HallWindowEditor({ plot, choice, picked, pick, onStartPick, onCancelPick, onChoose, disabled = false }) {
  const inj = plot.injector;
  const [draft, setDraft] = useState(() => fromChoice(choice));
  useEffect(() => { setDraft(fromChoice(choice)); }, [choice]);
  // a window picked on the plot lands in the draft
  useEffect(() => {
    if (!picked) return;
    setDraft((d) => ({ ...d, ...(picked.baseline ? { baseline: picked.baseline } : {}), ...(picked.recent ? { recent: picked.recent } : {}) }));
  }, [picked]);
  const asChoice = () => {
    const out = { reason: draft.reason.trim(), setAt: new Date().toISOString() };
    for (const k of ['baseline', 'recent']) if (draft[k].from || draft[k].to) out[k] = { ...draft[k] };
    return out;
  };
  const problems = hallChoiceProblems(plot, asChoice());
  const set = (k, field, v) => setDraft((d) => ({ ...d, [k]: { ...d[k], [field]: v } }));
  const first = String(plot.dates?.[0] || '').slice(0, 10);
  const last = String(plot.dates?.[plot.dates.length - 1] || '').slice(0, 10);
  return (
    <div className="mt-3 rounded border border-slate-200 p-3 text-xs text-slate-700 space-y-2" data-testid={`hall-editor-${inj}`}>
      <p className="font-semibold text-slate-800">Windows for {inj} <span className="font-normal text-slate-500">(data {first} to {last})</span></p>
      {choice && <p className="text-slate-600" data-testid={`hall-choice-${inj}`}>{hallChoiceText(plot) || ''}</p>}
      {['baseline', 'recent'].map((k) => (
        <div key={k} className="flex flex-wrap items-end gap-2">
          <span className="w-16 text-slate-600">{k === 'baseline' ? 'Baseline' : 'Recent'}</span>
          <div>
            <Label htmlFor={`hall-${inj}-${k}-from`} className="text-[10px] text-slate-500">From</Label>
            <Input id={`hall-${inj}-${k}-from`} type="date" className="h-7 text-xs w-36" value={draft[k].from} min={first} max={last}
              onChange={(e) => set(k, 'from', e.target.value)} disabled={disabled} data-testid={`hall-${inj}-${k}-from`} />
          </div>
          <div>
            <Label htmlFor={`hall-${inj}-${k}-to`} className="text-[10px] text-slate-500">To</Label>
            <Input id={`hall-${inj}-${k}-to`} type="date" className="h-7 text-xs w-36" value={draft[k].to} min={first} max={last}
              onChange={(e) => set(k, 'to', e.target.value)} disabled={disabled} data-testid={`hall-${inj}-${k}-to`} />
          </div>
          {pick?.key === k ? (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onCancelPick} data-testid={`hall-${inj}-${k}-pick-cancel`}>
              {pick.from ? `From ${pick.from}: click the end point` : 'Click the first point on the plot'} (cancel)
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onStartPick(k)} disabled={disabled} data-testid={`hall-${inj}-${k}-pick`}>
              Pick on the plot
            </Button>
          )}
        </div>
      ))}
      <div>
        <Label htmlFor={`hall-${inj}-reason`} className="text-[10px] text-slate-500">Why these windows (printed with them)</Label>
        <Input id={`hall-${inj}-reason`} className="h-7 text-xs" value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          placeholder="For example: before and after the acid job of 2025-06" disabled={disabled} data-testid={`hall-${inj}-reason`} />
      </div>
      {problems.length > 0 && (draft.reason || draft.baseline.from || draft.recent.from) && (
        <p className="text-amber-700" data-testid={`hall-${inj}-problems`}>{problems.join(' ')}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-[11px]" disabled={disabled || problems.length > 0} onClick={() => onChoose(asChoice())} data-testid={`hall-${inj}-apply`}>Use these windows</Button>
        {choice && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled} onClick={() => { onChoose(null); setDraft(empty); }} data-testid={`hall-${inj}-clear`}>Back to the thirds</Button>
        )}
      </div>
    </div>
  );
}
