// Safety spacing check for the Layout Mapper (Facilities F8).
//
// The tool has always advertised safety distances; this is where they
// finally get computed. Two kinds of answer are kept visibly apart:
// the table spacings between equipment classes, and the radiation
// setbacks computed from a stated duty.
//
// FC1-0: the radiation inputs are held by the page and saved with the
// layout; flare and pool fire each carry their own allowable, heating
// value and fraction radiated; a blank input is named, never replaced.
import React, { useMemo } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import {
  runLayoutCheck, toFeet, RADIATION_LEVELS, SPACING_INPUT_LABELS,
  DEFAULT_SPACING_INPUTS, spacingInputsToRadiation, describeSkipped, incompleteReasons,
} from '@/utils/facilities/layoutSpacing';

const fmt = (v, d = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
  : '--');

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
  </div>
);

const LEVELS_HINT = `API 521 levels: ${RADIATION_LEVELS.map((l) => l.kWm2).join(', ')} kW/m2.`;

const SpacingPanel = ({ layers, inputs = DEFAULT_SPACING_INPUTS, onChange = () => {} }) => {
  const { full, show } = useFullPrecision();
  const set = (k, v) => onChange({ ...inputs, [k]: v });

  const NumField = ({ name, step = 'any', hint }) => (
    <Field label={SPACING_INPUT_LABELS[name]} hint={hint}>
      <Input type="number" step={step} value={inputs[name] ?? ''}
        aria-label={SPACING_INPUT_LABELS[name]}
        onChange={(e) => set(name, e.target.value)}
        className="h-8" />
    </Field>
  );

  const result = useMemo(() => runLayoutCheck({
    layers,
    radiation: spacingInputsToRadiation(inputs),
  }), [layers, inputs]);

  const incomplete = !result.error && !result.complete;
  // FC1-0: `pass` is null when nothing was checked, which is not a pass.
  const nothingChecked = !result.error && result.pass === null;
  const zeroPairs = result.zeroRequirementPairs || 0;
  const statusText = nothingChecked
    ? `Nothing was checked: ${zeroPairs === 1 ? '1 pair on this layout has' : `${zeroPairs} pairs on this layout have`} no required spacing in the table.`
    : (result.pass
      ? (incomplete
        ? `All ${result.checked} checks that ran pass, but the check is incomplete.`
        : `All ${result.checked} checks pass.`)
      : `${result.violations?.length} of ${result.checked} checks fail.`);
  const statusClass = result.pass === false
    ? 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text'
    : (nothingChecked || incomplete
      ? 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'
      : 'border-pl-success/40 bg-pl-success-bg text-pl-success-text');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-pl-text">
        <ShieldAlert className="w-4 h-4 text-pl-muted" />
        Safety spacing
      </div>

      <div className="space-y-3 border-b border-pl-border pb-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-pl-muted">Flare radiation setback</Label>
          <Switch checked={Boolean(inputs.flareEnabled)} aria-label="Flare radiation setback"
            onCheckedChange={(v) => set('flareEnabled', v)} />
        </div>
        {inputs.flareEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {NumField({ name: 'reliefRateKgS' })}
              {NumField({ name: 'flareLhvKjKg' })}
            </div>
            {NumField({ name: 'flareFractionRadiated', step: '0.01', hint: '0.2 to 0.4 typical; fuel and tip dependent.' })}
            {NumField({ name: 'flareAllowableKwM2', step: '0.01', hint: LEVELS_HINT })}
          </>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-xs text-pl-muted">Tank pool fire setback</Label>
          <Switch checked={Boolean(inputs.poolEnabled)} aria-label="Tank pool fire setback"
            onCheckedChange={(v) => set('poolEnabled', v)} />
        </div>
        {inputs.poolEnabled && (
          <>
            {NumField({ name: 'poolDiameterM', hint: 'The burning pool a full bund would make, centred on the tank.' })}
            <div className="grid grid-cols-2 gap-2">
              {NumField({ name: 'poolBurnRateKgM2S', step: '0.001' })}
              {NumField({ name: 'poolLhvKjKg' })}
            </div>
            {NumField({ name: 'poolFractionRadiated', step: '0.01' })}
            {NumField({ name: 'poolAllowableKwM2', step: '0.01', hint: LEVELS_HINT })}
          </>
        )}
        <p className="text-[11px] text-pl-muted">
          Initial values are an example case. They are saved with the layout when you save it.
        </p>
      </div>

      {result.error ? (
        <div className="flex gap-2 text-[12px] text-pl-muted">
          <Info className="w-4 h-4 shrink-0 text-pl-muted" />
          {result.error}
        </div>
      ) : (
        <>
          <div className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${statusClass}`}>
            {result.pass && !incomplete
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>{statusText}</div>
          </div>

          {incomplete && incompleteReasons(result).length > 0 && (
            <p className="text-[11px] text-pl-warning-text" data-testid="incomplete-reasons">
              Check incomplete: {incompleteReasons(result).join('; ')}.
            </p>
          )}

          {result.sourceErrors.length > 0 && (
            <div className="space-y-1">
              {result.sourceErrors.map((e) => (
                <p key={e.source} className="text-[12px] text-pl-warning-text">{e.message}</p>
              ))}
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold">Computed setbacks</p>
              {result.sources.map((s) => (
                <div key={`${s.id}-${s.kind}`} className="text-[12px] text-pl-muted">
                  {s.label}: <span className="text-pl-text font-semibold font-pl-mono tabular-nums">
                    {fmt(s.setbackM, 1)} m
                  </span> ({fmt(toFeet(s.setbackM), 0)} ft)
                  {s.kind === 'pool' && (
                    <p className="text-[11px] text-pl-muted">
                      Checked centre to centre. From the pool edge this is {fmt(s.setbackFromEdgeM, 1)} m
                      {s.detail?.setbackStatus === 'within-pool-edge'
                        ? ', because the computed radius lies inside the pool edge'
                        : ''}.
                    </p>
                  )}
                  {s.detail?.note && (
                    <p className="text-[11px] text-pl-warning-text mt-0.5">{s.detail.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.violations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold">Too close</p>
              <div className="text-[11px] text-pl-muted space-y-0.5" data-testid="worst-rankings">
                {result.worstAbsolute && (
                  <p>
                    Largest shortfall: {result.worstAbsolute.aName} to {result.worstAbsolute.bName},
                    short {show(fmt(result.worstAbsolute.shortfallM, 1), result.worstAbsolute.shortfallM)} m of {show(fmt(result.worstAbsolute.requiredM, 1), result.worstAbsolute.requiredM)} m.
                  </p>
                )}
                {result.worstRelative && (
                  <p>
                    Largest shortfall against its own requirement: {result.worstRelative.aName} to {result.worstRelative.bName},
                    {' '}{full
                      ? `short by a fraction ${formatFull(result.worstRelative.shortfallFraction)} of its requirement.`
                      : `${fmt(result.worstRelative.shortfallFraction * 100, 0)} percent short.`}
                  </p>
                )}
              </div>
              {result.violations.slice(0, 12).map((v, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="rounded border border-pl-border bg-pl-sunken px-2 py-1.5">
                  <p className="text-[12px] text-pl-text">
                    {v.aName} to {v.bName}
                  </p>
                  <p className="text-[11px] text-pl-muted font-pl-mono tabular-nums">
                    {fmt(v.actualM, 1)} m apart, needs {fmt(v.requiredM, v.kind === 'radiation' ? 1 : 0)} m
                    <span className="text-pl-danger-text"> (short {show(fmt(v.shortfallM, 1), v.shortfallM)} m, {full ? `fraction ${formatFull(v.shortfallFraction)}` : `${fmt(v.shortfallFraction * 100, 0)} percent`})</span>
                  </p>
                  <p className="text-[10px] text-pl-muted">
                    {v.kind === 'radiation' ? (v.label || 'radiation setback') : 'spacing table'}
                  </p>
                </div>
              ))}
              {result.violations.length > 12 && (
                <p className="text-[11px] text-pl-muted">
                  and {result.violations.length - 12} more.
                </p>
              )}
            </div>
          )}

          {result.skipped.length > 0 && (
            <p className="text-[11px] text-pl-muted">
              Not checked: {describeSkipped(result.skipped)}. Pipe runs have no single position,
              custom icons have no class the table knows, and an item with no position on the map
              cannot be measured, so judging any of them would invent a rule you never set.
            </p>
          )}

          <p className="text-[11px] text-pl-muted">
            All distances are measured centre to centre between icon positions. Table spacings are
            customary onshore production figures that have not yet been verified against the published literature.
            The radiation setbacks are computed from the duty you stated with a point-source model,
            so they move when the duty does. See the guide for its limits.
          </p>
        </>
      )}
    </div>
  );
};

export default SpacingPanel;
