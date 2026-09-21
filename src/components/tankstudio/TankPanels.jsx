// Storage tank studio panels: shell courses, venting in both
// directions, the fire case, and evaporative losses.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTank } from '@/contexts/TankStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

export const TankInputs = () => {
  const { inputs, setSection, vapourSpaceHeightFt } = useTank();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Diameter (ft)"><NumberInput section="tank" name="diameterFt" /></Field>
        <Field label="Shell height (ft)"><NumberInput section="tank" name="heightFt" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Design liquid level (ft)"><NumberInput section="tank" name="liquidLevelFt" /></Field>
        <Field label="Course height (ft)"><NumberInput section="tank" name="courseHeightFt" /></Field>
      </div>
      <Field label="Product SG" hint="A light product makes the water test govern the shell, not the product.">
        <NumberInput section="tank" name="sg" step="0.01" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Design stress (psi)"><NumberInput section="tank" name="designStressPsi" /></Field>
        <Field label="Test stress (psi)"><NumberInput section="tank" name="testStressPsi" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Corrosion allowance (in)"><NumberInput section="tank" name="corrosionAllowanceIn" step="0.005" /></Field>
        <Field label="Minimum plate (in)" hint="API 650 bands this by diameter. That band table is not carried here, so the value in force is the one you state.">
          <NumberInput section="tank" name="minimumThicknessIn" step="0.0625" />
        </Field>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Venting</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fill rate (bbl/hr)"><NumberInput section="venting" name="fillBblPerHr" /></Field>
        <Field label="Draw rate (bbl/hr)"><NumberInput section="venting" name="drawBblPerHr" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="High volatility">
          <Select value={inputs.venting.highVolatility} onValueChange={(v) => setSection('venting', 'highVolatility', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Insulated">
          <Select value={inputs.venting.insulated} onValueChange={(v) => setSection('venting', 'insulated', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitude factor" hint="Multiplier on the thermal rate. This engine's stated choice, not a value read from a standard.">
          <NumberInput section="venting" name="latitudeFactor" step="0.05" />
        </Field>
        <Field label="Env factor F" hint="A credit for drainage, insulation or a water spray. Between 0 and 1.">
          <NumberInput section="venting" name="environmentFactor" step="0.05" />
        </Field>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Losses</p>
      <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
        <p className="text-[11px] uppercase tracking-wider text-slate-500">Vapour space</p>
        <p className="text-sm font-semibold text-slate-100 tabular-nums">
          {fmt(vapourSpaceHeightFt, 1)} <span className="text-xs font-normal text-slate-500">ft</span>
        </p>
        <p className="text-[11px] text-slate-600 mt-0.5">
          The shell height less the design liquid level, so the geometry above and the losses
          below cannot contradict each other.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="True vapour pressure (psia)" hint="At or above atmospheric the product boils at ambient and these relations do not apply.">
          <NumberInput section="losses" name="vapourPressurePsia" step="0.1" />
        </Field>
        <Field label="Throughput (bbl/yr)"><NumberInput section="losses" name="throughputBbl" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Vapour MW (losses)" hint="The molecular weight of the vapour in the space above the liquid.">
          <NumberInput section="losses" name="molecularWeight" />
        </Field>
        <Field label="Daily temp swing (F)"><NumberInput section="losses" name="tempSwingF" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Average vapour temp (R)" hint="Absolute, so 530 R is about 70 F.">
          <NumberInput section="losses" name="avgTempR" />
        </Field>
        <Field label="Vent setting (psi)" hint="What the vent holds before it lifts.">
          <NumberInput section="losses" name="ventSettingPsi" step="0.01" />
        </Field>
      </div>
      <Field label="Control efficiency (%)" hint="Floating roof 60 to 90; VRU 90 to 98. Leaving it blank is not the same as typing zero.">
        <NumberInput section="losses" name="controlEfficiencyPct" />
      </Field>
    </div>
  );
};

export const ShellResults = () => {
  const { capacity, shell } = useTank();
  if (capacity.error) return <ErrorNote>{capacity.error}</ErrorNote>;
  if (shell.error) return <ErrorNote>{shell.error}</ErrorNote>;
  const anyTestGoverned = shell.testGovernedCount > 0;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Capacity</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Nominal" value={fmt(capacity.nominalBbl, 0)} unit="bbl" />
            <Stat label="Working" value={fmt(capacity.workingBbl, 0)} unit="bbl"
              hint="to the design liquid level" />
            <Stat label="Per foot" value={fmt(capacity.bblPerFt, 1)} unit="bbl/ft" />
            <Stat label="Courses" value={String(shell.count)}
              hint={`thickest is course ${shell.governingCourse}`} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Shell courses (API 650, one-foot method)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3">From (ft)</th>
                  <th className="py-2 pr-3">Head (ft)</th>
                  <th className="py-2 pr-3">Product (in)</th>
                  <th className="py-2 pr-3">Water test (in)</th>
                  <th className="py-2 pr-3">Required (in)</th>
                  <th className="py-2">Governed by</th>
                </tr>
              </thead>
              <tbody>
                {shell.courses.map((c) => (
                  <tr key={c.course} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-300">{c.course}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(c.bottomFt, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(c.headFt, 1)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(c.tDesignIn, 4)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(c.tTestIn, 4)}</td>
                    <td className="py-1.5 pr-3 tabular-nums font-semibold">{fmt(c.requiredIn, 4)}</td>
                    <td className={`py-1.5 ${c.governing === 'hydrostatic test' ? 'text-amber-400' : 'text-slate-400'}`}>
                      {c.governing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Governing course" value={String(shell.governingCourse)}
              hint={shell.governingReason} />
            <Stat label="Thickest" value={fmt(shell.thickestRequiredIn, 4)} unit="in" />
            <Stat label="Water test governs" value={`${shell.testGovernedCount} of ${shell.count}`}
              accent={shell.testGovernedCount > 0 ? 'text-amber-400' : 'text-slate-100'} />
            <Stat label="Minimum plate in force" value={fmt(shell.minimumThicknessIn, 4)} unit="in"
              hint={`governs ${shell.minimumGovernedCount} of ${shell.count}`} />
          </div>
          <p className="text-[12px] text-slate-500">
            {shell.courses[0].minimumThicknessBasis}
          </p>
          <p className="text-[12px] text-slate-500">{shell.courses[0].methodNote}</p>
          {anyTestGoverned && (
            <WarnNote>
              The hydrostatic test governs at least one course. A light product does not stress the
              shell as hard as the water it will be tested with, so designing for the product alone
              would under-thickness it. This is the case people forget.
            </WarnNote>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const VentingResults = () => {
  const { venting, fire } = useTank();
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Normal venting (API 2000)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {venting.error ? <ErrorNote>{venting.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Outbreathing (pressure)" value={fmt(venting.outbreathingScfh, 0)} unit="scfh"
                  hint={`${fmt(venting.movement.outbreathingScfh, 0)} from filling`} />
                <Stat label="Inbreathing (vacuum)" value={fmt(venting.inbreathingScfh, 0)} unit="scfh"
                  hint={`${fmt(venting.movement.inbreathingScfh, 0)} from drawing`} />
                <Stat label="Governing case" value={venting.governing}
                  accent={venting.governing.startsWith('vacuum') ? 'text-amber-400' : 'text-slate-100'} />
                <Stat label="Thermal inbreathing" value={fmt(venting.thermal.inbreathingScfh, 0)} unit="scfh" />
              </div>
              {venting.warning && <WarnNote>{venting.warning}</WarnNote>}
              {venting.thermalWarning && <WarnNote>{venting.thermalWarning}</WarnNote>}
              {venting.thermal.note && <p className="text-[12px] text-slate-500">{venting.thermal.note}</p>}
              <p className="text-[12px] text-slate-500">{venting.thermal.basis}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Emergency (fire) venting</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fire.error ? <ErrorNote>{fire.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Wetted area" value={fmt(fire.areaFt2, 0)} unit="ft2"
                  hint={`counted to ${fmt(fire.effectiveHeightFt, 0)} ft`} />
                <Stat label="Heat input" value={fmt(fire.qBtuHr / 1e6, 2)} unit="MMBtu/hr"
                  hint={`band: ${fire.band}`} />
                <Stat label="Required vent" value="withheld" accent="text-amber-400"
                  hint="see below" />
              </div>
              {fire.ventWithheld && <WarnNote>{fire.ventWithheldReason}</WarnNote>}
              {fire.warning && <WarnNote>{fire.warning}</WarnNote>}
              {fire.note && <p className="text-[12px] text-slate-500">{fire.note}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const LossResults = () => {
  const { losses } = useTank();
  if (losses.error) return <ErrorNote>{losses.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Evaporative losses</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Standing loss" value={fmt(losses.standingLossLbYr, 0)} unit="lb/yr"
            hint="breathing, whether or not the tank is used" />
          <Stat label="Working loss" value={fmt(losses.workingLossLbYr, 0)} unit="lb/yr"
            hint="from filling and emptying" />
          <Stat label="Total" value={fmt(losses.totalLossShortTonsYr, 1)} unit="short tons/yr"
            accent="text-amber-400" />
          <Stat label="With control"
            value={losses.control.error ? '--' : fmt(losses.control.remainingLbYr / 2000, 1)}
            unit="short tons/yr"
            accent="text-emerald-400"
            hint={losses.control.error ? 'no control efficiency stated' : `${fmt(losses.control.savedLbYr / 2000, 1)} short tons/yr saved`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Vapour space" value={fmt(losses.vapourSpaceFt3, 0)} unit="ft3" />
          <Stat label="Expansion factor" value={fmt(losses.expansionFactorKe, 4)} />
          <Stat label="Saturation factor" value={fmt(losses.saturationFactorKs, 4)} />
          <Stat label="Vapour density" value={fmt(losses.vapourDensityLbFt3, 5)} unit="lb/ft3" />
        </div>
        {losses.control.error && <ErrorNote>{losses.control.error}</ErrorNote>}
        <p className="text-[12px] text-slate-500">{losses.note}</p>
        <p className="text-[12px] text-slate-500">{losses.turnoverFactorNote}</p>
        {losses.control.note && <p className="text-[12px] text-slate-500">{losses.control.note}</p>}
      </CardContent>
    </Card>
  );
};
