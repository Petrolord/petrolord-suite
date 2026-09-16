// Control valve studio panels: service inputs, the three sizing cases
// with the choking boundary front and centre, and the control checks.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useValve } from '@/contexts/ValveStudioContext';
import { EROSIONAL_C } from '@/utils/production/engine/chokePerformance';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

const EROSIONAL_PRESETS = EROSIONAL_C;

/**
 * A null travel used to mean two different things and the alarming one
 * won: a maximum flow box the user had not filled in printed "beyond the
 * valve" in red. The engine now separates them and so does this.
 */
const travelValue = (state, pct) => {
  if (state === 'beyond the valve') return 'beyond the valve';
  if (state === 'not given') return 'not given';
  // one decimal, because the engine warnings beside these tiles print one
  return fmt(pct, 1);
};

const STATE_ACCENT = (state, alarm) => {
  if (state === 'beyond the valve') return 'text-red-400';
  if (state === 'not given') return 'text-slate-500';
  return alarm ? 'text-red-400' : 'text-slate-100';
};

const REGIME_ACCENT = {
  stable: 'text-emerald-400',
  'incipient cavitation': 'text-yellow-400',
  cavitating: 'text-orange-400',
  'choked, cavitating': 'text-red-400',
  flashing: 'text-red-400',
};

