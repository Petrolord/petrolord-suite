// String & Geometry tab: drillstring builder (catalog-driven), hole/casing
// sections (wp_wellbore_geometry, the module-wide spine), mud + friction +
// operations config. Storage is SI; inputs use field conventions (diameters
// in inches, lengths in the wellbore depth unit, mud in ppg/SG).

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, ArrowDownToLine } from 'lucide-react';
import {
  DRILL_PIPE, HWDP, DRILL_COLLARS, CASING_QUICK, GRADES, gradeYieldPa,
} from '../engine/tubulars';
import { depthOut, depthIn, totalStringLengthM } from '../services/tdRun';
import { OPERATIONS } from '../engine/torqueDrag';

const IN = 0.0254;
const LBFT = 1.4881639;

const CATALOGS = { dp: DRILL_PIPE, hwdp: HWDP, dc: DRILL_COLLARS };
const TYPE_LABELS = { dp: 'Drill pipe', hwdp: 'HWDP', dc: 'Drill collar' };
const OP_LABELS = {
  trip_out: 'Trip out', trip_in: 'Trip in', rotate_off_bottom: 'Rotate off btm',
  rotate_on_bottom: 'Rotate on btm', slide_drill: 'Slide drill', backream: 'Backream',
};

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

function Section({ title, children, actions }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

// ---- drillstring ----------------------------------------------------------

function StringBuilder({ caseDraft, onChange, depthUnit, tdM }) {
  const string = caseDraft.string || [];
  const set = (i, patch) => {
    const next = string.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onChange({ string: next });
  };
  const applyCatalog = (i, type, designation) => {
    const item = (CATALOGS[type] || []).find((x) => x.designation === designation);
    if (!item) return;
    set(i, {
      type,
      label: item.designation,
      odM: item.odM,
      idM: item.idM,
      weightKgM: item.weightKgM,
      tooljointOdM: item.tooljointOdM ?? null,
    });
  };
  const add = () => onChange({
    string: [...string, {
      type: 'dp', label: DRILL_PIPE[3].designation, lengthM: 500,
      odM: DRILL_PIPE[3].odM, idM: DRILL_PIPE[3].idM,
      weightKgM: DRILL_PIPE[3].weightKgM, tooljointOdM: DRILL_PIPE[3].tooljointOdM,
      grade: 'S-135', yieldPa: gradeYieldPa('S-135'),
    }],
  });
  const remove = (i) => onChange({ string: string.filter((_, j) => j !== i) });
  const fillToTd = () => {
    if (!string.length || !tdM) return;
    const others = string.slice(0, -1).reduce((a, c) => a + c.lengthM, 0);
    const last = string[string.length - 1];
    const fill = Math.max(0, tdM - others);
    onChange({ string: string.map((c, j) => (j === string.length - 1 ? { ...c, lengthM: fill } : c)) });
    return { last, fill };
  };
  const totalM = totalStringLengthM(string);

  return (
    <Section
      title={`Drillstring (bottom up) — total ${depthOut(totalM, depthUnit).toFixed(0)} ${depthUnit} of TD ${depthOut(tdM || 0, depthUnit).toFixed(0)} ${depthUnit}`}
      actions={(
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={fillToTd} data-testid="td-fill-to-td">
            <ArrowDownToLine className="mr-1 h-3 w-3" /> Fill last to TD
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={add} data-testid="td-add-component">
            <Plus className="mr-1 h-3 w-3" /> Component
          </Button>
        </>
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-300">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500">
              <th className="p-1 text-left">Pos</th>
              <th className="p-1 text-left">Type</th>
              <th className="p-1 text-left">Catalog</th>
              <th className="p-1 text-right">Length ({depthUnit})</th>
              <th className="p-1 text-right">OD (in)</th>
              <th className="p-1 text-right">ID (in)</th>
              <th className="p-1 text-right">Wt ({depthUnit === 'ft' ? 'lb/ft' : 'kg/m'})</th>
              <th className="p-1 text-right">TJ OD (in)</th>
              <th className="p-1 text-left">Grade</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {string.map((c, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="p-1 text-slate-500">{i === 0 ? 'Bit end' : i + 1}</td>
                <td className="p-1">
                  <Select value={c.type} onValueChange={(t) => applyCatalog(i, t, (CATALOGS[t] || [])[0]?.designation)}>
                    <SelectTrigger className={`${cell} w-24`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(CATALOGS).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Select value={c.label || ''} onValueChange={(d) => applyCatalog(i, c.type, d)}>
                    <SelectTrigger className={`${cell} w-48`}><SelectValue placeholder="pick" /></SelectTrigger>
                    <SelectContent>
                      {(CATALOGS[c.type] || []).map((item) => (
                        <SelectItem key={item.designation} value={item.designation}>{item.designation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Input className={`${cell} w-20 text-right`} value={Math.round(depthOut(c.lengthM, depthUnit))}
                    onChange={(e) => set(i, { lengthM: depthIn(num(e.target.value), depthUnit) })}
                    data-testid={`td-len-${i}`} />
                </td>
                <td className="p-1 text-right">{(c.odM / IN).toFixed(3)}</td>
                <td className="p-1 text-right">{(c.idM / IN).toFixed(3)}</td>
                <td className="p-1 text-right">
                  {depthUnit === 'ft' ? (c.weightKgM / LBFT).toFixed(1) : c.weightKgM.toFixed(1)}
                </td>
                <td className="p-1 text-right">{c.tooljointOdM ? (c.tooljointOdM / IN).toFixed(3) : '--'}</td>
                <td className="p-1">
                  {c.type === 'dp' ? (
                    <Select value={c.grade || 'S-135'} onValueChange={(g) => set(i, { grade: g, yieldPa: gradeYieldPa(g) })}>
                      <SelectTrigger className={`${cell} w-20`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRADES.map((g) => <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : '--'}
                </td>
                <td className="p-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400"
                    onClick={() => remove(i)} disabled={string.length <= 1}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---- hole sections --------------------------------------------------------

function GeometryEditor({ holeSections, onChangeSections, depthUnit }) {
  const set = (i, patch) => onChangeSections(holeSections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    const lastTo = holeSections.length ? holeSections[holeSections.length - 1].to_md_m : 0;
    onChangeSections([...holeSections, {
      from_md_m: lastTo, to_md_m: lastTo + 500, hole_id_m: 8.5 * IN, cased: false, description: '',
    }]);
  };
  const applyCasing = (i, designation) => {
    const item = CASING_QUICK.find((x) => x.designation === designation);
    if (!item) return;
    set(i, {
      cased: true,
      casing_od_m: item.odM,
      casing_id_m: item.idM,
      casing_weight_kgm: item.weightKgM,
      description: item.designation,
    });
  };
  const remove = (i) => onChangeSections(holeSections.filter((_, j) => j !== i));

  return (
    <Section title="Hole & casing sections" actions={(
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={add} data-testid="td-add-section">
        <Plus className="mr-1 h-3 w-3" /> Section
      </Button>
    )}>
      <table className="w-full text-xs text-slate-300">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500">
            <th className="p-1 text-right">From ({depthUnit})</th>
            <th className="p-1 text-right">To ({depthUnit})</th>
            <th className="p-1 text-center">Cased</th>
            <th className="p-1 text-left">Casing</th>
            <th className="p-1 text-right">Hole/Csg ID (in)</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {holeSections.map((s, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="p-1">
                <Input className={`${cell} w-20 text-right`} value={Math.round(depthOut(s.from_md_m, depthUnit))}
                  onChange={(e) => set(i, { from_md_m: depthIn(num(e.target.value), depthUnit) })} />
              </td>
              <td className="p-1">
                <Input className={`${cell} w-20 text-right`} value={Math.round(depthOut(s.to_md_m, depthUnit))}
                  onChange={(e) => set(i, { to_md_m: depthIn(num(e.target.value), depthUnit) })} />
              </td>
              <td className="p-1 text-center">
                <Checkbox checked={!!s.cased} onCheckedChange={(v) => set(i, { cased: !!v })} />
              </td>
              <td className="p-1">
                {s.cased ? (
                  <Select value={s.description || ''} onValueChange={(d) => applyCasing(i, d)}>
                    <SelectTrigger className={`${cell} w-44`}><SelectValue placeholder="pick casing" /></SelectTrigger>
                    <SelectContent>
                      {CASING_QUICK.map((item) => (
                        <SelectItem key={item.designation} value={item.designation}>{item.designation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : <span className="text-slate-600">open hole</span>}
              </td>
              <td className="p-1">
                <Input className={`${cell} w-20 text-right`}
                  value={(((s.cased ? s.casing_id_m : s.hole_id_m) || 0) / IN).toFixed(3)}
                  onChange={(e) => set(i, s.cased
                    ? { casing_id_m: num(e.target.value) * IN }
                    : { hole_id_m: num(e.target.value) * IN })} />
              </td>
              <td className="p-1">
                <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => remove(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ---- mud / friction / operations ------------------------------------------

function Param({ label, value, onChange, testId, step = 'any' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <Input type="number" step={step} className={`${cell} w-28 text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

function OpsEditor({ caseDraft, onChange, depthUnit }) {
  const mud = caseDraft.mud || {};
  const friction = caseDraft.friction || {};
  const ops = caseDraft.operations || {};
  const ft = depthUnit === 'ft';
  const setOps = (patch) => onChange({ operations: { ...ops, ...patch } });
  const wear = ops.wear || { schedule: [{ rpm: 120, hours: 24 }], wearFactorMm3PerKNm: 1, intervalM: 30 };

  return (
    <Section title="Mud, friction & operations">
      <div className="flex flex-wrap items-end gap-3">
        <Param label={ft ? 'Mud (ppg)' : 'Mud (kg/m3)'}
          value={ft ? +((mud.densityKgM3 || 0) / 119.826).toFixed(2) : (mud.densityKgM3 || 0)}
          onChange={(v) => onChange({ mud: { densityKgM3: ft ? v * 119.826 : v } })}
          testId="td-mud" />
        <Param label="FF cased" value={friction.cased ?? 0.25}
          onChange={(v) => onChange({ friction: { ...friction, cased: v } })} testId="td-ff-cased" />
        <Param label="FF open" value={friction.open ?? 0.35}
          onChange={(v) => onChange({ friction: { ...friction, open: v } })} testId="td-ff-open" />
        <Param label={ft ? 'WOB (klbf)' : 'WOB (kN)'}
          value={ft ? +((ops.wobN || 0) / 4448.2216153).toFixed(1) : +((ops.wobN || 0) / 1e3).toFixed(1)}
          onChange={(v) => setOps({ wobN: ft ? v * 4448.2216153 : v * 1e3 })} testId="td-wob" />
        <Param label={ft ? 'Bit torque (kft-lbf)' : 'Bit torque (kN-m)'}
          value={ft ? +((ops.bitTorqueNm || 0) / 1355.8179483).toFixed(2) : +((ops.bitTorqueNm || 0) / 1e3).toFixed(2)}
          onChange={(v) => setOps({ bitTorqueNm: ft ? v * 1355.8179483 : v * 1e3 })} testId="td-bittq" />
        <Param label="Trip speed (m/s)" value={ops.tripSpeedMs ?? 0.3}
          onChange={(v) => setOps({ tripSpeedMs: v })} />
        <Param label="RPM" value={ops.rpm ?? 120} onChange={(v) => setOps({ rpm: v })} testId="td-rpm" />
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {OPERATIONS.map((op) => (
          <label key={op} className="flex items-center gap-1.5 text-xs text-slate-300">
            <Checkbox
              checked={(ops.ops || []).includes(op)}
              onCheckedChange={(v) => {
                const cur = new Set(ops.ops || []);
                if (v) cur.add(op); else cur.delete(op);
                setOps({ ops: OPERATIONS.filter((o) => cur.has(o)) });
              }}
              data-testid={`td-op-${op}`}
            />
            {OP_LABELS[op]}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-800 pt-3">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Casing wear</span>
        <Param label="Rotating hours" value={wear.schedule?.[0]?.hours ?? 0}
          onChange={(v) => setOps({ wear: { ...wear, schedule: [{ rpm: wear.schedule?.[0]?.rpm ?? 120, hours: v }] } })}
          testId="td-wear-hours" />
        <Param label="Wear RPM" value={wear.schedule?.[0]?.rpm ?? 120}
          onChange={(v) => setOps({ wear: { ...wear, schedule: [{ rpm: v, hours: wear.schedule?.[0]?.hours ?? 0 }] } })} />
        <Param label="Wear factor (mm3/kN-m)" value={wear.wearFactorMm3PerKNm ?? 1}
          onChange={(v) => setOps({ wear: { ...wear, wearFactorMm3PerKNm: v } })} testId="td-wear-wf" />
      </div>
    </Section>
  );
}

export default function StringGeometryTab({
  caseDraft, onCaseChange, holeSections, onSectionsChange, depthUnit, tdM,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <StringBuilder caseDraft={caseDraft} onChange={onCaseChange} depthUnit={depthUnit} tdM={tdM} />
      <GeometryEditor holeSections={holeSections} onChangeSections={onSectionsChange} depthUnit={depthUnit} />
      <OpsEditor caseDraft={caseDraft} onChange={onCaseChange} depthUnit={depthUnit} />
    </div>
  );
}
