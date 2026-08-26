// String & Program tab: the ordered component stack (top to bottom, stack-up
// MDs live from the engine), the casing program (snapshot of a D6 casing
// case or manual sections), and the grouped BOM with CSV export.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash, ArrowUp, ArrowDown, Download } from 'lucide-react';
import AddComponentDialog from './AddComponentDialog';
import {
  bomFromCase, bomCsv, programFromCtCase, depthDisp, depthLabel,
} from '../services/cdRun';
import { CASING_CATALOG } from '../../CasingTubingDesignPro/engine/tubulars';

const Section = ({ title, children, action }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40">
    <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
      {action}
    </div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export default function StringBuilderTab({ caseDraft, onCaseChange, res, depthUnit, ctCases }) {
  const [addOpen, setAddOpen] = useState(false);
  const [ctPick, setCtPick] = useState('');
  const unit = depthLabel(depthUnit);
  const components = caseDraft.string?.components || [];
  const stackRows = res?.stack?.components || [];
  const program = caseDraft.casing_program || { source: 'manual', strings: [] };

  const mutate = (fn) => onCaseChange(fn);

  const moveComponent = (i, dir) => mutate((d) => {
    const arr = d.string.components;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  });

  const bom = res ? bomFromCase(caseDraft) : [];

  const exportBom = () => {
    const blob = new Blob([bomCsv(caseDraft)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${caseDraft.name || 'completion'}-bom.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-5">
      <div className="space-y-3 xl:col-span-3">
        <Section title={`Completion string (top to bottom, MD ${unit})`}
          action={(
            <Button size="sm" variant="outline" className="h-6 border-lime-600 text-[11px] text-lime-400 hover:bg-lime-600 hover:text-white"
              onClick={() => setAddOpen(true)} data-testid="cd-add-component">
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          )}>
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left">Component</th>
                <th className="px-1 py-1 text-right">Length (m)</th>
                <th className="px-1 py-1 text-right">OD (in)</th>
                <th className="px-1 py-1 text-right">ID (in)</th>
                <th className="px-1 py-1 text-right">Top</th>
                <th className="px-1 py-1 text-right">Bottom</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {components.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-center italic text-slate-500">Empty string. Add components from the catalog.</td></tr>
              )}
              {components.map((c, i) => {
                const sr = stackRows[i];
                return (
                  <tr key={c.id} className="border-t border-slate-800 text-slate-300" data-testid={`cd-comp-${i}`}>
                    <td className="px-1 py-1" title={c.notes || ''}>
                      {c.name}{c.approx ? <span className="ml-1 text-[9px] text-amber-500/80" title="nominal planning dimensions">≈</span> : null}
                    </td>
                    <td className="px-1 py-1 text-right">
                      <Input type="number" step="0.1" value={c.lengthM}
                        onChange={(e) => mutate((d) => { d.string.components[i].lengthM = num(e.target.value); })}
                        className="ml-auto h-6 w-24 bg-slate-900 border-slate-700 text-right font-mono text-[11px]"
                        data-testid={`cd-comp-len-${i}`} />
                    </td>
                    <td className="px-1 py-1 text-right font-mono">{c.odIn}</td>
                    <td className="px-1 py-1 text-right font-mono">{c.idIn}</td>
                    <td className="px-1 py-1 text-right font-mono text-slate-400">{sr ? Math.round(depthDisp(sr.topMdM, depthUnit)) : '—'}</td>
                    <td className="px-1 py-1 text-right font-mono text-slate-400">{sr ? Math.round(depthDisp(sr.bottomMdM, depthUnit)) : '—'}</td>
                    <td className="px-1 py-1 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-slate-200" onClick={() => moveComponent(i, -1)}><ArrowUp className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-slate-200" onClick={() => moveComponent(i, +1)}><ArrowDown className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-red-400"
                          onClick={() => mutate((d) => { d.string.components.splice(i, 1); })} data-testid={`cd-comp-del-${i}`}>
                          <Trash className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
            <span>Hanger MD ({unit})</span>
            <Input type="number" value={depthDisp(caseDraft.string?.hangerMdM ?? 0, depthUnit)}
              onChange={(e) => mutate((d) => { d.string.hangerMdM = num(e.target.value) / (depthUnit === 'ft' ? 3.280839895 : 1); })}
              className="h-6 w-24 bg-slate-900 border-slate-700 text-right font-mono text-[11px]" />
            {res && (
              <span data-testid="cd-string-bottom">
                String bottom {Math.round(depthDisp(res.stack.bottomMdM, depthUnit))} {unit} · {components.length} components
              </span>
            )}
          </div>
        </Section>

        <Section title="Bill of materials"
          action={(
            <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-400 hover:text-slate-200" onClick={exportBom} data-testid="cd-bom-export">
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
          )}>
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left">Item</th>
                <th className="px-1 py-1 text-right">Qty</th>
                <th className="px-1 py-1 text-right">Total length (m)</th>
                <th className="px-1 py-1 text-right">OD (in)</th>
                <th className="px-1 py-1 text-left">Dimensions</th>
              </tr>
            </thead>
            <tbody data-testid="cd-bom">
              {bom.map((r) => (
                <tr key={`${r.type}-${r.name}`} className="border-t border-slate-800 text-slate-300">
                  <td className="px-1 py-1">{r.name}</td>
                  <td className="px-1 py-1 text-right font-mono">{r.quantity}</td>
                  <td className="px-1 py-1 text-right font-mono">{r.totalLengthM.toFixed(1)}</td>
                  <td className="px-1 py-1 text-right font-mono">{r.odIn}</td>
                  <td className="px-1 py-1 text-[10px] text-slate-500">{r.approx ? 'nominal (verify vendor sheet)' : 'as entered'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="space-y-3 xl:col-span-2">
        <Section title="Casing program (run-in clearance basis)">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
            <span>Source:</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300" data-testid="cd-program-source">
              {program.source === 'ct_case' ? `Casing & Tubing case "${program.ct_case_name || program.ct_case_id}" (snapshot)` : 'Manual sections'}
            </span>
          </div>
          {ctCases?.length > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <Select value={ctPick} onValueChange={setCtPick}>
                <SelectTrigger className="h-7 flex-1 bg-slate-900 border-slate-700 text-xs" data-testid="cd-ct-pick">
                  <SelectValue placeholder="Pick a Casing & Tubing case…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {ctCases.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!ctPick}
                onClick={() => {
                  const ct = ctCases.find((c) => c.id === ctPick);
                  if (ct) mutate((d) => { d.casing_program = programFromCtCase(ct); });
                }}
                data-testid="cd-ct-snapshot">
                Snapshot
              </Button>
            </div>
          )}
          {(program.strings || []).map((s, si) => (
            <div key={s.id || si} className="mb-2 rounded border border-slate-800/70 p-1.5">
              <div className="mb-1 flex items-center justify-between">
                <Input value={s.name}
                  onChange={(e) => mutate((d) => { d.casing_program.strings[si].name = e.target.value; })}
                  className="h-6 w-48 bg-slate-900 border-slate-700 text-[11px]" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-red-400"
                  onClick={() => mutate((d) => { d.casing_program.strings.splice(si, 1); d.casing_program.source = 'manual'; })}>
                  <Trash className="h-3 w-3" />
                </Button>
              </div>
              {(s.sections || []).map((sec, i) => (
                <div key={sec.id || i} className="mb-1 flex items-center gap-1 text-[11px]">
                  <Input type="number" value={depthDisp(sec.topMdM, depthUnit)} title={`Top MD (${unit})`}
                    onChange={(e) => mutate((d) => { d.casing_program.strings[si].sections[i].topMdM = num(e.target.value) / (depthUnit === 'ft' ? 3.280839895 : 1); d.casing_program.source = 'manual'; })}
                    className="h-6 w-20 bg-slate-900 border-slate-700 text-right font-mono text-[11px]" />
                  <span className="text-slate-600">–</span>
                  <Input type="number" value={depthDisp(sec.bottomMdM, depthUnit)} title={`Bottom MD (${unit})`}
                    onChange={(e) => mutate((d) => { d.casing_program.strings[si].sections[i].bottomMdM = num(e.target.value) / (depthUnit === 'ft' ? 3.280839895 : 1); d.casing_program.source = 'manual'; })}
                    className="h-6 w-20 bg-slate-900 border-slate-700 text-right font-mono text-[11px]" />
                  <Select value={`${sec.odIn}|${sec.weightLbFt}`}
                    onValueChange={(v) => {
                      const [odIn, weightLbFt] = v.split('|').map(parseFloat);
                      mutate((d) => {
                        d.casing_program.strings[si].sections[i].odIn = odIn;
                        d.casing_program.strings[si].sections[i].weightLbFt = weightLbFt;
                        d.casing_program.source = 'manual';
                      });
                    }}>
                    <SelectTrigger className="h-6 flex-1 bg-slate-900 border-slate-700 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {CASING_CATALOG.map((r) => (
                        <SelectItem key={r.designation} value={`${r.odIn}|${r.weightLbFt}`}>{r.designation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-red-400"
                    onClick={() => mutate((d) => { d.casing_program.strings[si].sections.splice(i, 1); d.casing_program.source = 'manual'; })}>
                    <Trash className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-5 text-[10px] text-slate-500 hover:text-slate-300"
                onClick={() => mutate((d) => {
                  const secs = d.casing_program.strings[si].sections;
                  const last = secs[secs.length - 1];
                  secs.push({ id: `sec-${Date.now()}`, topMdM: last ? last.bottomMdM : 0, bottomMdM: (last ? last.bottomMdM : 0) + 500, odIn: last?.odIn ?? 9.625, weightLbFt: last?.weightLbFt ?? 47 });
                  d.casing_program.source = 'manual';
                })}>
                + section
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-500 hover:text-slate-300"
            onClick={() => mutate((d) => {
              d.casing_program.strings.push({ id: `str-${Date.now()}`, name: 'Liner', sections: [{ id: `sec-${Date.now()}`, topMdM: 2000, bottomMdM: 3000, odIn: 7, weightLbFt: 29 }] });
              d.casing_program.source = 'manual';
            })} data-testid="cd-add-string">
            <Plus className="mr-1 h-3 w-3" /> Add casing string
          </Button>
          <p className="mt-1 text-[10px] text-slate-500">
            A snapshotted Casing &amp; Tubing case does not follow later edits to that case. Re-snapshot to refresh.
          </p>
        </Section>
      </div>

      <AddComponentDialog open={addOpen} onOpenChange={setAddOpen}
        onAdd={(comp) => mutate((d) => {
          // Insert above the wireline entry guide when it is the last item;
          // jewelry lands where the engineer expects instead of below the shoe joint.
          const arr = d.string.components;
          const lastIsWeg = arr.length && arr[arr.length - 1].type === 'weg';
          arr.splice(lastIsWeg ? arr.length - 1 : arr.length, 0, comp);
        })} />
    </div>
  );
}
