// Display units of Decline Curve Analysis (DCA-U1, PL3): the Suite unit
// profile decides the units the app opens in; the switch is a view for this
// session. Wells, fits, forecasts and saved projects stay in bbl/d, Mscf/d
// and a per-day decline (src/utils/declineCurve/dcaUnits.js).
import React, { createContext, useContext, useMemo } from 'react';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  DCA_UNIT_APP, DCA_UNIT_SPEC, DCA_OILFIELD_VIEW, DCA_METRIC_VIEW, DCA_OILFIELD_UNITS, createDcaUnits,
} from '@/utils/declineCurve/dcaUnits';

const Ctx = createContext(null);

export function DcaUnitsProvider({ children }) {
  const hook = useAppUnits(DCA_UNIT_APP, DCA_UNIT_SPEC, { fallback: DCA_OILFIELD_VIEW });
  const u = useMemo(() => createDcaUnits(hook.units), [hook.units]);
  const value = useMemo(() => ({ hook, u }), [hook, u]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The unit view; oilfield (the state's own units) without a provider. */
export function useDcaUnits() {
  return useContext(Ctx)?.u || DCA_OILFIELD_UNITS;
}

export function useDcaUnitsHook() {
  return useContext(Ctx)?.hook || null;
}

const same = (a, b) => ['liquidRate', 'gasRate'].every((k) => a[k] === b[k]);

const DECLINE_OPTIONS = [
  { value: '%/yr', label: '%/yr' },
  { value: '1/month', label: '1/month' },
  { value: '1/d', label: '1/d' },
];

export function DcaUnitsControl() {
  const hook = useDcaUnitsHook();
  const u = useDcaUnits();
  if (!hook) return null;
  const current = same(hook.units, DCA_OILFIELD_VIEW) ? 'oilfield' : same(hook.units, DCA_METRIC_VIEW) ? 'metric' : 'profile';
  const apply = (view) => { hook.setUnit('liquidRate', view.liquidRate); hook.setUnit('gasRate', view.gasRate); };
  const options = [{ value: 'oilfield', label: 'Oilfield' }, { value: 'metric', label: 'Metric' }];
  if (current === 'profile') options.push({ value: 'profile', label: 'My profile' });
  return (
    <section className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="dca-units">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">Display units</span>
        <SegmentedControl
          size="sm"
          label="Display units"
          value={current}
          onValueChange={(v) => { if (v === 'oilfield') apply(DCA_OILFIELD_VIEW); else if (v === 'metric') apply(DCA_METRIC_VIEW); }}
          options={options}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-pl-muted">Decline rate (nominal)</span>
        <SegmentedControl
          size="sm"
          label="Decline rate unit"
          value={hook.units.decline}
          onValueChange={(v) => hook.setUnit('decline', v)}
          options={DECLINE_OPTIONS}
        />
      </div>
      <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="dca-units-line">
        {u.rateLabel('oil')} for oil and water, {u.rateLabel('gas')} for gas; volumes in {u.volumeLabel('oil')} and {u.volumeLabel('gas')}.
        {' '}Di is the nominal decline at the start of the fit, per {u.declineLabel.replace(/^%\//, '').replace(/^1\//, '')}; a year is 365.25 days.
      </p>
      {hook.available && hook.differs.length > 0 && (
        <button type="button" className="text-[11px] underline text-pl-primary-text" onClick={hook.resetToProfile} data-testid="dca-units-reset">
          Use my units profile
        </button>
      )}
    </section>
  );
}
