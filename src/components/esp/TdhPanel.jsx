// The head the pump has to make, and where it comes from (Design tab).
//
// Total dynamic head is (discharge - intake) / gradient. The three-part
// reading below is a DECOMPOSITION of that number, arranged so the
// parts sum to it exactly. The third part is named for what it actually
// holds: tubing friction AND the fact that the column above the pump is
// lighter than the fluid inside it once free gas is back in the stream.
// On a gassy well the second effect is the larger of the two, which is
// why calling this row "friction" would be a lie.
import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Stat = ({ label, value, unit, hint, accent = 'text-slate-100' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-lg font-semibold tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
  </div>
);

const TdhPanel = () => {
  const { design, pumpMd } = useEsp();
  if (!design) return null;
  const { duty } = design;
  const { breakdown, intake, discharge } = duty;
  const share = (v) => (duty.tdhFt > 0 ? `${((v / duty.tdhFt) * 100).toFixed(0)} % of the head` : null);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Total dynamic head
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            The pressure the pump has to add, in feet of the fluid it is pumping. Both pressures are
            computed, not assumed: the intake off the inflow, the discharge off a flowing traverse.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat
            label="Intake"
            value={fmt(intake.pipPsia)}
            unit="psia"
            hint={`${fmt(intake.pwfPsia)} psia at the perforations`}
          />
          <Stat
            label="Discharge"
            value={fmt(discharge.pDischargePsia)}
            unit="psia"
            hint={`Traverse from the wellhead to ${fmt(pumpMd)} ft MD`}
          />
          <Stat
            label="Pressure to add"
            value={fmt(duty.dpPsi)}
            unit="psi"
          />
          <Stat
            label="Head"
            value={fmt(duty.tdhFt)}
            unit="ft"
            accent="text-emerald-400"
            hint={`at ${fmt(intake.gradientPsiPerFt, 3)} psi/ft`}
          />
        </div>

        <div className="border-t border-slate-800 pt-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">
            Where the head goes
          </p>
          <div className="space-y-2">
            {[
              {
                label: 'Net vertical lift',
                value: breakdown.netLiftFt,
                hint: `Pump at ${fmt(design.pumpTvdFt)} ft, less the level the intake pressure stands for`,
              },
              {
                label: 'Wellhead pressure',
                value: breakdown.whpHeadFt,
                hint: 'The backpressure, in feet of the pumped fluid',
              },
              {
                label: 'Friction and gas lightening',
                value: breakdown.frictionFt,
                hint: 'Tubing friction, plus the column above the pump being lighter than the fluid in it',
              },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">{row.label}</p>
                  <p className="text-[11px] text-slate-600">{row.hint}</p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <p className="text-sm font-semibold text-slate-100 tabular-nums">
                    {fmt(row.value)} ft
                  </p>
                  <p className="text-[11px] text-slate-600">{share(row.value)}</p>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2">
              <p className="text-sm font-semibold text-slate-200">Total</p>
              <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                {fmt(breakdown.tdhFt)} ft
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Stages" value={fmt(design.sized.stages)} accent="text-sky-400" />
          <Stat
            label="Head the stack makes"
            value={fmt(design.sized.headMadeFt)}
            unit="ft"
            hint={`${design.sized.headMarginFt >= 0 ? 'over' : 'under'} by ${fmt(Math.abs(design.sized.headMarginFt))} ft`}
          />
          <Stat
            label="Stage efficiency"
            value={fmt(design.sized.stage.efficiency * 100, 1)}
            unit="%"
            hint={{
              downthrust: 'left of the range',
              upthrust: 'right of the range',
              recommended: 'inside the range',
            }[design.sized.stage.region] || design.sized.stage.region}
          />
          <Stat
            label="Shaft power"
            value={fmt(design.sized.shaftHp, 1)}
            unit="hp"
            hint={`${fmt(design.sized.hydraulicHp, 1)} hp hydraulic`}
          />
        </div>

        <p className="text-[11px] text-slate-600 flex items-start gap-1.5 border-t border-slate-800 pt-3">
          {duty.tdhFt > 0
            ? <ArrowUp className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
            : <ArrowDown className="w-3 h-3 mt-0.5 shrink-0" />}
          The stage count is always rounded up, so the stack makes at least the head the well
          demands. A margin of more than about one stage's worth means the duty is off the design
          rate; the system curve run shows where it would actually settle.
        </p>
      </CardContent>
    </Card>
  );
};

export default TdhPanel;
