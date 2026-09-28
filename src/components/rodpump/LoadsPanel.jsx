// The Design tab: what the pump has to lift, what reaches the plunger,
// what the well makes for it, and what the unit sees at the crankshaft.
import React from 'react';
import { ArrowDownToLine, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { fmt, Stat, Row } from './fields';

const ratingAccent = (pct) => {
  if (!Number.isFinite(pct)) return 'text-pl-text';
  if (pct > 100) return 'text-pl-danger-text';
  if (pct > 85) return 'text-pl-warning-text';
  return 'text-pl-success-text';
};

const LoadsPanel = () => {
  const { design, string } = useRodPump();
  const { show } = useFullPrecision();
  if (!design) return null;
  const { intake, gas, balance, rating, groups } = design;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-pl-muted" /> What the plunger lifts
            </span>
            <span className="block text-xs font-normal text-pl-muted mt-0.5">
              The fluid load is the differential across the plunger times its area. Both pressures
              are computed: the intake off the inflow, the discharge from the liquid column plus the
              wellhead pressure.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Intake pressure"
              value={fmt(intake.pipPsia)}
              unit="psia"
              hint={`${fmt(intake.pwfPsia)} psia at the perforations`}
            />
            <Stat
              label="Submergence"
              value={fmt(intake.submergenceFt)}
              unit="ft"
              hint="Fluid standing over the pump"
              accent={intake.submergenceFt < 100 ? 'text-pl-warning-text' : 'text-pl-text'}
            />
            <Stat
              label="Discharge pressure"
              value={fmt(design.pDischargePsi)}
              unit="psia"
              hint={`Liquid column at ${fmt(design.liquidSg, 3)} gravity plus wellhead`}
            />
            <Stat
              label="Fluid load"
              value={fmt(design.fluidLoadLb)}
              unit="lb"
              accent="text-pl-text"
              hint={`On a ${fmt(design.plungerDIn, 3)} in plunger`}
            />
          </div>

          <div className="border-t border-pl-border pt-4">
            <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold mb-3">
              What reaches the plunger, and what the well makes
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="Plunger stroke"
                value={fmt(design.plungerStrokeIn, 1)}
                unit="in"
                hint={`Sp/S = ${fmt(groups.spOverS, 3)}; the rest is rod stretch`}
              />
              <Stat
                label="Barrel fillage"
                value={fmt(gas.fillage * 100, 1)}
                unit="%"
                accent={gas.fillage < 0.85 ? 'text-pl-warning-text' : 'text-pl-success-text'}
                hint={gas.freeGasResBpd > 0
                  ? `${fmt(gas.gasThroughPumpResBpd, 1)} bbl/d of gas into the barrel`
                  : 'No free gas at intake conditions'}
              />
              <Stat
                label="Production"
                value={fmt(design.producedBpd, 1)}
                unit="bbl/d"
                hint={`Swept ${show(fmt(design.sweptBpd, 1), design.sweptBpd)}, rated ${show(fmt(design.ratedBpd, 1), design.ratedBpd)}`}
              />
              <Stat
                label="Polished rod power"
                value={fmt(design.prhp, 2)}
                unit="hp"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-pl-muted" /> Loads, torque and the unit
            </span>
            <span className="block text-xs font-normal text-pl-muted mt-0.5">
              The counterbalance is solved so the gearbox sees the same peak on the upstroke as on
              the downstroke, which is what balancing a unit means.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Peak rod load" value={fmt(design.pprlLb)} unit="lb" />
            <Stat
              label="Minimum rod load"
              value={fmt(design.mprlLb)}
              unit="lb"
              accent={design.mprlLb < 0 ? 'text-pl-danger-text' : 'text-pl-text'}
              hint={design.mprlLb < 0 ? 'Negative: the rods go into compression' : `Buoyed string ${fmt(string.weightFluidLb)} lb`}
            />
            <Stat
              label="Peak gearbox torque"
              value={balance ? fmt(balance.peakTorqueInLb) : '--'}
              unit="in-lb"
              hint={balance?.balanced ? 'Balanced' : 'No balance point found'}
            />
            <Stat
              label="Counterbalance effect"
              value={balance ? fmt(balance.counterbalanceEffectLb) : '--'}
              unit="lb"
              hint={balance ? `${fmt(balance.momentInLb)} in-lb of crank moment` : null}
            />
          </div>

          {rating && Number.isFinite(rating.structuralPct) && (
            <div className="border-t border-pl-border pt-4">
              <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold mb-3">
                Against the unit's ratings
              </p>
              <div className="grid grid-cols-3 gap-4">
                <Stat
                  label="Structure"
                  value={fmt(rating.structuralPct)}
                  unit="%"
                  accent={ratingAccent(rating.structuralPct)}
                />
                <Stat
                  label="Gearbox"
                  value={fmt(rating.torquePct)}
                  unit="%"
                  accent={ratingAccent(rating.torquePct)}
                />
                <Stat
                  label="Stroke"
                  value={fmt(rating.strokePct)}
                  unit="%"
                  accent={ratingAccent(rating.strokePct)}
                />
              </div>
            </div>
          )}

          <div className="border-t border-pl-border pt-4">
            <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold mb-2">
              The dimensionless groups
            </p>
            <p className="text-[11px] text-pl-muted mb-2">
              These are how a rod-pump answer is read, and they are the groups API RP 11L is plotted
              against. The numbers beside them came out of the wave equation. None was read off a chart.
            </p>
            <Row label="N / N0" value={fmt(groups.nOverN0, 3)} hint="Speed against the string's natural frequency" />
            <Row label="N / N0'" value={fmt(groups.nOverNPrime, 3)} hint="Against the tapered-string frequency" />
            <Row label="Fo / Skr" value={fmt(groups.foOverSkr, 4)} hint="Fluid load against the stroke the string could stretch" />
            <Row label="Sp / S" value={fmt(groups.spOverS, 4)} hint="How much of the stroke reaches the plunger" />
            <Row label="F1 / Skr" value={fmt(groups.f1OverSkr, 4)} hint="Peak load above the buoyed weight" />
            <Row label="F2 / Skr" value={fmt(groups.f2OverSkr, 4)} hint="Minimum load below it" />
            <Row label="2T / S2 kr" value={fmt(groups.torqueGroup, 4)} hint="Peak torque, made dimensionless" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoadsPanel;
