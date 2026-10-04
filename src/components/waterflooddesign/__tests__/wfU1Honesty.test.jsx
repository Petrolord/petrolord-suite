// Waterflood U1 honesty items (docs/upgrade/WaterfloodDesignStudio-UPGRADE.md):
// WF-U1-001 the rail's alert count read `.length` of an object and always
// printed 0; WF-U1-002 missing values printed '-' and 'N/A' (house rule:
// EMPTY_VALUE); WF-U1-003 "Avg VRR" was the cumulative ratio.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { analyzeWaterflood, sampleWaterfloodRows } from '@/utils/waterfloodCalculations';
import { countAlerts } from '@/utils/waterflooddesign/surveillance';
import { fmt } from '@/components/waterflooddesign/primitives';
import KPIPanel from '@/components/waterflood/KPIPanel';
import { EMPTY_VALUE } from '@/lib/emptyValue';

describe('WF-U1-001 the alert count', () => {
  it('counts every alert in every group of the engine result', () => {
    const r = analyzeWaterflood(sampleWaterfloodRows(), { bo: 1.25, bw: 1.02, bg: 0.9, rs: 500 });
    const expected = Object.values(r.alerts).reduce((n, a) => n + a.length, 0);
    expect(expected).toBeGreaterThan(0); // the sample plants a Hall alert on INJ-1
    expect(countAlerts(r.alerts)).toBe(expected);
    // negative control: the old reading
    expect(r.alerts.length ?? 0).toBe(0);
    expect(countAlerts(null)).toBe(0);
  });
});

describe('WF-U1-002 missing values', () => {
  it('fmt prints EMPTY_VALUE for a missing number', () => {
    for (const f of ['pct', 'f1', 'f2', 'f3', 'int']) expect(fmt[f](null)).toBe(EMPTY_VALUE);
    expect(fmt.f2(NaN)).toBe(EMPTY_VALUE);
    expect(fmt.f2(1.234)).toBe('1.23');
  });

  it('the KPI panel prints EMPTY_VALUE and names the cumulative VRR', () => {
    render(<KPIPanel kpis={{ avg_water_cut_pct: NaN, vrr_avg: 0.94, vrr_rolling: 0, total_injected_bbl: 1e6, total_oil_bbl: 2e6, total_water_bbl: 0 }} />);
    expect(screen.queryByText(/N\/A/)).toBeNull();
    expect(screen.getAllByText(new RegExp(EMPTY_VALUE)).length).toBeGreaterThan(0);
    expect(screen.getByText('Cumulative VRR')).toBeInTheDocument();
    expect(screen.queryByText('Avg VRR')).toBeNull();
  });
});
