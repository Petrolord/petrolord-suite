/**
 * 2026-10-14: the prognosis chart's point series (shale pressures, calibration,
 * LOT/FIT, a mud weight that took an influx) show their marker in the legend.
 * They were drawn with stroke "none", which the legend uses for the icon, so
 * the legend showed the name beside an empty icon.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import PrognosisChart from '../components/PrognosisChart';

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  const { cloneElement } = jest.requireActual('react');
  return { ...R, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 600 }) };
});

const n = 50;
const zBmlM = Array.from({ length: n }, (_, i) => 50 + i * 40);
const profile = {
  overburdenPa: zBmlM.map((z) => 22000 * z + 4e5),
  hydrostaticPa: zBmlM.map((z) => 10100 * (z + 35)),
  porePressurePa: zBmlM.map((z) => 10100 * (z + 35) * (z > 1200 ? 1.3 : 1)),
  fracPressurePa: zBmlM.map((z) => 17000 * z + 3e5),
  shalePpPa: zBmlM.map((z, i) => (i % 2 ? null : 10100 * (z + 35))),
};
const calibration = [
  { z: 1500, pMpa: 20, kind: 'rft' },
  { z: 1400, pMpa: 28, kind: 'lot' },
  { z: 1300, pMpa: 15, kind: 'mwkick' },
];

test('every point series shows a coloured marker in the legend', () => {
  const { container } = render(<PrognosisChart profile={profile} zBmlM={zBmlM} calibration={calibration} units={{ depth: 'm', pressure: 'MPa' }} params={{ waterDepthM: 35 }} />);
  const items = [...container.querySelectorAll('.recharts-legend-item')];
  const icon = (name) => {
    const it = items.find((li) => li.textContent.trim() === name);
    expect(it).toBeTruthy();
    const shape = it.querySelector('.recharts-legend-icon') || it.querySelector('path');
    return shape.getAttribute('fill') || shape.getAttribute('stroke');
  };
  for (const name of ['Shale pressures', 'Calibration', 'LOT/FIT', 'Mud weight that took an influx']) {
    const c = icon(name);
    expect(c).toBeTruthy();
    expect(c).not.toBe('none');
  }
});
