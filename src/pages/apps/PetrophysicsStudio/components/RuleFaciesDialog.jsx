// Rule-based facies dialog (Petrophysics Studio PT9e): an ordered list of
// classes, each a set of cutoff conditions on any curve the well carries
// (inputs and pipeline outputs). The first class whose conditions all
// hold names a sample. Apply draws the result as a strip track in the
// active layout; Publish writes it to the registry as electrofacies
// intervals, the same rows Well Correlation, Well Data Manager and
// Stratigraphy Studio draw.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import {
  RULE_OPS, RULE_CURVES, defaultRules, nextColor, validateRules, classifyRules, classThickness, describeRule,
} from '../services/ruleFacies';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function RuleFaciesDialog({
  open, onOpenChange, rules, curvesByKey, depth, depthUnit = 'm', canPublish = false, onApply, onPublish, onStatus,
}) {
  const [draft, setDraft] = useState(() => rules || defaultRules());
  useEffect(() => { if (open) setDraft(rules && rules.length ? rules : defaultRules()); }, [open, rules]);

  const problems = useMemo(() => validateRules(draft), [draft]);
  const available = useMemo(() => RULE_CURVES.filter((k) => curvesByKey?.[k]), [curvesByKey]);
  const preview = useMemo(() => {
    if (!depth || !curvesByKey || problems.length) return null;
    const { data, missing } = classifyRules(curvesByKey, draft, depth.length);
    const { thickness, unclassified } = classThickness(depth, data, draft.length);
    return { data, missing, thickness, unclassified };
  }, [draft, curvesByKey, depth, problems]);
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;

  const setRule = (i, patch) => setDraft((d) => d.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setCond = (i, j, patch) => setRule(i, { conditions: draft[i].conditions.map((c, k) => (k === j ? { ...c, ...patch } : c)) });
  const addCond = (i) => setRule(i, { conditions: [...draft[i].conditions, { curve: available[0] || 'VSH', op: '<', value: 0.5 }] });
  const delCond = (i, j) => setRule(i, { conditions: draft[i].conditions.filter((_, k) => k !== j) });
  const move = (i, dir) => setDraft((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const next = d.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addClass = () => setDraft((d) => [...d, { name: `Class ${d.length + 1}`, color: nextColor(d.length), conditions: [] }]);
  const delClass = (i) => setDraft((d) => d.filter((_, k) => k !== i));

  const apply = () => {
    if (problems.length) return;
    onApply(draft);
    onStatus?.(`Applied ${draft.length} facies classes; the Rule facies strip is on the active layout.`);
    onOpenChange(false);
  };
  const publish = async () => {
    if (problems.length) return;
    await onPublish(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-rule-facies-dialog">
        <DialogHeader>
          <DialogTitle>Facies by rules</DialogTitle>
          <DialogDescription className="text-slate-400">
            Classes are tried top to bottom; the first whose conditions all hold names the sample.
            A class with no conditions catches everything left. Conditions on a missing curve never hold.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto space-y-2 text-xs">
          {draft.map((r, i) => (
            <div key={i} className="rounded border border-slate-800 p-2 space-y-1" data-testid={`petro-rf-class-${i}`}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={r.color}
                  className="w-6 h-6 rounded border border-slate-700 bg-transparent"
                  data-testid={`petro-rf-color-${i}`}
                  onChange={(e) => setRule(i, { color: e.target.value })}
                />
                <input
                  className={`${inputCls} w-40`}
                  value={r.name}
                  data-testid={`petro-rf-name-${i}`}
                  onChange={(e) => setRule(i, { name: e.target.value })}
                />
                <span className="text-slate-500 truncate" title={describeRule(r)}>{describeRule(r)}</span>
                {preview && (
                  <span className="ml-auto text-slate-300 whitespace-nowrap" data-testid={`petro-rf-thickness-${r.name}`}>
                    {fmt(preview.thickness[i] * F)} {depthUnit}
                  </span>
                )}
                <button type="button" className="text-slate-500 hover:text-slate-200" title="Move up" onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" className="text-slate-500 hover:text-slate-200" title="Move down" onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" className="text-slate-500 hover:text-red-400" title="Delete class" data-testid={`petro-rf-delete-${i}`} onClick={() => delClass(i)}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-8">
                {r.conditions.map((c, j) => (
                  <div key={j} className="flex items-center gap-1">
                    <select className={inputCls} value={c.curve} data-testid={`petro-rf-curve-${i}-${j}`} onChange={(e) => setCond(i, j, { curve: e.target.value })}>
                      {RULE_CURVES.map((k) => <option key={k} value={k}>{k}{curvesByKey?.[k] ? '' : ' (missing)'}</option>)}
                    </select>
                    <select className={inputCls} value={c.op} onChange={(e) => setCond(i, j, { op: e.target.value })}>
                      {RULE_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className={`${inputCls} w-16`} value={String(c.value)} data-testid={`petro-rf-value-${i}-${j}`} onChange={(e) => setCond(i, j, { value: e.target.value })} />
                    <button type="button" className="text-slate-500 hover:text-red-400" title="Remove condition" onClick={() => delCond(i, j)}>×</button>
                    {j < r.conditions.length - 1 && <span className="text-slate-500">and</span>}
                  </div>
                ))}
                <button type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200" data-testid={`petro-rf-addcond-${i}`} onClick={() => addCond(i)}>
                  <Plus className="w-3 h-3 inline" /> condition
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="button" className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="petro-rf-addclass" onClick={addClass}>
              <Plus className="w-3 h-3 inline" /> Add class
            </button>
            <button type="button" className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800" onClick={() => setDraft(defaultRules())}>
              Reset to defaults
            </button>
            {preview && (
              <span className="ml-auto text-slate-500" data-testid="petro-rf-unclassified">
                unclassified {fmt(preview.unclassified * F)} {depthUnit}
                {preview.missing.length ? ` · missing curves: ${preview.missing.join(', ')}` : ''}
              </span>
            )}
          </div>
          {problems.length > 0 && (
            <ul className="text-red-300 list-disc pl-5" data-testid="petro-rf-problems">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="petro-rule-facies-publish"
            disabled={!canPublish || problems.length > 0 || !preview}
            title={canPublish ? 'Write these classes to the registry as electrofacies intervals' : 'Org-shared wells are read-only'}
            className="border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
            onClick={publish}
          >
            Publish as electrofacies
          </Button>
          <Button
            size="sm"
            data-testid="petro-rule-facies-apply"
            disabled={problems.length > 0 || !preview}
            className="bg-cyan-700 hover:bg-cyan-600 text-white"
            onClick={apply}
          >
            Apply to tracks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
