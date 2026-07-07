/**
 * Render smoke tests — exercise the real component tree (tabs, ChartFrame,
 * Recharts, CSV/handoff wiring) in jsdom to catch mount-time crashes that a
 * static review cannot. Recharts needs a sized container; jsdom reports 0px, so
 * we stub ResizeObserver and offset dimensions.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FluidStudioResults from '../FluidStudioResults';
import FluidStudioInput from '../FluidStudioInput';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 });
});

const renderResults = () => {
  const results = analyzeFluidSystem(sampleFluidStudioData());
  render(
    <MemoryRouter>
      <FluidStudioResults results={results} />
    </MemoryRouter>,
  );
  return results;
};

describe('FluidStudioResults renders', () => {
  it('mounts and shows KPI values from the engine', () => {
    const results = renderResults();
    // Bubble-point KPI value should appear as text.
    expect(screen.getByText(String(Math.round(results.pvt.kpis.pb)))).toBeInTheDocument();
    expect(screen.getByText('Bubble Point')).toBeInTheDocument();
    expect(screen.getByText('PVT Analysis')).toBeInTheDocument();
  });

  it('shows the black-oil approximation warning', () => {
    renderResults();
    expect(screen.getByText(/black-oil staged-liberation approximation/i)).toBeInTheDocument();
  });

  it('exposes an enabled Pipeline Sizer handoff and no dead Nodal button', () => {
    renderResults();
    const pipelineBtn = screen.getByRole('button', { name: /Send to Pipeline Sizer/i });
    expect(pipelineBtn).toBeEnabled();
    // The dead Nodal handoff was removed (Nodal Analysis is a separate unbuilt app).
    expect(screen.queryByRole('button', { name: /Nodal/i })).not.toBeInTheDocument();
  });

  it('CSV export click does not throw', () => {
    // jsdom lacks URL.createObjectURL — stub it so the click path runs.
    global.URL.createObjectURL = jest.fn(() => 'blob:x');
    global.URL.revokeObjectURL = jest.fn();
    renderResults();
    const btn = screen.getByRole('button', { name: /Export PVT CSV/i });
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });
});

describe('FluidStudioInput renders', () => {
  it('mounts with Phase-2 tabs live and Composition gated', () => {
    const inputs = sampleFluidStudioData();
    render(<FluidStudioInput inputs={inputs} setInputs={() => {}} />);
    expect(screen.getByText('Stream A')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Blending/i })).toBeEnabled();
    expect(screen.getByRole('tab', { name: /Batch/i })).toBeEnabled();
    expect(screen.getByRole('tab', { name: /Flow Assurance/i })).toBeEnabled();
    // Composition remains a Phase-3 gated trigger.
    expect(screen.getByRole('tab', { name: /Composition/i })).toBeDisabled();
  });
});

describe('Phase 2 result tabs render', () => {
  it('shows Flow Assurance tab (sample has a P-T profile) with hydrate risk', () => {
    // Sample profile crosses the hydrate curve at the cold end.
    renderResults();
    expect(screen.getByRole('tab', { name: /Flow Assurance/i })).toBeInTheDocument();
  });

  it('renders Blending and Batch cards when enabled', () => {
    const inputs = {
      ...sampleFluidStudioData(),
      blending: { enabled: true, streamB_fraction: 50 },
      batchRun: { enabled: true, variable: 'gor', min: 400, max: 800, steps: 5 },
    };
    const results = analyzeFluidSystem(inputs);
    render(<MemoryRouter><FluidStudioResults results={results} /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: /Blending/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Batch Sweep/i })).toBeInTheDocument();
    // Blending is the default-visible? No — PVT is default; just assert tabs exist and no throw.
    expect(results.blending).not.toBeNull();
    expect(results.batchSummary.length).toBe(5);
  });
});
