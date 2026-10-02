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
import { fromRcpProspect, blankProspect, unitValueSource, setInput, upgradeProspect, DEFAULT_ECONOMICS } from '../services/rrvStore';

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
    // U2-002: a new prospect starts on the economic model, and says so
    expect(unitValueSource(blankProspect(1))).toMatch(/^derived here from the economic model of this valuation/);
    expect(unitValueSource(setInput(blankProspect(1), 'unitValue', 9.5))).toBe('entered on this screen');
    // a valuation an earlier build left on its untouched default still says that
    expect(unitValueSource(upgradeProspect({ id: 'own-1', source: 'own', name: 'Old', pg: 0.25, p90: 10, p50: 25, p10: 60, ...DEFAULT_ECONOMICS }))).toMatch(/starting default of 8 \$\/bbl, an assumption/);
    const valued = fromRcpProspect({ id: 'p2', ...seed[1] });
    expect(valued.unitValue).toBe(11.5);
    expect(unitValueSource(valued)).toMatch(/^from ReservoirCalc Pro success-case economics/);
    expect(unitValueSource({ ...valued, unitValue: 14 })).toMatch(/entered on this screen \(ReservoirCalc Pro sent 11\.5 \$\/bbl\)/);
    const plain = fromRcpProspect({ id: 'p1', ...seed[0] });
    expect(plain.econ.value).toBe('model');
    expect(unitValueSource(plain)).toMatch(/derived here from the economic model/);
  });

  it('the screen states the true source and claims no Petroleum Economics Studio handoff', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('rrv-import').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('rrv-import'));
    const line = () => screen.getByTestId('rrv-unit-value-source').textContent;
    expect(document.body.textContent).not.toMatch(/comes from the Petroleum Economics Studio/);
    expect(line()).toMatch(/No Petroleum Economics Studio case is in use for this prospect/); // U2-001: the handoff exists now, and none has happened here
    // the first prospect is selected: imported without economics, so the economic model
    expect(line()).toMatch(/derived here from the economic model/);
    // type a value: it is now the user's
    fireEvent.change(screen.getByTestId('rrv-unitValue-North'), { target: { value: '9.5' } });
    expect(line()).toMatch(/entered on this screen/);
    expect(line()).not.toMatch(/derived here/);
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
