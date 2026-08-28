// Whatever is selected: a well, a junction, the delivery point, or a
// line. One panel rather than four, because they are edited the same
// way and switching between them should not move the controls around.
import React from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { Field, Num, Text, fmt } from './fields';

const WellInspector = ({ node }) => {
  const {
    setNode, setNodeModel, setNodeDuty, spineWells, loadWellFromSpine,
    inputs, wellProblems, result,
  } = useProductionNetwork();
  const problems = wellProblems.find((p) => p.id === node.id)?.problems || [];
  const solved = (result?.wells || []).find((w) => w.id === node.id);
  const isGas = node.model.well.phase === 'gas';

  return (
    <div className="space-y-4">
      <Field label="Name"><Text value={node.label} onChange={(v) => setNode(node.id, 'label', v)} /></Field>

      {inputs.link.fieldId && (
        <Field
          label="Shared well record"
          hint="The same description every other production studio designs against."
        >
          <Select
            value={node.spineWellId || ''}
            onValueChange={(v) => loadWellFromSpine(node.id, v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
              <SelectValue placeholder="Not linked" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {spineWells.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {solved && (
        <div className="rounded border border-slate-800 bg-slate-950/50 p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            In this network
          </p>
          <p className="text-lg font-semibold tabular-nums text-emerald-400">
            {fmt(solved.qoStbd)} <span className="text-xs font-normal text-slate-500">stb/d</span>
          </p>
          <p className="text-[11px] text-slate-500">
            at {fmt(solved.whpPsia)} psia wellhead
          </p>
          {Number.isFinite(solved.qoAloneStbd) && (
            <p className="text-[11px] text-amber-400">
              On its own against the same separator it would make {fmt(solved.qoAloneStbd)} stb/d.
              The other wells are costing it {fmt(solved.qoAloneStbd - solved.qoStbd)} stb/d,{' '}
              {fmt(solved.lostFraction * 100, 1)} percent.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          Producing conditions
        </p>
        {isGas ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Water-gas ratio (bbl/MMscf)">
              <Num value={node.duty.wgr} onChange={(v) => setNodeDuty(node.id, 'wgr', v)} />
            </Field>
            <Field label="Condensate-gas ratio (bbl/MMscf)">
              <Num value={node.duty.cgr} onChange={(v) => setNodeDuty(node.id, 'cgr', v)} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Water cut (%)">
              <Num value={node.duty.wctPct} onChange={(v) => setNodeDuty(node.id, 'wctPct', v)} />
            </Field>
            <Field label="Gas-oil ratio (scf/stb)" hint="Blank uses the fluid model's">
              <Num value={node.duty.gor} onChange={(v) => setNodeDuty(node.id, 'gor', v)} />
            </Field>
          </div>
        )}
        <p className="text-[11px] text-slate-600">
          What the well is flowing today, so it stays with the network rather than going into the
          shared record. The wellhead pressure is NOT here: in a network nobody sets it, the
          network does.
        </p>
      </div>

      {problems.length > 0 && (
        <div className="space-y-1">
          {problems.map((p) => (<p key={p} className="text-[11px] text-rose-400">{p}</p>))}
        </div>
      )}

      <div className="border-t border-slate-800 pt-3">
        <SharedWellModelPanel
          inputs={node.model}
          setSection={(section, key, value) => setNodeModel(node.id, section, key, value)}
          showCompletion
          depthLabel="Perforation depth (ft TVD)"
          depthHint="The node depth. The tubing is marched between here and the wellhead."
          fluidNote="The wellhead pressure this well ends up at is solved, not entered: it is whatever the header leaves it."
        />
      </div>
    </div>
  );
};

const SinkInspector = ({ node }) => {
  const { setNode } = useProductionNetwork();
  return (
    <div className="space-y-3">
      <Field label="Name"><Text value={node.label} onChange={(v) => setNode(node.id, 'label', v)} /></Field>
      <Field
        label="Delivery pressure (psia)"
        hint="The boundary the whole system is solved against, and usually the one thing an operator can actually change tomorrow. The Sensitivity tab sweeps it."
      >
        <Num value={node.pressurePsia} onChange={(v) => setNode(node.id, 'pressurePsia', v)} />
      </Field>
    </div>
  );
};

const JunctionInspector = ({ node }) => {
  const { setNode, result } = useProductionNetwork();
  const p = result?.solution?.pressures?.[node.id];
  return (
    <div className="space-y-3">
      <Field label="Name"><Text value={node.label} onChange={(v) => setNode(node.id, 'label', v)} /></Field>
      {Number.isFinite(p) && (
        <p className="text-[11px] text-slate-500">
          Solved at {fmt(p)} psia. Nothing is entered here: a header's pressure is a result, and it
          is the result every well on it is fighting.
        </p>
      )}
    </div>
  );
};

const BranchInspector = ({ branch }) => {
  const {
    setBranch, applySchedule, pipeSchedule, roughnessOptions, grades,
    barlowPressurePsi, result, inputs,
  } = useProductionNetwork();
  const solved = (result?.branches || []).find((b) => b.id === branch.id);
  const row = pipeSchedule.find(
    (r) => String(r.nps) === String(branch.npsPick) && r.schedule === branch.schedulePick,
  );
  const mawp = row
    ? barlowPressurePsi({
      odIn: row.od,
      wallIn: row.wall,
      yieldPsi: (grades.find((g) => g.id === branch.gradeId) || {}).yieldPsi,
      designFactor: Number(branch.designFactor),
    })
    : NaN;
  const upstream = result?.solution?.pressures?.[branch.from];

  return (
    <div className="space-y-3">
      <Field label="Name"><Text value={branch.label} onChange={(v) => setBranch(branch.id, 'label', v)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Length (ft)">
          <Num value={branch.lengthFt} onChange={(v) => setBranch(branch.id, 'lengthFt', v)} />
        </Field>
        <Field label="Rise (ft)" hint="Negative if it falls">
          <Num value={branch.riseFt} onChange={(v) => setBranch(branch.id, 'riseFt', v)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Nominal size">
          <Select
            value={branch.npsPick}
            onValueChange={(v) => applySchedule(branch.id, v, branch.schedulePick)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {[...new Set(pipeSchedule.map((r) => r.nps))].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} inch</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Schedule">
          <Select
            value={branch.schedulePick}
            onValueChange={(v) => applySchedule(branch.id, branch.npsPick, v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {[...new Set(pipeSchedule.map((r) => r.schedule))].map((s) => (
                <SelectItem key={s} value={s}>Schedule {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        label="Bore (in)"
        hint="Filled in by the schedule above and still editable, because the table is a working subset and a real line may not be in it."
      >
        <Num value={branch.idIn} onChange={(v) => setBranch(branch.id, 'idIn', v)} step="0.001" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Roughness (in)">
          <Num value={branch.roughnessIn} onChange={(v) => setBranch(branch.id, 'roughnessIn', v)} step="0.0001" />
        </Field>
        <Field label="Flowing temperature (F)">
          <Num value={branch.tempF} onChange={(v) => setBranch(branch.id, 'tempF', v)} />
        </Field>
      </div>
      <p className="text-[11px] text-slate-600">
        The line temperature is an input here. Solving the thermal profile is what the Flow
        Assurance Studio does, on one line at a time and in far more detail than a network solve
        needs; taking a number from there and typing it here is the honest way round.
      </p>

      <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-2">
        <Field label="Grade">
          <Select value={branch.gradeId} onValueChange={(v) => setBranch(branch.id, 'gradeId', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {grades.map((g) => (<SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Design factor" hint="Yours, not ours">
          <Num value={branch.designFactor} onChange={(v) => setBranch(branch.id, 'designFactor', v)} step="0.01" />
        </Field>
      </div>
      {Number.isFinite(mawp) && (
        <p className={`text-[11px] ${Number.isFinite(upstream) && upstream > mawp ? 'text-rose-400' : 'text-slate-500'}`}>
          Barlow allows {fmt(mawp)} psi on this wall at that design factor.
          {Number.isFinite(upstream) && upstream > mawp
            ? ` The solved upstream pressure is ${fmt(upstream)} psia, which is over it.`
            : Number.isFinite(upstream) ? ` The solved upstream pressure is ${fmt(upstream)} psia.` : ''}
        </p>
      )}

      {solved && (
        <div className="border-t border-slate-800 pt-3 space-y-1">
          <p className="text-[11px] text-slate-500">
            Carrying {fmt(solved.stream.qoStbd)} stb/d oil and {fmt(solved.stream.qwStbd)} stb/d
            water for {fmt(solved.dpPsi)} psi.
          </p>
          {solved.wctPct != null && (
            <p className="text-[11px] text-slate-600">
              Water cut in the line: {fmt(solved.wctPct, 1)} percent, which is the rate-weighted mix
              of whatever feeds it and not the average of their water cuts.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const InspectorPanel = () => {
  const { inputs, selectedId } = useProductionNetwork();
  const node = inputs.nodes.find((n) => n.id === selectedId);
  const branch = inputs.branches.find((b) => b.id === selectedId);

  if (!node && !branch) {
    return (
      <p className="text-[11px] text-slate-600">
        Pick a node or a line, on the drawing or in the list above.
      </p>
    );
  }
  if (branch) return <BranchInspector branch={branch} />;
  if (node.kind === 'well') return <WellInspector node={node} />;
  if (node.kind === 'sink') return <SinkInspector node={node} />;
  return <JunctionInspector node={node} />;
};

export default InspectorPanel;
