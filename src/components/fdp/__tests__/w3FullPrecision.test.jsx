/**
 * W3 (NextGen graded-field follow-on, D3 and §1): Full precision in the FDP
 * Accelerator and the Project Management Pro as-of date. Off, every card
 * prints as before; on, the graded quantities print at the course's
 * precision. Expected values come from calling the engines on the course
 * cases (UKOT, MEREN-3), never from a restated formula.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import WellInventory from '@/components/fdp/modules/wells/WellInventory';
import FacilitiesCostEstimation from '@/components/fdp/modules/facilities/FacilitiesCostEstimation';
import SnapshotCard from '@/components/projectmanagement/SnapshotCard';
import { calculateDrillingTime, calculateDrillingCost } from '@/utils/fdp/wellCalculations';
import { calculateFacilityCost } from '@/utils/fdp/facilitiesCalculations';
import { calculateEVM } from '@/utils/projectManagementCalculations';
import { formatFull } from '@/lib/fullPrecision';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ user: null }) }));

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

// UKOT intermediate: rig 265000 USD a day, services 1.5 x the rig.
const well = (id, name, trajectory, md) => ({
  id, name, trajectory, md, type: 'Producer', status: 'Planned',
  cost: calculateDrillingCost(calculateDrillingTime(md, trajectory), 265000),
});
const UKOT_WELLS = [well('1', 'UK-01', 'Horizontal', 13100), well('2', 'UK-02', 'Deviated', 10400), well('3', 'UK-03', 'Vertical', 8700)];
const noop = () => {};

describe('FDP Accelerator well inventory', () => {
  it('off: $MM to 1 dp and no total row, as before', () => {
    render(<FullPrecisionProvider><WellInventory wells={UKOT_WELLS} onEdit={noop} onDelete={noop} onDuplicate={noop} /></FullPrecisionProvider>);
    expect(screen.getByText('UK-01').closest('tr')).toHaveTextContent('37.8');
    expect(screen.queryByTestId('well-campaign-total')).toBeNull();
  });

  it('on: each well cost to the USD and the campaign total', () => {
    expect(UKOT_WELLS[0].cost).toBe(37762500);
    render(<FullPrecisionProvider initial><WellInventory wells={UKOT_WELLS} onEdit={noop} onDelete={noop} onDuplicate={noop} /></FullPrecisionProvider>);
    expect(screen.getByText('UK-01').closest('tr')).toHaveTextContent(formatFull(UKOT_WELLS[0].cost, 0));
    const total = UKOT_WELLS.reduce((s, w) => s + w.cost, 0);
    expect(total).toBe(86125000);
    expect(screen.getByTestId('well-campaign-total')).toHaveTextContent(formatFull(total, 0));
  });
});

describe('FDP Accelerator facility estimate', () => {
  const facility = { id: 'f1', name: 'Ukot platform', type: 'Platform', nameplateCapacity: 45000 };
  const costs = calculateFacilityCost(facility);

  it('off: 1 dp as before', () => {
    render(<FullPrecisionProvider><FacilitiesCostEstimation facility={facility} /></FullPrecisionProvider>);
    expect(screen.getByTestId('decommissioning')).toHaveTextContent(`$${costs.decommissioning.toFixed(1)}M`);
  });

  it('on: capex and decommissioning in $MM at 4 decimals', () => {
    expect(Math.abs(costs.capex - 743.1213581482968)).toBeLessThan(1e-9);
    expect(Math.abs(costs.decommissioning - 111.46820372224452)).toBeLessThan(1e-9);
    render(<FullPrecisionProvider initial><FacilitiesCostEstimation facility={facility} /></FullPrecisionProvider>);
    expect(screen.getByText(`$${formatFull(costs.capex, 4)}M`)).toBeInTheDocument();
    expect(screen.getByTestId('decommissioning')).toHaveTextContent(`$${formatFull(costs.decommissioning, 4)}M`);
  });
});

// MEREN-3, read as of 2030-03-31.
const MEREN = [
  { name: 'Concept select', planned_cost: 1800000, actual_cost: 1950000, percent_complete: 100, planned_start_date: '2029-02-01', planned_end_date: '2029-07-31' },
  { name: 'Define and FEED', planned_cost: 4600000, actual_cost: 2860000, percent_complete: 70, planned_start_date: '2029-06-01', planned_end_date: '2030-05-31' },
  { name: 'Equipment orders', planned_cost: 7300000, actual_cost: 1180000, percent_complete: 20, planned_start_date: '2029-11-01', planned_end_date: '2030-12-31' },
  { name: 'Site construction', planned_cost: 9900000, actual_cost: 0, percent_complete: 0, planned_start_date: '2030-07-01', planned_end_date: '2031-09-30' },
];

describe('Project Management Pro snapshot', () => {
  const kpis = calculateEVM(MEREN, { asOf: '2030-03-31' });

  it('the engine at the stated as-of gives the course keys', () => {
    expect(Math.abs(kpis.pv - 8205591.467356173)).toBeLessThan(1);
    expect(Math.abs(kpis.spi - 0.7897054131660108)).toBeLessThan(1e-9);
  });

  it('off: SPI to 2 dp and no PV line, as before', () => {
    render(<FullPrecisionProvider><SnapshotCard project={{ id: 'p' }} kpis={kpis} riskCount={0} /></FullPrecisionProvider>);
    expect(document.body.textContent).toContain(`SPI: ${kpis.spi.toFixed(2)}`);
    expect(screen.queryByTestId('snapshot-pv')).toBeNull();
  });

  it('on: SPI at 6 decimals and PV to the cent', () => {
    render(<FullPrecisionProvider initial><SnapshotCard project={{ id: 'p' }} kpis={kpis} riskCount={0} /></FullPrecisionProvider>);
    expect(document.body.textContent).toContain(`SPI: ${formatFull(kpis.spi, 6)}`);
    expect(screen.getByTestId('snapshot-pv')).toHaveTextContent(`PV: $${formatFull(kpis.pv, 2)}`);
  });
});

describe('Project Management Pro as-of', () => {
  it('a blank or unreadable as-of means today; a typed one is used', () => {
    // eslint-disable-next-line global-require
    const { resolveAsOf } = require('@/pages/apps/ProjectManagementPro');
    expect(resolveAsOf('', '2026-01-02')).toBe('2026-01-02');
    expect(resolveAsOf('2030-02-30x', '2026-01-02')).toBe('2026-01-02');
    expect(resolveAsOf('2030-03-31', '2026-01-02')).toBe('2030-03-31');
  });
});
