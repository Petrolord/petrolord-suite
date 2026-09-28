// The electrical half of the installation (Electrical tab): what the
// motor draws at this shaft load, what the cable loses carrying it down
// the hole, and what has to be present at the switchboard for the motor
// to see its plate. The cable table shows every candidate and why each
// one passed or failed, rather than announcing a winner.
import React from 'react';
import { Zap, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Stat = ({ label, value, unit, hint, accent = 'text-pl-text' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold font-pl-mono tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-pl-muted">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const ElectricalPanel = () => {
  const { design, inputs } = useEsp();
  if (!design) return null;
  const { electrical, sized, nameplate } = design;
  const chosen = electrical.cable;
  const req = electrical.requirement;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-pl-muted" /> Motor and surface power
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Shaft power"
              value={fmt(sized.shaftHp, 1)}
              unit="hp"
              hint={`against a ${fmt(nameplate.hp)} hp nameplate`}
            />
            <Stat
              label="Motor load"
              value={sized.motorLoad ? fmt(sized.motorLoad.loadFraction * 100) : '--'}
              unit="%"
              accent={sized.motorLoad && sized.motorLoad.loadFraction > 1
                ? 'text-pl-danger-text'
                : (sized.motorLoad && sized.motorLoad.loadFraction < 0.5 ? 'text-pl-warning-text' : 'text-pl-success-text')}
            />
            <Stat
              label="Motor current"
              value={req ? fmt(req.amps, 1) : '--'}
              unit="A"
              hint={`nameplate ${fmt(nameplate.amps)} A`}
            />
            <Stat
              label="Input power"
              value={sized.motorLoad ? fmt(sized.motorLoad.inputKw, 1) : '--'}
              unit="kW"
              hint={`at ${fmt(Number(inputs.motor.motorEfficiencyPct))} percent motor efficiency`}
            />
          </div>

          {req?.estimateWeakBelowHalfLoad && (
            <p className="text-[11px] text-pl-warning-text">
              Below about half load the real current flattens out toward the magnetising current, so
              the current above is an estimate and is no longer a reading off the nameplate scaling.
            </p>
          )}

          <div className="border-t border-pl-border pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Selected cable"
              value={chosen ? chosen.label : 'none'}
              accent={chosen ? 'text-pl-success-text' : 'text-pl-danger-text'}
              hint={`over ${fmt(Number(inputs.motor.cableLengthFt))} ft at ${fmt(Number(inputs.motor.cableTempF))} F`}
            />
            <Stat
              label="Voltage drop"
              value={req ? fmt(req.dropPct, 2) : '--'}
              unit="%"
              hint={req ? `${fmt(req.dropV, 1)} V` : `limit ${fmt(electrical.maxDropPct)} percent`}
            />
            <Stat
              label="Surface voltage"
              value={req ? fmt(req.surfaceVolts) : '--'}
              unit="V"
              hint={`motor sees ${fmt(nameplate.volts)} V`}
            />
            <Stat
              label="Surface kVA"
              value={req ? fmt(req.kva, 1) : '--'}
              unit="kVA"
              hint={req ? `${fmt(req.lossKw, 1)} kW lost in the cable` : null}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Cable candidates
            <span className="block text-xs font-normal text-pl-muted mt-0.5">
              Smallest conductor first. Resistance is the published copper value corrected to the
              cable temperature; ampacity belongs to the insulation system and is a manufacturer
              number, so it is not assumed and only the drop limit is applied here.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                  <th className="text-left font-semibold px-4 py-2">Conductor</th>
                  <th className="text-right font-semibold px-4 py-2">Ohms / 1000 ft</th>
                  <th className="text-right font-semibold px-4 py-2">Drop (V)</th>
                  <th className="text-right font-semibold px-4 py-2">Drop (%)</th>
                  <th className="text-right font-semibold px-4 py-2">Surface (V)</th>
                  <th className="text-right font-semibold px-4 py-2">Loss (kW)</th>
                  <th className="text-center font-semibold px-4 py-2">Within limit</th>
                </tr>
              </thead>
              <tbody>
                {electrical.candidates.map((c) => (
                  <tr
                    key={c.cable.awg}
                    className={`border-b border-pl-border last:border-0 ${
                      chosen && c.cable.awg === chosen.awg ? 'bg-pl-success-bg' : ''
                    }`}
                  >
                    <td className="px-4 py-2 text-pl-text">
                      {c.cable.label}
                      {chosen && c.cable.awg === chosen.awg && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-pl-success-text">
                          selected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">
                      {c.requirement.resistanceOhmsPer1000Ft.toFixed(4)}
                    </td>
                    <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.requirement.dropV, 1)}</td>
                    <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.requirement.dropPct, 2)}</td>
                    <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.requirement.surfaceVolts)}</td>
                    <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.requirement.lossKw, 2)}</td>
                    <td className="px-4 py-2 text-center">
                      {c.dropOk
                        ? <Check className="w-4 h-4 text-pl-success-text inline" />
                        : <X className="w-4 h-4 text-pl-danger-text inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ElectricalPanel;
