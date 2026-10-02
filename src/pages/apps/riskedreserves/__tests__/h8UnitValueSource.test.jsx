/**
 * H8 (Reservoir honesty sweep): the readout and the $/bbl tooltip said the
 * value per barrel "comes from the Petroleum Economics Studio". No handoff
 * from that app exists. The value is typed here (a new prospect starts at
 * a default of 8 $/bbl) or arrives with a prospect valued in ReservoirCalc
 * Pro. The screen now says which.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation from '../components/RrvWorkstation';
import { makeInMemoryProspectsBackend } from '../../ReservoirCalcPro/services/prospectsService';
import { fromRcpProspect, blankProspect, unitValueSource, DEFAULT_ECONOMICS } from '../services/rrvStore';

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => localStorage.clear());

const risked = { pg: 0.3, success: { p90: 12, p50: 30, p10: 75 } };
const seed = [
  { name: 'North', pg_factors: {}, inputs: {}, risked },
  { name: 'Valued', pg_factors: {}, inputs: { economics: { unitValue: 11.5, devCost: 240 } }, risked },
];
const mount = () => render(<MemoryRouter><RrvWorkstation backend={makeInMemoryProspectsBackend(seed)} /></MemoryRouter>);

describe('H8: where the value per barrel comes from', () => {
  it('the source is read off the prospect', () => {
    expect(unitValueSource(blankProspect(1))).toMatch(/starting default of 8 \$\/bbl, an assumption/);
    expect(unitValueSource({ ...blankProspect(1), unitValue: 9.5 })).toBe('entered on this screen');
    const valued = fromRcpProspect({ id: 'p2', ...seed[1] });
    expect(valued.unitValue).toBe(11.5);
    expect(unitValueSource(valued)).toMatch(/^from ReservoirCalc Pro success-case economics/);
    expect(unitValueSource({ ...valued, unitValue: 14 })).toMatch(/entered on this screen \(ReservoirCalc Pro sent 11\.5 \$\/bbl\)/);
    const plain = fromRcpProspect({ id: 'p1', ...seed[0] });
    expect(plain.unitValue).toBe(DEFAULT_ECONOMICS.unitValue);
    expect(unitValueSource(plain)).toMatch(/starting default/);
  });

  it('the screen states the true source and claims no Petroleum Economics Studio handoff', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('rrv-import').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('rrv-import'));
    const line = () => screen.getByTestId('rrv-unit-value-source').textContent;
    expect(document.body.textContent).not.toMatch(/comes from the Petroleum Economics Studio/);
    expect(line()).toMatch(/Nothing is received from the Petroleum Economics Studio/);
    // the first prospect is selected: imported without economics, so the default
    expect(line()).toMatch(/starting default of 8 \$\/bbl/);
    // type a value: it is now the user's
    fireEvent.change(screen.getByTestId('rrv-unitValue-North'), { target: { value: '9.5' } });
    expect(line()).toMatch(/entered on this screen/);
    expect(line()).not.toMatch(/starting default/);
    // the tooltip on the column says the same
    const tip = screen.getByTestId('rrv-unitValue-North').getAttribute('title') || '';
    expect(tip).not.toMatch(/from the Petroleum Economics Studio/);
  });

  it('no Risked Reserves source file claims the handoff', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      'riskedreserves/components/RrvWorkstation.jsx',
      'RiskedReservesHelpGuide.jsx',
    ];
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      expect(text).not.toMatch(/(comes |, )from the Petroleum Economics Studio|\(from the Petroleum Economics Studio\)/);
    }
  });
});
