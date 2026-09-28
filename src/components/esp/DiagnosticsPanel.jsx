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
      <Label className="text-xs text-pl-muted">{label}</Label>
      <Input
        type="number"
        value={inputs.diagnostics[name] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setSection('diagnostics', name, e.target.value)}
        className="h-9"
      />
      {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
    </div>
  );
};

const Stat = ({ label, value, unit, hint, accent = 'text-pl-text' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold font-pl-mono tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-pl-muted">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const DiagnosticsPanel = () => {
  const { design, diagnosis } = useEsp();

  const ratio = diagnosis?.headRatio;
  const ratioAccent = !Number.isFinite(ratio)
    ? 'text-pl-text'
    : (ratio < 0.85 ? 'text-pl-danger-text' : (ratio > 1.15 ? 'text-pl-warning-text' : 'text-pl-success-text'));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-pl-muted" /> What the installation is doing
            <span className="text-xs font-normal text-pl-muted">
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
          <p className="text-[11px] text-pl-muted">
            The rate is the in-situ rate through the pump, which is what the curve is drawn against.
            Leave the stage count blank to use the {design ? fmt(design.sized.stages) : ''} stages
            this design sized; type a number to check the string that is actually in the hole.
          </p>

          {!design ? (
            <p className="text-sm text-pl-muted py-6 text-center">
              The design has to run first: the diagnosis is read against its stage curve and the
              fluid gradient at the intake.
            </p>
          ) : !diagnosis ? (
            <p className="text-sm text-pl-muted py-6 text-center">
              Enter a rate and both pressures to compare the installation with its curve.
            </p>
          ) : (
            <>
              <div className="border-t border-pl-border pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <ul className="space-y-2 border-t border-pl-border pt-4">
                  {diagnosis.flags.map((f, i) => (
                    <li key={`${f.code}-${i}`} className="text-sm text-pl-warning-text flex gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-pl-warning-text" />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-pl-success-text border-t border-pl-border pt-4">
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
