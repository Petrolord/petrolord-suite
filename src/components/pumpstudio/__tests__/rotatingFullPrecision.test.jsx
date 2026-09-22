/**
 * W3 (D3): the Full precision switch on the Pump and Compressor Station
 * Designers. Off, every card prints what it printed before. On, the graded
 * quantities print at 6 decimals (fuel gas at 9), read from the studio's own
 * context, which is what the engine returned.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { PumpStudioProvider, usePump } from '@/contexts/PumpStudioContext';
import { CompressorStudioProvider, useCompressor } from '@/contexts/CompressorStudioContext';
import { DutyResults, NpshResults } from '@/components/pumpstudio/PumpPanels';
import { TrainResults, ScreenResults } from '@/components/compressorstudio/CompressorPanels';
import { fmt } from '@/components/pumpstudio/fields';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import { headFtToPsi } from '@/utils/facilities/engine/pumps';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

let pump;
const PumpProbe = ({ edits = [] }) => {
  const ctx = usePump();
  pump = ctx;
  React.useEffect(() => {
    edits.forEach(([s, k, v]) => ctx.setSection(s, k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};
let comp;
const CompProbe = () => { comp = useCompressor(); return null; };

const statValue = (label) => screen.getByText(label).nextSibling.firstChild.textContent.trim();

describe('Pump Station Designer', () => {
  const renderPump = (on, edits) => render(
    <PumpStudioProvider>
      <FullPrecisionProvider initial={on}>
        <PumpProbe edits={edits} />
        <DutyResults />
        <NpshResults />
      </FullPrecisionProvider>
    </PumpStudioProvider>,
  );

  it('off: the duty card prints as before and shows no pressure stat', () => {
    renderPump(false);
    expect(pump.duty.error).toBeUndefined();
    expect(statValue('Duty flow')).toBe(fmt(pump.duty.qGpm, 0));
    expect(statValue('Duty head')).toBe(fmt(pump.duty.headFt, 0));
    expect(statValue('Brake power')).toBe(fmt(pump.power.brakeHp, 1));
    expect(screen.getByText(`${fmt(pump.power.hydraulicHp, 1)} hydraulic hp`)).toBeInTheDocument();
    expect(screen.queryByText('Duty head as pressure')).toBeNull();
  });

  it('on: duty, power and the head as pressure print at 6 decimals', () => {
    renderPump(true);
    expect(statValue('Duty flow')).toBe(formatFull(pump.duty.qGpm));
    expect(statValue('Duty head')).toBe(formatFull(pump.duty.headFt));
    expect(statValue('Brake power')).toBe(formatFull(pump.power.brakeHp));
    expect(statValue('Motor input')).toBe(formatFull(pump.power.motorInputKw));
    expect(screen.getByText(`${formatFull(pump.power.hydraulicHp)} hydraulic hp`)).toBeInTheDocument();
    const psi = headFtToPsi({ headFt: pump.duty.headFt, sg: parseFloat(pump.inputs.fluid.sg) });
    expect(Number.isFinite(psi)).toBe(true);
    expect(statValue('Duty head as pressure')).toBe(formatFull(psi));
  });

  it('on: the change card prints before, after and the moved duty at 6 decimals', async () => {
    renderPump(true, [['changes', 'speedRatio', '0.87']]);
    await waitFor(() => expect(pump.changeEffect && !pump.changeEffect.error && pump.changeEffect.changed).toBe(true));
    const ce = pump.changeEffect;
    expect(statValue('Duty flow after')).toBe(formatFull(ce.after.qGpm));
    expect(statValue('Duty flow before')).toBe(formatFull(ce.before.qGpm));
    expect(statValue('Old duty, moved onto the new curve')).toBe(formatFull(ce.onCurve.qGpm));
    expect(screen.getByText(`${formatFull(ce.onCurve.headFt)} ft. On the pump curve, not on the system curve.`)).toBeInTheDocument();
  });
});

describe('Compressor Station Designer', () => {
  const renderComp = (on) => render(
    <CompressorStudioProvider>
      <FullPrecisionProvider initial={on}>
        <CompProbe />
        <TrainResults />
        <ScreenResults />
      </FullPrecisionProvider>
    </CompressorStudioProvider>,
  );

  it('off: head, stage gas hp and fuel print as before', () => {
    renderComp(false);
    expect(statValue('Polytropic head')).toBe(fmt(comp.firstStage.headPolyFtLbfLbm, 0));
    expect(statValue('Fuel gas')).toBe(fmt(comp.fuel.fuelMMscfd, 3));
    expect(screen.getAllByText(fmt(comp.train.stages[0].gasHp, 0)).length).toBeGreaterThan(0);
  });

  it('on: polytropic head and stage gas hp at 6 decimals, fuel gas at 9', () => {
    renderComp(true);
    expect(statValue('Polytropic head')).toBe(formatFull(comp.firstStage.headPolyFtLbfLbm));
    expect(statValue('Fuel gas')).toBe(formatFull(comp.fuel.fuelMMscfd, 9));
    expect(screen.getByText(formatFull(comp.train.stages[0].gasHp))).toBeInTheDocument();
    expect(statValue('Brake power')).toBe(formatFull(comp.train.totalBrakeHp));
  });
});
