// Barriers tab: two-envelope element editor, envelope status roll-up,
// rule checks and the traffic-light category. Every verdict is the
// engine's — recomputed by the e2e spec through wiRun.

import React from 'react';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { ELEMENT_KINDS, ELEMENT_STATUSES } from '../services/wiRun';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const CATEGORY_CLASSES = {
  green: 'bg-emerald-500/20 text-emerald-300',
  yellow: 'bg-yellow-500/20 text-yellow-300',
  orange: 'bg-orange-500/20 text-orange-300',
  red: 'bg-red-500/20 text-red-300',
};

const STATUS_CLASSES = {
  intact: 'text-emerald-300',
  degraded: 'text-yellow-300',
  failed: 'text-red-300',
  empty: 'text-slate-500',
};

const ELEMENT_DOT = {
  verified: 'bg-emerald-400',
  degraded: 'bg-yellow-400',
  failed: 'bg-red-400',
  'not-verified': 'bg-slate-500',
};

const select = 'h-7 rounded border border-slate-700 bg-slate-800 px-1 text-xs text-slate-200';

export default function BarriersTab({ caseDraft, onCaseChange, res }) {
  const b = caseDraft.barrier;
  const v = res?.barriers || null;

  const setEl = (id, patch) => onCaseChange((d) => {
    const el = d.barrier.elements.find((e) => e.id === id);
    Object.assign(el, patch);
  });

  const envColumn = (envelope, label, status) => (
    <div className="flex-1 rounded border border-slate-800 bg-slate-950/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        {status && (
          <span className={STATUS_CLASSES[status.status]} data-testid={`wi-${envelope}-status`}>
            {status.status}
          </span>
        )}
      </div>
      {b.elements.filter((e) => e.envelope === envelope || e.envelope === 'both').map((e) => (
        <div key={e.id} className="flex items-center gap-2 py-0.5 text-xs text-slate-300">
          <span className={`h-2 w-2 rounded-full ${ELEMENT_DOT[e.status]}`} />
          <span className="truncate">{e.name}</span>
          {e.envelope === 'both' && <span className="text-[9px] text-amber-400">common</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Well status" testId="wi-status-card">
          <div className="flex items-center gap-3">
            {v && (
              <span className={`rounded px-3 py-1 text-sm font-bold uppercase ${CATEGORY_CLASSES[v.category]}`} data-testid="wi-category">
                {v.category}
              </span>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={b.flowPotential !== false} data-testid="wi-flow-potential"
                onChange={(e) => onCaseChange((d) => { d.barrier.flowPotential = e.target.checked; })} />
              Flow potential toward surface (two envelopes required)
            </label>
          </div>
          {v && <div className="mt-2 text-xs text-slate-400" data-testid="wi-category-reason">{v.reason}</div>}
          {v && (
            <div className="mt-2 flex flex-col gap-1 border-t border-slate-800 pt-2">
              {v.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs" data-testid={`wi-check-${c.id}`}>
                  <span className={c.pass ? 'text-emerald-400' : (c.level === 'fail' ? 'text-red-400' : 'text-amber-400')}>
                    {c.pass ? 'PASS' : (c.level === 'fail' ? 'FAIL' : 'WARN')}
                  </span>
                  <span className="text-slate-300">{c.label}{c.detail ? ` ${c.detail}` : ''}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[10px] text-slate-500">
            Status roll-up and rules only: the envelope drawing (that the elements form a sealed
            surface around the source) stays with the engineer.
          </div>
        </Card>

        <div className="flex gap-3">
          {envColumn('primary', 'Primary envelope', v?.primary)}
          {envColumn('secondary', 'Secondary envelope', v?.secondary)}
        </div>
      </div>

      <Card title="Barrier elements" testId="wi-elements-card">
        <div className="flex flex-col gap-1">
          {b.elements.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5">
              <Input className="h-7 flex-1 text-xs" value={e.name}
                onChange={(ev) => setEl(e.id, { name: ev.target.value })} />
              <select className={select} value={e.kind} onChange={(ev) => setEl(e.id, { kind: ev.target.value })}>
                {ELEMENT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <select className={select} value={e.envelope} data-testid={`wi-el-envelope-${e.id}`}
                onChange={(ev) => setEl(e.id, { envelope: ev.target.value })}>
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
                <option value="both">both (common)</option>
              </select>
              <select className={select} value={e.status} data-testid={`wi-el-status-${e.id}`}
                onChange={(ev) => setEl(e.id, { status: ev.target.value })}>
                {ELEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" className="text-slate-500 hover:text-red-400"
                onClick={() => onCaseChange((d) => { d.barrier.elements = d.barrier.elements.filter((x) => x.id !== e.id); })}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" data-testid="wi-add-element"
          className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
          onClick={() => onCaseChange((d) => {
            d.barrier.elements.push({
              id: `el-${Date.now()}`, name: 'New element', kind: 'casing',
              envelope: 'primary', status: 'not-verified',
            });
          })}>
          <Plus className="h-3 w-3" /> Add element
        </button>
      </Card>
    </div>
  );
}
