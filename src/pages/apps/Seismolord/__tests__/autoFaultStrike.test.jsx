// The automatic fault list gave the engine's lattice strike as if it were a
// bearing: the Ekene growth fault (N20E, parallel to the inlines) read
// "strike 0°". It now reads from grid north when the survey's orientation is
// known, and says "lattice" when it is not.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { gridStrikeDeg, strikeLabel } from '../components/workspace/AutoFaultPicker';
import DetectFaultsDialog from '../components/workspace/dialogs/DetectFaultsDialog';

jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }));
jest.mock('../services/faultsService', () => ({ saveFault: async (f) => ({ id: 'f1', ...f }) }));

const DEG = Math.PI / 180;
// Ekene: increasing inline index runs N20E, increasing crossline N110E, 25 m bins
const ekene = {
  origin: { x: 0, y: 0 },
  ilVec: { x: 25 * Math.sin(20 * DEG), y: 25 * Math.cos(20 * DEG) },
  xlVec: { x: 25 * Math.sin(110 * DEG), y: 25 * Math.cos(110 * DEG) },
};

describe('gridStrikeDeg', () => {
  test('a fault along increasing inline index strikes with the inline axis', () => {
    expect(gridStrikeDeg(0, ekene)).toBeCloseTo(20, 6);
  });
  test('along the crosslines it strikes 90 degrees round from that', () => {
    expect(gridStrikeDeg(90, ekene)).toBeCloseTo(110, 6);
  });
  test('negative lattice angles fold into 0 to 180', () => {
    expect(gridStrikeDeg(-30, ekene)).toBeCloseTo(170, 6);
  });
  test('an unequal bin size bends the angle the way the map does', () => {
    const a = { origin: { x: 0, y: 0 }, ilVec: { x: 0, y: 12.5 }, xlVec: { x: 25, y: 0 } };
    expect(gridStrikeDeg(45, a)).toBeCloseTo((Math.atan2(25, 12.5) * 180) / Math.PI, 6);
  });
  test('no affine, or a legacy axis-aligned one, gives no bearing', () => {
    expect(gridStrikeDeg(0, null)).toBeNull();
    expect(gridStrikeDeg(0, { ...ekene, legacyAxisAligned: true })).toBeNull();
  });
});

describe('strikeLabel', () => {
  test('from grid north when the orientation is known', () => {
    expect(strikeLabel(0, ekene)).toBe('strike 20° from grid north');
  });
  test('says lattice when it is not', () => {
    expect(strikeLabel(0, null)).toBe('strike 0° (lattice)');
  });
});

test('Detect faults lists the strike from grid north for a measured survey', async () => {
  const geometry = {
    dt_us: 4000,
    affine: {
      origin: ekene.origin,
      il_vec: ekene.ilVec,
      xl_vec: ekene.xlVec,
    },
  };
  const runJob = () => ({
    promise: Promise.resolve({
      faults: [{ name: 'Auto-1', confidence: 0.4, sticks: [[{ il: 1, xl: 2, s: 3 }], [{ il: 2, xl: 2, s: 3 }]], stats: { strikeDeg: 0 } }],
      quality: { coherence: 0.99, thresholdScale: 1 },
      aoi: { il0: 0, il1: 9, xl0: 0, xl1: 9, s0: 0, s1: 9 },
    }),
    cancel() {},
  });
  render(
    <DetectFaultsDialog
      open
      onOpenChange={() => {}}
      volume={{ id: 'vol' }}
      manifest={{ geometry }}
      geom={{ nIl: 10, nXl: 10, ns: 10 }}
      center={{ il: 5, xl: 5 }}
      runJob={runJob}
    />,
  );
  fireEvent.click(screen.getByTestId('t2h-detect'));
  expect(await screen.findByText(/Auto-1: confidence 0\.40, 2 sticks, strike 20° from grid north/)).toBeInTheDocument();
});
