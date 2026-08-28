// Design-method solver launcher (WD2). Five methods on the validated
// engines/drilling profileDesign solvers. Whole-well profiles (slant,
// S, nudge) REPLACE the segment list from a vertical tie-on; curve to
// target and horizontal landing APPEND from the current design end.
//
// Unit rule (WD2 fix): targets are stored in metres and grid metres,
// while the KOP, hold lengths and rates the designer types are in the
// wellbore's own depth unit at its own rate interval (deg/30m or
// deg/100ft). This dialog is the single place that crosses that
// boundary, so the conversion is derived from `mdUnit` here and nowhere
// else. It used to come in as a `metersToUser` prop, which let a caller
// pass a depth unit and a conversion that disagreed: metre target
// depths solved against feet kickoffs and deg/100ft build rates, which
// is geometry no arc reaches.
//
// Nothing in this dialog throws. Every problem the designer can create
// is a validation message rendered inline, next to the field that
// caused it. A solver that returns infeasible is shown the same way.
// Escaping to the global error boundary from a Solve click is a bug.

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { M_TO_FT } from '../engine/surveyMath';
import {
  solveSlant, solveSProfile, solveContinuousBuild,
  solveHorizontalLanding, solveNudge, solveNudgeInverse, landingFromTargets,
} from '../engine/profileDesign';

const METHODS = [
  { id: 'slant', label: 'Build and hold (J)', mode: 'replace' },
  { id: 's', label: 'S-profile (build, hold, drop)', mode: 'replace' },
  { id: 'continuous', label: 'Curve to target (single arc)', mode: 'append' },
  { id: 'horizontal', label: 'Horizontal landing (curve-hold-curve)', mode: 'append' },
  { id: 'nudge', label: 'Nudge (slot separation)', mode: 'replace' },
];

// The compiler emits a station every 10 units of hole. Past this many
// stations the design is not a well, and the plan-view and KPI code
// spreads the station array into Math.max(...), which overflows the
// call stack. The solvers guard their own geometry; this is the belt
// on top of the braces, and it names a number the designer recognises.
const MAX_SOLVED_MD = 200000;

const toUiSegments = (engineSegments) => engineSegments.map((s, i) => {
  const id = `sol-${Date.now()}-${i}`;
  if (s.kind === 'hold') return { id, type: 'Hold', length: +s.length.toFixed(2), buildRate: 0, turnRate: 0 };
  if (s.kind === 'build') return { id, type: 'Build', length: +s.length.toFixed(2), buildRate: +s.rate.toFixed(4), turnRate: 0 };
  return {
    id, type: 'ToolfaceArc', length: +s.length.toFixed(2),
    dls: +s.dls.toFixed(4), toolface: +s.toolfaceDeg.toFixed(2), buildRate: 0, turnRate: 0,
  };
});

const NumField = ({ label, value, onChange, step = 'any', testid, invalid, hint }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input
      type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)}
      className={`h-9 bg-slate-800 ${invalid ? 'border-red-500' : 'border-slate-700'}`}
      data-testid={testid}
      aria-invalid={invalid ? 'true' : undefined}
    />
    {hint ? <p className="text-[10px] text-slate-500 mt-1">{hint}</p> : null}
  </div>
);

/** Finite number from a field, or null. Blank, '-', 'e' and NaN all
 *  become null so they are reported as missing rather than solved with. */
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : '--');

