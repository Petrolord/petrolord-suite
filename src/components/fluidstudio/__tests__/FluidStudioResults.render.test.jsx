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

  it('exposes an enabled Pipeline Sizer handoff and a disabled Nodal button', () => {
    renderResults();
    const pipelineBtn = screen.getByRole('button', { name: /Send to Pipeline Sizer/i });
    expect(pipelineBtn).toBeEnabled();
    const nodalBtn = screen.getByRole('button', { name: /coming soon/i });
    expect(nodalBtn).toBeDisabled();
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
  it('mounts with live and gated tabs', () => {
    const inputs = sampleFluidStudioData();
    render(<FluidStudioInput inputs={inputs} setInputs={() => {}} />);
    expect(screen.getByText('Stream A')).toBeInTheDocument();
    expect(screen.getByText('Correlations')).toBeInTheDocument();
    // Phase-2 gated triggers are disabled.
    const blending = screen.getByRole('tab', { name: /Blending/i });
    expect(blending).toBeDisabled();
  });
});
