// Sizing tab: streams and U on the left, the chain and the bundle in
// the main panel.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useHeatExchanger } from '@/contexts/HeatExchangerContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

export const StreamInputs = () => {
  const { inputs, setSection } = useHeatExchanger();
  const s = inputs.streams;
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hot stream</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Flow (lb/hr)"><NumberInput section="streams" name="hotMLbHr" /></Field>
        <Field label="Cp (Btu/lb F)"><NumberInput section="streams" name="hotCpBtuLbF" step="0.01" /></Field>
      </div>
      <Field label="Inlet temperature (F)"><NumberInput section="streams" name="hotInF" /></Field>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Cold stream</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Flow (lb/hr)"><NumberInput section="streams" name="coldMLbHr" /></Field>
        <Field label="Cp (Btu/lb F)"><NumberInput section="streams" name="coldCpBtuLbF" step="0.01" /></Field>
      </div>
      <Field label="Inlet temperature (F)"><NumberInput section="streams" name="coldInF" /></Field>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Duty</p>
      <Field label="Set the duty by">
        <Select value={s.dutyMode} onValueChange={(v) => setSection('streams', 'dutyMode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hotOut">Hot outlet temperature</SelectItem>
            <SelectItem value="coldOut">Cold outlet temperature</SelectItem>
            <SelectItem value="duty">Duty directly</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {s.dutyMode === 'hotOut' && <Field label="Hot outlet (F)"><NumberInput section="streams" name="hotOutF" /></Field>}
      {s.dutyMode === 'coldOut' && <Field label="Cold outlet (F)"><NumberInput section="streams" name="coldOutF" /></Field>}
      {s.dutyMode === 'duty' && <Field label="Duty (MMBtu/hr)"><NumberInput section="streams" name="qMMBtuHr" step="0.01" /></Field>}

      <Field label="Arrangement" hint="Shell and tube carries the F correction; pure counter or parallel flow does not.">
        <Select value={s.arrangement} onValueChange={(v) => setSection('streams', 'arrangement', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="counter">Pure counter-current (F = 1)</SelectItem>
            <SelectItem value="shell">Shell and tube (1 shell, 2 tube passes)</SelectItem>
            <SelectItem value="parallel">Parallel flow</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {s.arrangement === 'shell' && (
        <Field label="Shell passes in series"><NumberInput section="streams" name="shellPasses" step="1" /></Field>
      )}
    </div>
  );
};

export const CoefficientInputs = () => {
  const { inputs, setSection } = useHeatExchanger();
  const f = inputs.film;
  return (
    <div className="space-y-4">
      <Field label="Overall coefficient">
        <Select value={f.uMode} onValueChange={(v) => setSection('film', 'uMode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="assembled">Assemble it from the resistances</SelectItem>
            <SelectItem value="typed">Type a U</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {f.uMode === 'typed' ? (
        <Field label="U (Btu/hr ft2 F)"><NumberInput section="film" name="uTypedBtuHrFt2F" /></Field>
      ) : (
        <>
          <Field label="Shell-side film ho (Btu/hr ft2 F)" hint="Kern-method screening estimate or vendor data; rigorous shell-side rating is HTRI's job.">
            <NumberInput section="film" name="hoBtuHrFt2F" />
          </Field>
          <Field label="Tube-side film">
            <Select value={f.hiMode} onValueChange={(v) => setSection('film', 'hiMode', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="computed">Compute it (Dittus-Boelter)</SelectItem>
                <SelectItem value="typed">Type hi</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {f.hiMode === 'typed' ? (
            <Field label="hi (Btu/hr ft2 F)"><NumberInput section="film" name="hiTypedBtuHrFt2F" /></Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tube fluid viscosity (cp)"><NumberInput section="film" name="tubeMuCp" step="0.01" /></Field>
              <Field label="Conductivity (Btu/hr ft F)"><NumberInput section="film" name="tubeKBtuHrFtF" step="0.001" /></Field>
            </div>
          )}
          {f.hiMode === 'computed' && (
            <Field label="Wall viscosity (cp)" hint="Optional: enables the Sieder-Tate correction.">
              <NumberInput section="film" name="tubeMuWallCp" step="0.01" />
            </Field>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tube OD (in)"><NumberInput section="film" name="doIn" step="0.001" /></Field>
            <Field label="Tube ID (in)"><NumberInput section="film" name="diIn" step="0.001" /></Field>
            <Field label="k wall"><NumberInput section="film" name="kWallBtuHrFtF" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fouling outside"><NumberInput section="film" name="foulingOut" step="0.0001" /></Field>
            <Field label="Fouling inside"><NumberInput section="film" name="foulingIn" step="0.0001" /></Field>
          </div>
        </>
      )}
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Bundle</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tube length (ft)"><NumberInput section="geometry" name="tubeLengthFt" step="0.5" /></Field>
        <Field label="Tube passes"><NumberInput section="geometry" name="tubePasses" step="1" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Layout (deg)"><NumberInput section="geometry" name="layoutDeg" step="15" /></Field>
        <Field label="Bundle clearance (in)"><NumberInput section="geometry" name="bundleClearanceIn" step="0.1" /></Field>
      </div>
    </div>
  );
};

export const SizingResults = () => {
  const { thermal, coefficient, sizing } = useHeatExchanger();
  if (thermal.error) return <ErrorNote>{thermal.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Driving force</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Duty" value={fmt(thermal.qBtuHr / 1e6, 2)} unit="MMBtu/hr" />
            <Stat label="Hot outlet" value={fmt(thermal.thOut, 1)} unit="F" />
            <Stat label="Cold outlet" value={fmt(thermal.tcOut, 1)} unit="F" />
            <Stat label="LMTD" value={fmt(thermal.lmtdF, 1)} unit="F"
              hint={`ends ${fmt(thermal.dt1, 1)} and ${fmt(thermal.dt2, 1)} F`} />
          </div>
          {thermal.arrangement === 'shell' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="P" value={fmt(thermal.p, 3)} />
              <Stat label="R" value={fmt(thermal.r, 3)} />
              <Stat label="F correction"
                value={thermal.fError ? 'unreachable' : fmt(thermal.f, 3)}
                accent={thermal.fError ? 'text-red-400' : (thermal.f < 0.8 ? 'text-amber-400' : 'text-emerald-400')}
                hint="computed from the published closed form, not typed" />
              <Stat label="Corrected LMTD"
                value={thermal.fError ? '--' : fmt(thermal.lmtdF * thermal.f, 1)} unit="F" />
            </div>
          )}
          {thermal.fError && <ErrorNote>{thermal.fError}</ErrorNote>}
          {thermal.fWarning && <WarnNote>{thermal.fWarning}</WarnNote>}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Overall coefficient</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {coefficient.error ? <ErrorNote>{coefficient.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="U dirty" value={fmt(coefficient.uDirtyBtuHrFt2F, 1)} unit="Btu/hr ft2 F" />
                {!coefficient.typed && (
                  <>
                    <Stat label="U clean" value={fmt(coefficient.uCleanBtuHrFt2F, 1)} unit="Btu/hr ft2 F" />
                    <Stat label="Fouling penalty" value={fmt(coefficient.foulingPenaltyPct, 1)} unit="%" />
                    <Stat label="Controlling resistance" value={coefficient.controlling}
                      hint="where extra surface buys the least" />
                  </>
                )}
              </div>
              {coefficient.film && !coefficient.film.error && (
                <p className="text-[12px] text-slate-500">
                  Tube side: Reynolds {fmt(coefficient.film.re, 0)} ({coefficient.film.regime}),
                  Prandtl {fmt(coefficient.film.pr, 2)}, hi = {fmt(coefficient.film.hBtuHrFt2F, 0)}
                  {coefficient.film.siederTate ? ' with the Sieder-Tate correction' : ''}.
                </p>
              )}
              {coefficient.film?.warning && <WarnNote>{coefficient.film.warning}</WarnNote>}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Surface and bundle</CardTitle></CardHeader>
        <CardContent>
          {sizing.error ? <ErrorNote>{sizing.error}</ErrorNote> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Area required" value={fmt(sizing.areaFt2, 0)} unit="ft2" />
              <Stat label="Tubes" value={fmt(sizing.tubes?.nTubes, 0)}
                hint={sizing.tubes?.error || `${fmt(sizing.tubes?.actualAreaFt2, 0)} ft2 installed`} />
              <Stat label="Bundle diameter" value={fmt(sizing.tubes?.bundleDiameterIn, 1)} unit="in" />
              <Stat label="Shell diameter" value={fmt(sizing.tubes?.shellDiameterIn, 1)} unit="in" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
