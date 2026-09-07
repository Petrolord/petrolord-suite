// Tester fix 2026-09-07: the explorer shows where the trajectory came from,
// the wellbore header and a survey listing, in the wellbore's depth unit.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import WellboreDetails from '../components/WellboreDetails';

const stations = Array.from({ length: 11 }, (_, i) => ({ md: i * 100, inc: Math.min(60, i * 6), azi: 90 }));
const WELLBORE = { id: 'wb', name: 'Lad', depth_unit: 'ft', kb_elev_m: 25, ground_elev_m: 4, azimuth_reference: 'true', head_x: 500000, head_y: 6700000, status: 'planning', geo_well_id: 'geo-1' };

describe('WellboreDetails', () => {
  test('draft source: label, note, header facts and the survey listing in feet', () => {
    render(<WellboreDetails testPrefix="td" trajectory={{
      wellbore: WELLBORE, design: { name: 'Plan A', revision: 1 }, stations, source: 'draft',
      label: 'Plan A r1 (draft, not yet definitive), 11 stations', note: 'Promote it with Set definitive.',
    }} />);
    expect(screen.getByTestId('td-traj-info')).toHaveAttribute('data-source', 'draft');
    expect(screen.getByTestId('td-traj-info')).toHaveTextContent('Plan A r1 (draft, not yet definitive), 11 stations');
    expect(screen.getByTestId('td-traj-note')).toHaveTextContent('Set definitive');
    // 1000 m TD in feet, KB 25 m in feet
    expect(screen.getByTestId('td-wellbore-td')).toHaveTextContent('3281 ft');
    expect(screen.getByTestId('td-wellbore-header')).toHaveTextContent('82.0 ft');
    expect(screen.getByTestId('td-wellbore-header')).toHaveTextContent('60.0°');
    expect(screen.getByTestId('td-wellbore-header')).toHaveTextContent('linked');
    fireEvent.click(screen.getByTestId('td-survey-toggle'));
    const table = screen.getByTestId('td-survey-table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(11);
    expect(table).toHaveTextContent('°/100ft');
  });

  test('no trajectory: the note names the next step and there is no listing', () => {
    render(<WellboreDetails testPrefix="ct" trajectory={{ wellbore: { ...WELLBORE, depth_unit: 'm' }, design: null, stations: [], source: 'none', label: 'No trajectory', note: 'Add a design from the wellbore menu.' }} />);
    expect(screen.getByTestId('ct-traj-info')).toHaveAttribute('data-source', 'none');
    expect(screen.getByTestId('ct-traj-note')).toHaveTextContent('wellbore menu');
    expect(screen.queryByTestId('ct-survey-toggle')).toBeNull();
    expect(screen.queryByTestId('ct-wellbore-td')).toBeNull();
  });

  test('a legacy backend result without source still reads as the definitive design', () => {
    render(<WellboreDetails testPrefix="td" trajectory={{ wellbore: { ...WELLBORE, depth_unit: 'm' }, design: { name: 'Base', revision: 2 }, stations }} />);
    expect(screen.getByTestId('td-traj-info')).toHaveTextContent('Base r2 (definitive), 11 stations');
    expect(screen.getByTestId('td-traj-info')).toHaveAttribute('data-source', 'definitive');
  });
});