export const ServiceInputs = () => {
  const { inputs, setSection, styles, isLiquid } = useValve();
  return (
    <div className="space-y-4">
      <Field label="Service">
        <Select value={inputs.service.phase} onValueChange={(v) => setSection('service', 'phase', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="liquid">Liquid</SelectItem>
            <SelectItem value="gas">Gas or vapour</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Valve style" hint="Sets the recovery factor and terminal ratio. These are this engine's stated table values, not figures read from a standard, and certified vendor trim data always replaces them.">
        <Select value={inputs.service.styleId} onValueChange={(v) => setSection('service', 'styleId', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {styles.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label} (FL {s.fl}, xT {s.xt})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Inlet P1 (psia)"><NumberInput section="service" name="p1Psia" /></Field>
        <Field label="Outlet P2 (psia)"><NumberInput section="service" name="p2Psia" /></Field>
      </div>

      {isLiquid ? (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Liquid</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Min (gpm)"><NumberInput section="liquid" name="qMinGpm" /></Field>
            <Field label="Normal"><NumberInput section="liquid" name="qNormGpm" /></Field>
            <Field label="Max"><NumberInput section="liquid" name="qMaxGpm" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="SG"><NumberInput section="liquid" name="sg" step="0.01" /></Field>
            <Field label="Pv (psia)"><NumberInput section="liquid" name="pvPsia" step="0.1" /></Field>
            <Field label="Pc (psia)"><NumberInput section="liquid" name="pcPsia" /></Field>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Gas</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Min (scfh)"><NumberInput section="gas" name="qMinScfh" /></Field>
            <Field label="Normal"><NumberInput section="gas" name="qNormScfh" /></Field>
            <Field label="Max"><NumberInput section="gas" name="qMaxScfh" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gas gravity"><NumberInput section="gas" name="gasSg" step="0.01" /></Field>
            <Field label="Temperature (F)"><NumberInput section="gas" name="tF" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="z"><NumberInput section="gas" name="z" step="0.01" /></Field>
            <Field label="k"><NumberInput section="gas" name="k" step="0.01" /></Field>
          </div>
        </>
      )}

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Valve</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rated Cv"><NumberInput section="valve" name="cvRated" /></Field>
        <Field label="Rangeability"><NumberInput section="valve" name="rangeability" /></Field>
      </div>
      <Field label="Characteristic">
        <Select value={inputs.valve.characteristic} onValueChange={(v) => setSection('valve', 'characteristic', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equalPercentage">Equal percentage</SelectItem>
            <SelectItem value="linear">Linear</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Total system drop (psi)" hint="Valve plus everything else at design flow. This sets the authority.">
        <NumberInput section="valve" name="dpSystemTotalPsi" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Piping geometry factor Fp" hint="Corrects for reducers and fittings at the valve. It divides into every Cv, so 0.5 doubles the Cv this valve needs.">
          <NumberInput section="valve" name="fp" step="0.01" />
        </Field>
        <Field label="Outlet bore (in)" hint="The valve outlet or the downstream line, so an actual velocity can be compared with the RP 14E limit.">
          <NumberInput section="valve" name="outletIdIn" step="0.001" />
        </Field>
      </div>
      <Field label="Erosional C factor">
        <Select value={inputs.valve.erosionalCPreset} onValueChange={(v) => setSection('valve', 'erosionalCPreset', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EROSIONAL_PRESETS.map((x) => (
              <SelectItem key={x.id} value={x.id}>{x.label} (C {x.c})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
};

export const SizingResults = () => {
  const { cases, isLiquid, erosional } = useValve();
  const anyChoked = cases.some((c) => !c.error && c.choked);
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Cv at each flow</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Case</th>
                  <th className="py-2 pr-3">Flow</th>
                  <th className="py-2 pr-3">Required Cv</th>
                  {isLiquid ? (
                    <>
                      <th className="py-2 pr-3">Allowable dP (psi)</th>
                      <th className="py-2 pr-3">Sigma</th>
                      <th className="py-2">Regime</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 pr-3">x</th>
                      <th className="py-2 pr-3">x terminal</th>
                      <th className="py-2 pr-3">Y</th>
                      <th className="py-2">Choked</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.label} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-300">{c.label}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(c.flow, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{c.error ? '--' : fmt(c.cv, 2)}</td>
                    {isLiquid ? (
                      <>
                        <td className="py-1.5 pr-3 tabular-nums">{c.error ? '--' : fmt(c.dpAllowablePsi, 1)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {c.error ? '--' : (Number.isFinite(c.sigma) ? fmt(c.sigma, 2) : 'n/a')}
                        </td>
                        <td className={`py-1.5 font-semibold ${REGIME_ACCENT[c.regime] || 'text-slate-300'}`}>
                          {c.error ? 'error' : c.regime}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-3 tabular-nums">{c.error ? '--' : fmt(c.x, 3)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{c.error ? '--' : fmt(c.xChoked, 3)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{c.error ? '--' : fmt(c.y, 3)}</td>
                        <td className={`py-1.5 font-semibold ${c.choked ? 'text-red-400' : 'text-emerald-400'}`}>
                          {c.error ? 'error' : (c.choked ? 'yes' : 'no')}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cases.filter((c) => c.warning).map((c) => (
            <WarnNote key={c.label}>{c.label}: {c.warning}</WarnNote>
          ))}
          {cases.filter((c) => c.error).map((c) => (
            <ErrorNote key={c.label}>{c.label}: {c.error}</ErrorNote>
          ))}
          <p className="text-[12px] text-slate-500">
            {anyChoked
              ? 'At least one case is choked. Past that point the extra pressure drop does nothing at all, so the allowable drop has been used for sizing. Sizing on the full stated drop would have undersized the valve, which is the classic way a control valve ends up unable to pass its own design case.'
              : 'No case is choked, so each Cv uses the full stated pressure drop. Watch the margin: the boundary moves with the inlet pressure and the vapour pressure, so a summer day or a lighter crude can push a stable service across it.'}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Body velocity limit</CardTitle></CardHeader>
        <CardContent>
          {erosional.error ? <ErrorNote>{erosional.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Density at outlet" value={fmt(erosional.rhoLbFt3, 2)} unit="lb/ft3" />
                <Stat label="Actual velocity" value={fmt(erosional.velocityFtS, 1)} unit="ft/s"
                  hint={`at the maximum ${erosional.phase} case through ${fmt(erosional.outletIdIn, 3)} in`} />
                <Stat label="Erosional velocity" value={fmt(erosional.erosionalFtS, 1)} unit="ft/s"
                  hint={`API RP 14E at C = ${erosional.cFactor}`} />
                <Stat label="Of the limit" value={fmt(erosional.ratio * 100, 0)} unit="%"
                  accent={erosional.exceeded ? 'text-red-400' : 'text-emerald-400'}
                  hint={erosional.exceeded ? 'over the limit' : `${fmt(erosional.marginPct, 0)} percent margin`} />
              </div>
              {erosional.exceeded && (
                <WarnNote>
                  The outlet velocity is above the RP 14E limit at the C factor selected. A valve
                  that sizes correctly on Cv can still erode its own body and the pipe downstream,
                  and this is where the fluid moves fastest. Take a larger outlet, a larger
                  downstream line, or a C factor you can justify for a clean inhibited service.
                </WarnNote>
              )}
              <p className="text-[12px] text-slate-500 mt-3">
                The same RP 14E limit the line sizing studio uses, applied at the valve outlet
                where the fluid has expanded and is moving fastest. The velocity is the in-situ
                rate of the maximum case through the outlet bore you state, so the check has two
                numbers to compare rather than one.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const ControlResults = () => {
  const { authority, travel, noise, isLiquid } = useValve();
  const travelWarnings = travel.warnings || [];
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Authority and characteristic</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {authority.error ? <ErrorNote>{authority.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Valve authority" value={fmt(authority.authority, 3)}
                  accent={authority.verdict === 'good' ? 'text-emerald-400'
                    : (authority.verdict === 'poor' ? 'text-red-400' : 'text-yellow-400')}
                  hint={authority.verdict} />
                <Stat label="Recommended characteristic"
                  value={authority.recommendation?.characteristicLabel || '--'}
                  accent={authority.recommendationApplied ? 'text-emerald-400' : 'text-amber-400'}
                  hint={authority.recommendationApplied ? 'this is the trim selected' : 'not the trim selected'} />
              </div>
              {authority.note && <WarnNote>{authority.note}</WarnNote>}
              {authority.disagreement && <WarnNote>{authority.disagreement}</WarnNote>}
              {authority.recommendation?.reason && (
                <p className="text-[12px] text-slate-500">{authority.recommendation.reason}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Travel at each flow</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {travel.error ? <ErrorNote>{travel.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="At minimum" value={travelValue(travel.minState, travel.minTravelPct)}
                  unit={travel.minState === 'ok' ? '%' : ''}
                  accent={STATE_ACCENT(travel.minState, travel.minTravelPct !== null && travel.minTravelPct < 10)} />
                <Stat label="At normal" value={travelValue(travel.normalState, travel.normalTravelPct)}
                  unit={travel.normalState === 'ok' ? '%' : ''}
                  accent={STATE_ACCENT(travel.normalState, false)}
                  hint="20 to 80 percent is the customary target" />
                <Stat label="At maximum" value={travelValue(travel.maxState, travel.maxTravelPct)}
                  unit={travel.maxState === 'ok' ? '%' : ''}
                  accent={STATE_ACCENT(travel.maxState, false)} />
                <Stat label="Verdict"
                  value={travel.pass === null ? 'NO VERDICT' : (travel.pass ? 'WORKABLE' : 'CHECK')}
                  accent={travel.pass === null ? 'text-slate-400' : (travel.pass ? 'text-emerald-400' : 'text-amber-400')}
                  hint={`${travel.checksPerformed} of ${travel.checksPossible} checks ran`} />
              </div>
              {travel.passWithheldReason && <WarnNote>{travel.passWithheldReason}</WarnNote>}
              {travelWarnings.map((w) => <WarnNote key={w}>{w}</WarnNote>)}
              <p className="text-[12px] text-slate-500">
                A valve sized only for the maximum can sit almost on its seat at turndown, where the
                characteristic collapses and the loop cannot control. That failure never shows in a
                single-point Cv calculation, which is why this studio sizes at three flows.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {!isLiquid && noise && noise.error && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Aerodynamic noise indication</CardTitle></CardHeader>
          <CardContent><ErrorNote>{noise.error}</ErrorNote></CardContent>
        </Card>
      )}
      {!isLiquid && noise && !noise.error && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Aerodynamic noise indication</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Pressure ratio" value={fmt(noise.pressureRatio, 2)} />
              <Stat label="Stream power" value={fmt(noise.streamPowerKw, 1)} unit="kW"
                hint="the quantity the band is held down or raised by" />
              <Stat label="Mass flow" value={fmt(noise.massFlowLbHr, 0)} unit="lb/hr" />
              <Stat label="Band" value={noise.band}
                accent={noise.band === 'severe' ? 'text-red-400'
                  : (noise.band === 'high' ? 'text-orange-400' : 'text-emerald-400')}
                hint={noise.band === noise.ratioBand ? 'from the pressure ratio' : `the ratio alone said ${noise.ratioBand}`} />
            </div>
            {noise.powerEffect && <p className="text-[12px] text-amber-400/80">{noise.powerEffect}</p>}
            {noise.warning && <WarnNote>{noise.warning}</WarnNote>}
            <p className="text-[12px] text-slate-500">{noise.note}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
