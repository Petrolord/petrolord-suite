/**
 * Worked example data for the FDP Accelerator (Economics E3).
 *
 * What this replaces. Every module carried an "Import" button wired to a
 * service that announced it was connecting to a real Suite app, waited behind
 * a simulated latency, and then returned hardcoded values. Clicking Import on
 * the Field Overview tab reported "Field data updated from Geoscience &
 * Reservoir apps"; the Cost tab said "Importing from AFE & Project
 * Management". None of those applications were contacted, and the numbers
 * that landed in the plan were invented. A user could take a porosity of 0.22
 * or a rig rate of $250,000 a day into a development decision believing it
 * came from their own subsurface work.
 *
 * The data itself is a serviceable worked example of an offshore oil
 * development, so it is kept and called what it is. Nothing here claims a
 * source, nothing waits to look like a network call, and the buttons that
 * load it say "example".
 *
 * Real cross-app import is a separate piece of work. When it exists it will
 * read the Suite's own saved artifacts, the way Decision Studio already reads
 * saved Monte Carlo runs, decision trees and portfolios.
 */

import { createRisk, RiskTypes, RiskStatus } from '@/data/fdp/HSEModel';

export const EXAMPLE_LABEL = 'Example offshore oil development';

/** Field overview and reservoir summary. */
export const exampleFieldData = () => ({
  assetType: 'Offshore',
  waterDepth: 850,
  fieldArea: 42,
  status: 'Appraisal',
});

export const exampleSubsurface = () => ({
  reserves: {
    summary: { p10: 165, p50: 115, p90: 75, unit: 'MMbbl', rf: 0.35 },
    breakdown: [
      { id: 'r1', name: 'Reservoir A', p10: 120, p50: 85, p90: 60, fluid: 'Oil', rf: 0.35 },
      { id: 'r2', name: 'Reservoir B', p10: 45, p50: 30, p90: 15, fluid: 'Gas', rf: 0.65 },
    ],
  },
  properties: {
    zones: [
      { id: 'z1', name: 'Upper Sand A', porosity: 0.24, permeability: 450, ntg: 0.85, sw: 0.20 },
      { id: 'z2', name: 'Lower Sand B', porosity: 0.18, permeability: 120, ntg: 0.65, sw: 0.35 },
    ],
  },
  pressureTemp: {
    gradient: 0.45,
    temperatureGradient: 1.2,
    datumDepth: 8500,
    datumPressure: 3825,
    dataPoints: [],
  },
  geomech: {
    porePressureGradient: 0.45,
    fractureGradient: 0.72,
    mudWindow: { min: 9.2, max: 13.5 },
  },
});

export const exampleWells = () => ([
  { id: 'wp-101', name: 'P-01', type: 'Producer', trajectory: 'Horizontal', tvd: 8500, md: 12400, location: { lat: 56.5, lng: 3.2 }, status: 'Planned' },
  { id: 'wp-102', name: 'P-02', type: 'Producer', trajectory: 'Horizontal', tvd: 8550, md: 12600, location: { lat: 56.52, lng: 3.21 }, status: 'Planned' },
  { id: 'wp-103', name: 'I-01', type: 'Injector', trajectory: 'Deviated', tvd: 8800, md: 10200, location: { lat: 56.48, lng: 3.18 }, status: 'Planned' },
]);

/**
 * Facility concepts, as order-of-magnitude screening figures.
 *
 * Capex in $MM and opex in $MM per year. These are round numbers for a
 * comparison of concepts, not a cost estimate for any particular project.
 */
export const exampleFacilities = () => ([
  { id: 'bench-001', name: 'FPSO - Generic Large', type: 'FPSO', nameplateCapacity: 150000, gasCapacity: 200, waterCapacity: 120000, capex: 1500, opex: 65 },
  { id: 'bench-002', name: 'Platform - Shallow Water', type: 'Platform', nameplateCapacity: 50000, gasCapacity: 50, waterCapacity: 30000, capex: 600, opex: 25 },
  { id: 'bench-003', name: 'Subsea Tie-back System', type: 'Subsea Tie-back', nameplateCapacity: 30000, gasCapacity: 20, waterCapacity: 10000, capex: 350, opex: 15 },
]);

