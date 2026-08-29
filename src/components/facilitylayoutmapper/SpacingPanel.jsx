// Safety spacing check for the Layout Mapper (Facilities F8).
//
// The tool has always advertised safety distances; this is where they
// finally get computed. Two kinds of answer are kept visibly apart:
// the table spacings between equipment classes, and the radiation
// setbacks computed from a stated duty.
import React, { useMemo, useState } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { runLayoutCheck, toFeet, RADIATION_LEVELS } from '@/utils/facilities/layoutSpacing';

const fmt = (v, d = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
  : '--');

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

const SpacingPanel = ({ layers }) => {
  const [radiation, setRadiation] = useState({
    flareEnabled: true,
    poolEnabled: false,
    reliefRateKgS: '20',
    lhvKjKg: '46000',
    fractionRadiated: '0.3',
    allowableKwM2: '4.73',
    poolDiameterM: '20',
  });

  const set = (k, v) => setRadiation((prev) => ({ ...prev, [k]: v }));
  const num = (v, f = NaN) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : f;
  };

  const result = useMemo(() => runLayoutCheck({
    layers,
    radiation: {
      flareEnabled: radiation.flareEnabled,
      poolEnabled: radiation.poolEnabled,
      reliefRateKgS: num(radiation.reliefRateKgS),
      lhvKjKg: num(radiation.lhvKjKg, 46000),
      fractionRadiated: num(radiation.fractionRadiated, 0.3),
      allowableKwM2: num(radiation.allowableKwM2, 4.73),
      poolDiameterM: num(radiation.poolDiameterM, 20),
    },
  }), [layers, radiation]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        Safety spacing
      </div>

      <div className="space-y-3 border-b border-slate-700/50 pb-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-slate-400">Flare radiation setback</Label>
          <Switch checked={radiation.flareEnabled}
            onCheckedChange={(v) => set('flareEnabled', v)} />
        </div>
        {radiation.flareEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Relief rate (kg/s)">
                <Input type="number" value={radiation.reliefRateKgS}
                  onChange={(e) => set('reliefRateKgS', e.target.value)}
                  className="h-8 bg-slate-800 border-slate-700" />
              </Field>
              <Field label="LHV (kJ/kg)">
                <Input type="number" value={radiation.lhvKjKg}
                  onChange={(e) => set('lhvKjKg', e.target.value)}
                  className="h-8 bg-slate-800 border-slate-700" />
              </Field>
            </div>
            <Field label="Fraction radiated" hint="0.2 to 0.4 typical; fuel and tip dependent.">
              <Input type="number" step="0.01" value={radiation.fractionRadiated}
                onChange={(e) => set('fractionRadiated', e.target.value)}
                className="h-8 bg-slate-800 border-slate-700" />
            </Field>
          </>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-xs text-slate-400">Tank pool fire setback</Label>
          <Switch checked={radiation.poolEnabled}
            onCheckedChange={(v) => set('poolEnabled', v)} />
        </div>
        {radiation.poolEnabled && (
          <Field label="Bund pool diameter (m)" hint="The burning pool a full bund would make.">
            <Input type="number" value={radiation.poolDiameterM}
              onChange={(e) => set('poolDiameterM', e.target.value)}
              className="h-8 bg-slate-800 border-slate-700" />
          </Field>
        )}

        <Field label="Allowable radiation">
          <Select value={radiation.allowableKwM2} onValueChange={(v) => set('allowableKwM2', v)}>
            <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RADIATION_LEVELS.map((l) => (
                <SelectItem key={l.kWm2} value={String(l.kWm2)}>
                  {l.kWm2} kW/m2
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {result.error ? (
        <div className="flex gap-2 text-[12px] text-slate-400">
          <Info className="w-4 h-4 shrink-0 text-slate-500" />
          {result.error}
        </div>
      ) : (
        <>
          <div className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${result.pass
            ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300'
            : 'border-red-700/50 bg-red-950/30 text-red-300'}`}>
            {result.pass
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              {result.pass
                ? `All ${result.checked} checks pass.`
                : `${result.violations.length} of ${result.checked} checks fail.`}
            </div>
          </div>

          {result.sources.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Computed setbacks</p>
              {result.sources.map((s) => (
                <div key={`${s.id}-${s.label}`} className="text-[12px] text-slate-400">
                  {s.label}: <span className="text-slate-200 font-semibold tabular-nums">
                    {fmt(s.setbackM, 0)} m
                  </span> ({fmt(toFeet(s.setbackM), 0)} ft)
                  {s.detail?.note && (
                    <p className="text-[11px] text-yellow-400/80 mt-0.5">{s.detail.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.violations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Too close</p>
              {result.violations.slice(0, 12).map((v, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-1.5">
                  <p className="text-[12px] text-slate-200">
                    {v.aName} to {v.bName}
                  </p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    {fmt(v.actualM, 1)} m apart, needs {fmt(v.requiredM, 0)} m
                    <span className="text-red-400"> (short {fmt(v.shortfallM, 1)} m)</span>
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {v.kind === 'radiation' ? (v.label || 'radiation setback') : 'spacing table'}
                  </p>
                </div>
              ))}
              {result.violations.length > 12 && (
                <p className="text-[11px] text-slate-500">
                  and {result.violations.length - 12} more.
                </p>
              )}
            </div>
          )}

          {result.skipped.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {result.skipped.length} item{result.skipped.length === 1 ? '' : 's'} not checked:
              pipe runs have no single position, and custom icons have no class the table knows,
              so judging either would invent a rule you never set.
            </p>
          )}

          <p className="text-[11px] text-slate-600">
            Table spacings are the customary onshore production figures and are a table, not a
            calculation. The radiation setbacks above them are computed from the duty you stated,
            so they move when it does.
          </p>
        </>
      )}
    </div>
  );
};

export default SpacingPanel;
