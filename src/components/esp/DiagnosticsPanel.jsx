// Diagnostics (Diagnostics tab) — the absorbed ESP Performance Monitor.
//
// The same stage curve, read backwards. Given what a surveillance
// record actually holds (rate, intake and discharge pressure, drive
// frequency, motor amps) the honest comparison the curve supports is:
// what SHOULD this stack make at this rate and speed, against what it
// IS making. A pump at 80 percent of its curve is worn, gas locked or
// running on a wrong stage count, and the number says so without
// pretending to know which.
import React from 'react';
import { Stethoscope, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Field = ({ label, name, hint, placeholder }) => {
  const { inputs, setSection } = useEsp();
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input
        type="number"
        value={inputs.diagnostics[name] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setSection('diagnostics', name, e.target.value)}
        className="h-9 bg-slate-800 border-slate-700"
      />
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
};

const Stat = ({ label, value, unit, hint, accent = 'text-slate-100' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-lg font-semibold tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
  </div>
);

const DiagnosticsPanel = () => {
  const { design, diagnosis } = useEsp();

  const ratio = diagnosis?.headRatio;
  const ratioAccent = !Number.isFinite(ratio)
    ? 'text-slate-100'
    : (ratio < 0.85 ? 'text-red-400' : (ratio > 1.15 ? 'text-amber-300' : 'text-emerald-400'));

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-sky-400" /> What the installation is doing
            <span className="text-xs font-normal text-slate-500">
              read against the curve on the Pump Curve tab
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Field label="Rate (bbl/d)" name="qBpd" placeholder="in situ" />
            <Field label="Intake (psia)" name="pIntakePsia" />
            <Field label="Discharge (psia)" name="pDischargePsia" />
            <Field label="Frequency (Hz)" name="hz" />
            <Field label="Motor amps" name="amps" placeholder="optional" />
            <Field
              label="Stages"
              name="stagesOverride"
              placeholder={design ? String(design.sized.stages) : ''}
            />
          </div>
          <p className="text-[11px] text-slate-600">
            The rate is the in-situ rate through the pump, which is what the curve is drawn against.
            Leave the stage count blank to use the {design ? fmt(design.sized.stages) : ''} stages
            this design sized; type a number to check the string that is actually in the hole.
          </p>

          {!design ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              The design has to run first: the diagnosis is read against its stage curve and the
              fluid gradient at the intake.
            </p>
          ) : !diagnosis ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Enter a rate and both pressures to compare the installation with its curve.
            </p>
          ) : (
            <>
              <div className="border-t border-slate-800 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Head it is making"
                  value={fmt(diagnosis.actualHeadFt)}
                  unit="ft"
                  hint="From the two measured pressures"
                />
                <Stat
                  label="Head the curve says"
                  value={fmt(diagnosis.expectedHeadFt)}
                  unit="ft"
                />
                <Stat
                  label="Of its curve"
                  value={Number.isFinite(ratio) ? fmt(ratio * 100) : '--'}
                  unit="%"
                  accent={ratioAccent}
                />
                <Stat
                  label="Rate over best efficiency"
                  value={fmt(diagnosis.qOverBep, 2)}
                  hint={{
                    downthrust: 'downthrust',
                    upthrust: 'upthrust',
                    recommended: 'inside the range',
                  }[diagnosis.region] || diagnosis.region}
                />
              </div>

              {diagnosis.flags.length > 0 ? (
                <ul className="space-y-2 border-t border-slate-800 pt-4">
                  {diagnosis.flags.map((f, i) => (
                    <li key={`${f.code}-${i}`} className="text-sm text-amber-100/80 flex gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-emerald-400 border-t border-slate-800 pt-4">
                  The installation is on its curve and inside the recommended range.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DiagnosticsPanel;