/** Cost items in $MM. */
export const exampleCosts = () => ([
  { id: 'ex-001', name: 'Mob/Demob', category: 'Drilling', type: 'CAPEX', amount: 2.5, phase: 'Mobilization', unit: 'Lump Sum' },
  { id: 'ex-002', name: 'Rig Daily Rate (30d)', category: 'Drilling', type: 'CAPEX', amount: 7.5, phase: 'Execution', unit: 'Day Rate' },
  { id: 'ex-003', name: 'Tangibles (Casing)', category: 'Drilling', type: 'CAPEX', amount: 3.2, phase: 'Execution', unit: 'Lump Sum' },
  { id: 'ex-004', name: 'Cementing Services', category: 'Drilling', type: 'CAPEX', amount: 1.1, phase: 'Execution', unit: 'Service' },
  { id: 'ex-005', name: 'EPC Contract - Topsides', category: 'Fabrication', type: 'CAPEX', amount: 450, phase: 'Construction', unit: 'Contract' },
  { id: 'ex-006', name: 'Subsea Umbilicals', category: 'Installation', type: 'CAPEX', amount: 85, phase: 'Installation', unit: 'Lump Sum' },
  { id: 'ex-007', name: 'PMT Team', category: 'Management', type: 'CAPEX', amount: 25, phase: 'All', unit: 'Yearly' },
  { id: 'ex-008', name: 'Logistics & Support', category: 'Support', type: 'OPEX', amount: 0.5, phase: 'Execution', unit: 'Monthly' },
]);

export const exampleHseRisks = () => ([
  createRisk({
    name: 'High Pressure Zone Drilling',
    type: RiskTypes.SAFETY,
    probability: 4,
    impact: 5,
    mitigation: 'Use MPD equipment, specialized crew training.',
    status: RiskStatus.MITIGATED,
  }),
  createRisk({
    name: 'Chemical Spill Potential',
    type: RiskTypes.ENVIRONMENTAL,
    probability: 2,
    impact: 4,
    mitigation: 'Double containment tanks, spill response kit on site.',
    status: RiskStatus.ASSESSED,
  }),
  createRisk({
    name: 'Noise Pollution for Local Village',
    type: RiskTypes.COMMUNITY,
    probability: 5,
    impact: 3,
    mitigation: 'Sound barriers, restricted operating hours for heavy machinery.',
    status: RiskStatus.IDENTIFIED,
  }),
]);

/** A schedule laid out relative to today, so the example is never stale. */
export const exampleSchedule = (from = new Date()) => {
  const add = (days) => {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  return [
    { id: 'act-1', name: 'Project Sanction', type: 'Milestone', start: add(0), end: add(0), duration: 0, progress: 100, dependencies: [] },
    { id: 'act-2', name: 'Detailed Engineering', type: 'Engineering', start: add(1), end: add(60), duration: 60, progress: 45, dependencies: ['act-1'] },
    { id: 'act-3', name: 'Procurement - Long Lead', type: 'Procurement', start: add(30), end: add(120), duration: 90, progress: 20, dependencies: ['act-1'] },
    { id: 'act-4', name: 'Fabrication - Topsides', type: 'Fabrication', start: add(121), end: add(300), duration: 180, progress: 0, dependencies: ['act-3'] },
    { id: 'act-5', name: 'Drilling Campaign', type: 'Drilling', start: add(150), end: add(400), duration: 250, progress: 0, dependencies: ['act-2'] },
    { id: 'act-6', name: 'Installation & HUC', type: 'Installation', start: add(301), end: add(360), duration: 60, progress: 0, dependencies: ['act-4'] },
    { id: 'act-7', name: 'First Oil', type: 'Milestone', start: add(401), end: add(401), duration: 0, progress: 0, dependencies: ['act-5', 'act-6'] },
  ];
};