const SolverDialog = ({
  open, onOpenChange, targets = [], wellbore, mdUnit, kbM = 0,
  currentEnd, onApply,
}) => {
  const { toast } = useToast();
  const [method, setMethod] = useState('slant');
  const [targetId, setTargetId] = useState('');
  const [toeTargetId, setToeTargetId] = useState('');
  const [problem, setProblem] = useState(null);
  const [p, setP] = useState({
    kop: mdUnit === 'ft' ? 1000 : 300,
    buildRate: 3, dropRate: 2, finalInc: 0,
    landAzi: '', rate1: 3, rate2: 3,
    nudgeInc: 10, nudgeAzi: 0, nudgeHold: 100,
    nudgeMode: 'forward', nudgeOffset: 50, nudgeVertical: 500,
  });
  const set = (k) => (v) => setP((f) => ({ ...f, [k]: v }));

  // A stale message from the previous attempt is worse than none.
  useEffect(() => { setProblem(null); }, [method, targetId, toeTargetId, p, open]);

  const intervalLabel = mdUnit === 'ft' ? '100ft' : '30m';
  const methodDef = METHODS.find((m) => m.id === method) || METHODS[0];
  const needsTarget = method !== 'nudge';
  const isHorizontal = method === 'horizontal';
  const target = targets.find((t) => t.id === targetId) || null;
  const toeTarget = targets.find((t) => t.id === toeTargetId) || null;

  // The one metres-to-depth-unit conversion in this dialog. Derived
  // from mdUnit so the target displacement and the typed kickoff, hold
  // and rates are always in the same unit and interval.
  const fromMetres = useMemo(
    () => (v) => (mdUnit === 'ft' ? v * M_TO_FT : v),
    [mdUnit],
  );

  // Target displacement in the wellbore's depth unit, relative either
  // to the wellhead (replace modes) or to the current design end
  // (append modes). Returns null rather than throwing: this runs during
  // render, so a throw here would reach the error boundary.
  const deltaFor = useMemo(() => (t) => {
    if (!t || !wellbore) return null;
    const cx = num(t.center_x);
    const cy = num(t.center_y);
    const tvdss = num(t.tvdss_m);
    const hx = num(wellbore.head_x) ?? 0;
    const hy = num(wellbore.head_y) ?? 0;
    if (cx == null || cy == null || tvdss == null) return null;
    const base = {
      dE: fromMetres(cx - hx),
      dN: fromMetres(cy - hy),
      dTvd: fromMetres(tvdss + (num(kbM) ?? 0)), // below KB
    };
    if (methodDef.mode === 'append' && currentEnd) {
      return {
        dE: base.dE - (num(currentEnd.e) ?? 0),
        dN: base.dN - (num(currentEnd.n) ?? 0),
        dTvd: base.dTvd - (num(currentEnd.tvd) ?? 0),
      };
    }
    return base;
  }, [wellbore, kbM, fromMetres, methodDef.mode, currentEnd]);

  const delta = useMemo(() => deltaFor(target), [deltaFor, target]);
  const toeDelta = useMemo(() => deltaFor(toeTarget), [deltaFor, toeTarget]);

  // Heel-to-toe alignment, the way Compass derives a landing from
  // "Final Target" plus "Align on Target". Shown live so the designer
  // sees the azimuth before solving.
  const alignment = useMemo(() => {
    if (!isHorizontal || !delta || !toeDelta) return null;
    return landingFromTargets(delta, toeDelta);
  }, [isHorizontal, delta, toeDelta]);

  // Same resolution order the engine uses: manual override, then the
  // heel-to-toe bearing, then the bearing from the current design end
  // to the heel. Computed here too so the dialog can show the azimuth
  // it is about to solve with.
  const manualAzi = num(p.landAzi);
  const effectiveLandAzi = useMemo(() => {
    if (manualAzi != null) return ((manualAzi % 360) + 360) % 360;
    if (alignment?.ok) return alignment.aziDeg;
    if (delta && Math.hypot(delta.dE, delta.dN) > 1e-6) {
      return ((Math.atan2(delta.dE, delta.dN) * 180) / Math.PI + 360) % 360;
    }
    return null;
  }, [manualAzi, alignment, delta]);

  // Everything the designer can get wrong, checked before the solver
  // runs so the message names the field rather than the geometry.
  const fieldProblem = useMemo(() => {
    if (needsTarget && !target) return 'Select a target first.';
    if (needsTarget && !delta) {
      return 'That target has no usable position. Give it an easting, a northing and a TVDSS on the Targets tab.';
    }
    if (methodDef.mode === 'append' && !currentEnd) {
      return method === 'continuous'
        ? 'Design something first: the arc starts from the current design end.'
        : 'Design something first (for example a vertical hold to the kickoff): the landing starts from the current design end.';
    }
    if (method === 'slant') {
      if (num(p.kop) == null || num(p.kop) < 0) return `Enter a kickoff depth in ${mdUnit} (zero or more).`;
      if (!(num(p.buildRate) > 0)) return `Enter a build rate above zero in deg/${intervalLabel}.`;
    }
    if (method === 's') {
      if (num(p.kop) == null || num(p.kop) < 0) return `Enter a kickoff depth in ${mdUnit} (zero or more).`;
      if (!(num(p.buildRate) > 0)) return `Enter a build rate above zero in deg/${intervalLabel}.`;
      if (!(num(p.dropRate) > 0)) return `Enter a drop rate above zero in deg/${intervalLabel}.`;
      if (num(p.finalInc) == null || num(p.finalInc) < 0 || num(p.finalInc) >= 90) {
        return 'Final inclination must be between 0 and 90 degrees.';
      }
    }
    if (isHorizontal) {
      if (!(num(p.rate1) > 0)) return `Enter a curve 1 rate above zero in deg/${intervalLabel}.`;
      if (!(num(p.rate2) > 0)) return `Enter a curve 2 rate above zero in deg/${intervalLabel}.`;
      if (toeTargetId && toeTargetId === targetId) {
        return 'The heel and toe must be different targets. Pick another alignment target or clear it.';
      }
      if (toeTarget && !toeDelta) {
        return 'That alignment target has no usable position. Give it an easting, a northing and a TVDSS on the Targets tab.';
      }
      if (alignment && !alignment.ok) return alignment.error;
      if (manualAzi == null && p.landAzi !== '') return 'Landing azimuth must be a number, or blank to derive it.';
      if (effectiveLandAzi == null) {
        return 'The heel target is directly below the current design end, so it does not set a landing azimuth on its own. Pick an alignment (toe) target, or type an azimuth.';
      }
    }
    if (method === 'nudge') {
      if (!(num(p.buildRate) > 0)) return `Enter a build rate above zero in deg/${intervalLabel}.`;
      if (!(num(p.dropRate) > 0)) return `Enter a drop rate above zero in deg/${intervalLabel}.`;
      if (num(p.nudgeAzi) == null) return 'Enter a nudge azimuth in degrees.';
      if (p.nudgeMode === 'forward') {
        if (!(num(p.nudgeInc) > 0) || num(p.nudgeInc) >= 90) return 'Nudge inclination must be above 0 and below 90 degrees.';
        if (num(p.nudgeHold) == null || num(p.nudgeHold) < 0) return `Enter a nudge hold length in ${mdUnit} (zero or more).`;
      } else {
        if (!(num(p.nudgeOffset) > 0)) return `Enter a lateral offset above zero in ${mdUnit}.`;
        if (!(num(p.nudgeVertical) > 0)) return `Enter a vertical budget above zero in ${mdUnit}.`;
      }
    }
    return null;
  }, [
    needsTarget, target, delta, methodDef.mode, currentEnd, method, isHorizontal,
    p, mdUnit, intervalLabel, toeTargetId, targetId, toeTarget, toeDelta,
    alignment, manualAzi, effectiveLandAzi,
  ]);

  const runSolver = () => {
    let kickoffAzi = null;
    const mode = methodDef.mode;

    if (method === 'slant') {
      const kop = num(p.kop) ?? 0;
      let sol = solveSlant({
        target: { ...delta, dTvd: delta.dTvd - kop },
        buildRate: num(p.buildRate), mdUnit,
      });
      if (sol.feasible) {
        sol = { ...sol, segments: [{ kind: 'hold', length: kop }, ...sol.segments] };
        kickoffAzi = sol.report.aziDeg;
      }
      return { sol, kickoffAzi, mode };
    }
    if (method === 's') {
      const sol = solveSProfile({
        kopLen: num(p.kop) ?? 0,
        buildRate: num(p.buildRate),
        dropRate: num(p.dropRate),
        finalIncDeg: num(p.finalInc) ?? 0,
        target: delta, mdUnit,
      });
      return { sol, kickoffAzi: sol.feasible ? sol.report.aziDeg : null, mode };
    }
    if (method === 'continuous') {
      return {
        sol: solveContinuousBuild({
          tieOn: { inc: currentEnd.inc, azi: currentEnd.azi },
          delta, mdUnit,
        }),
        kickoffAzi: null,
        mode,
      };
    }
    if (isHorizontal) {
      return {
        sol: solveHorizontalLanding({
          tieOn: { inc: currentEnd.inc, azi: currentEnd.azi },
          landing: {
            ...delta,
            incDeg: 90,
            // Manual entry wins; otherwise the engine derives the
            // azimuth from the heel-to-toe vector.
            aziDeg: manualAzi != null ? manualAzi : undefined,
            alignOn: toeDelta || undefined,
          },
          rate1: num(p.rate1), rate2: num(p.rate2), mdUnit,
        }),
        kickoffAzi: null,
        mode,
      };
    }
    const sol = p.nudgeMode === 'forward'
      ? solveNudge({
        nudgeIncDeg: num(p.nudgeInc), nudgeAziDeg: num(p.nudgeAzi) ?? 0,
        holdLen: num(p.nudgeHold) ?? 0,
        buildRate: num(p.buildRate), dropRate: num(p.dropRate), mdUnit,
      })
      : solveNudgeInverse({
        offset: num(p.nudgeOffset), verticalLen: num(p.nudgeVertical),
        buildRate: num(p.buildRate), dropRate: num(p.dropRate), mdUnit,
      });
    return { sol, kickoffAzi: sol.feasible ? (num(p.nudgeAzi) ?? 0) : null, mode };
  };

  const handleSolve = () => {
    if (fieldProblem) { setProblem(fieldProblem); return; }
    let outcome;
    try {
      outcome = runSolver();
    } catch (e) {
      // The solvers are total, so this is a defect rather than bad
      // input. Report it here instead of unmounting the app.
      setProblem(`The solver failed unexpectedly: ${e.message}. Please report this with the method and the values above.`);
      return;
    }
    const { sol, kickoffAzi, mode } = outcome;
    if (!sol || !sol.feasible) {
      setProblem(sol?.error || 'No solution for this geometry.');
      return;
    }
    const totalMd = sol.segments.reduce((a, s) => a + (s.length || 0), 0);
    if (!Number.isFinite(totalMd) || totalMd <= 0) {
      setProblem('The solved profile has no usable length. Adjust the rates, the kickoff or the target.');
      return;
    }
    if (totalMd > MAX_SOLVED_MD) {
      setProblem(`The solved profile is ${totalMd.toFixed(0)} ${mdUnit} of hole, past the ${MAX_SOLVED_MD.toLocaleString()} ${mdUnit} the designer will draw. The geometry is degenerate: raise the rates or move the target.`);
      return;
    }

    setProblem(null);
    onApply({
      segments: toUiSegments(sol.segments), kickoffAzi, mode,
      report: sol.report, method: methodDef.label,
    });
    const r = sol.report;
    toast({
      title: 'Solve complete',
      description: r.holdIncDeg != null
        ? `Hold inclination ${r.holdIncDeg.toFixed(1)} deg at azimuth ${(r.aziDeg ?? 0).toFixed(1)} deg.`
        : r.holdInc != null
          ? `Hold ${r.holdInc.toFixed(1)} deg / ${r.holdAzi.toFixed(1)} deg, landing at ${r.landInc.toFixed(0)} deg on azimuth ${r.landAzi.toFixed(1)} deg.`
          : 'Segments added to the design.',
      className: 'bg-green-600 text-white',
    });
    onOpenChange(false);
  };

  const targetItems = targets.map((t) => (
    <SelectItem key={t.id} value={t.id}>{t.name} ({t.tvdss_m?.toFixed(0)} m TVDSS)</SelectItem>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Design method</DialogTitle>
          <DialogDescription className="text-slate-400">
            Whole-well profiles replace the segment list; curve-to-target and horizontal landing extend the design from its current end.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {needsTarget && (
            <div>
              <Label className="text-xs">{isHorizontal ? 'Landing (heel) target' : 'Target'}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700" data-testid="solver-target-trigger"><SelectValue placeholder="Select target..." /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">{targetItems}</SelectContent>
              </Select>
            </div>
          )}

          {method === 'slant' && (
            <div className="grid grid-cols-2 gap-3">
              <NumField label={`KOP (${mdUnit})`} value={p.kop} onChange={set('kop')} testid="solver-kop" invalid={num(p.kop) == null || num(p.kop) < 0} />
              <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} testid="solver-buildrate" invalid={!(num(p.buildRate) > 0)} />
            </div>
          )}
          {method === 's' && (
            <div className="grid grid-cols-2 gap-3">
              <NumField label={`KOP (${mdUnit})`} value={p.kop} onChange={set('kop')} invalid={num(p.kop) == null || num(p.kop) < 0} />
              <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} invalid={!(num(p.buildRate) > 0)} />
              <NumField label={`Drop rate (deg/${intervalLabel})`} value={p.dropRate} onChange={set('dropRate')} invalid={!(num(p.dropRate) > 0)} />
              <NumField label="Final inclination (deg)" value={p.finalInc} onChange={set('finalInc')} invalid={num(p.finalInc) == null} />
            </div>
          )}
          {method === 'continuous' && (
            <p className="text-xs text-slate-400">
              One exact arc from the current design end to the target. The required dogleg and toolface are computed; the design fails loudly if the target lies behind the hole direction.
            </p>
          )}
          {isHorizontal && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Alignment (toe) target</Label>
                <Select value={toeTargetId} onValueChange={setToeTargetId}>
                  <SelectTrigger className="h-9 bg-slate-800 border-slate-700" data-testid="solver-toe-trigger">
                    <SelectValue placeholder="Optional: align the lateral on a second target..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">{targetItems}</SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">
                  The heel is where the well lands. The toe sets the direction the lateral runs, the way Compass uses Final Target plus Align on Target.
                </p>
              </div>

              <div className="rounded border border-slate-700 bg-slate-800/50 px-3 py-2 text-[11px] space-y-1" data-testid="solver-alignment">
                {alignment?.ok ? (
                  <>
                    <div className="text-slate-300">
                      Heel to toe: <span className="font-mono text-lime-400">{fmt(alignment.aziDeg)} deg</span> over {fmt(alignment.horizontal, 0)} {mdUnit}
                    </div>
                    <div className="text-slate-500">
                      Toe is {fmt(Math.abs(alignment.tvdRise), 0)} {mdUnit} {alignment.tvdRise >= 0 ? 'deeper than' : 'shallower than'} the heel (heel-to-toe inclination {fmt(alignment.incDeg)} deg). The landing itself is solved at 90 deg.
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500">
                    Pick an alignment target to set the landing azimuth from the heel-to-toe direction, or type one below.
                  </div>
                )}
                <div className="text-slate-300 pt-1 border-t border-slate-700/70">
                  Landing azimuth in use: <span className="font-mono text-lime-400" data-testid="solver-effective-azi">{fmt(effectiveLandAzi)} deg</span>
                  <span className="text-slate-500">
                    {manualAzi != null
                      ? ' (manual override)'
                      : alignment?.ok ? ' (from heel to toe)' : ' (aimed at the heel from the design end)'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumField label={`Curve 1 rate (deg/${intervalLabel})`} value={p.rate1} onChange={set('rate1')} invalid={!(num(p.rate1) > 0)} />
                <NumField label={`Curve 2 rate (deg/${intervalLabel})`} value={p.rate2} onChange={set('rate2')} invalid={!(num(p.rate2) > 0)} />
                <div className="col-span-2">
                  <NumField
                    label="Landing azimuth override (deg)"
                    value={p.landAzi}
                    onChange={set('landAzi')}
                    testid="solver-landazi"
                    invalid={p.landAzi !== '' && manualAzi == null}
                    hint={alignment?.ok
                      ? 'Blank uses the heel-to-toe azimuth above.'
                      : 'Blank aims at the heel target from the current design end.'}
                  />
                </div>
              </div>
            </div>
          )}
          {method === 'nudge' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Mode</Label>
                <Select value={p.nudgeMode} onValueChange={set('nudgeMode')}>
                  <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="forward">Specify inclination and hold</SelectItem>
                    <SelectItem value="inverse">Solve from offset and vertical budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {p.nudgeMode === 'forward' ? (
                  <>
                    <NumField label="Nudge inclination (deg)" value={p.nudgeInc} onChange={set('nudgeInc')} invalid={!(num(p.nudgeInc) > 0) || num(p.nudgeInc) >= 90} />
                    <NumField label={`Nudge hold (${mdUnit})`} value={p.nudgeHold} onChange={set('nudgeHold')} invalid={num(p.nudgeHold) == null || num(p.nudgeHold) < 0} />
                  </>
                ) : (
                  <>
                    <NumField label={`Lateral offset (${mdUnit})`} value={p.nudgeOffset} onChange={set('nudgeOffset')} invalid={!(num(p.nudgeOffset) > 0)} />
                    <NumField label={`Vertical budget (${mdUnit})`} value={p.nudgeVertical} onChange={set('nudgeVertical')} invalid={!(num(p.nudgeVertical) > 0)} />
                  </>
                )}
                <NumField label="Nudge azimuth (deg)" value={p.nudgeAzi} onChange={set('nudgeAzi')} invalid={num(p.nudgeAzi) == null} />
                <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} invalid={!(num(p.buildRate) > 0)} />
                <NumField label={`Drop rate (deg/${intervalLabel})`} value={p.dropRate} onChange={set('dropRate')} invalid={!(num(p.dropRate) > 0)} />
              </div>
            </div>
          )}

          {problem && (
            <div
              role="alert"
              data-testid="solver-problem"
              className="flex gap-2 rounded border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              <span>{problem}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handleSolve} className="bg-lime-600 hover:bg-lime-700 text-white" data-testid="solver-apply">Solve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SolverDialog;
