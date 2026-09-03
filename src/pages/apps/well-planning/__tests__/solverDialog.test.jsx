// Design-method dialog: the Solve button must never reach the global
// error boundary, the metres-to-depth-unit conversion must be driven by
// the wellbore's own depth unit, and the horizontal landing must take a
// heel target plus an optional toe target.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { solveSlant, solveHorizontalLanding } from '../engine/profileDesign';
import { M_TO_FT } from '../engine/surveyMath';

// Radix Select is pointer-driven and does not open under jsdom. Swap the
// primitives for a native select so the dialog's own logic is what is
// under test.
jest.mock('@/components/ui/select', () => {
  const R = require('react');
  const Ctx = R.createContext(null);
  return {
    Select: ({ value, onValueChange, children }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }) => {
      const c = R.useContext(Ctx);
      return (
        <select value={c.value} onChange={(e) => c.onValueChange(e.target.value)}>
          <option value="" />
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  };
});

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import SolverDialog from '../components/SolverDialog';

const HEAD_X = 500000;
const HEAD_Y = 6800000;
const KB_M = 30;

const wellboreIn = (unit) => ({
  id: 'wb1', name: 'TEST-1', head_x: HEAD_X, head_y: HEAD_Y,
  kb_elev_m: KB_M, depth_unit: unit,
});

// Heel 300 m NE of the wellhead; toe another 300 m along the same
// bearing, so the heel-to-toe azimuth is exactly 45 degrees.
const TARGETS = [
  { id: 't-heel', name: 'Amber heel', center_x: HEAD_X + 300, center_y: HEAD_Y + 300, tvdss_m: 2500 },
  { id: 't-toe', name: 'Amber toe', center_x: HEAD_X + 600, center_y: HEAD_Y + 600, tvdss_m: 2500 },
  { id: 't-bad', name: 'No position', center_x: null, center_y: null, tvdss_m: null },
];

// Combobox order in the DOM: method, target, then (horizontal only) toe.
const METHOD = 0;
const TARGET = 1;
const TOE = 2;

const setup = (props = {}) => {
  const onApply = jest.fn();
  const utils = render(
    <SolverDialog
      open
      onOpenChange={() => {}}
      targets={TARGETS}
      wellbore={wellboreIn('m')}
      mdUnit="m"
      kbM={KB_M}
      currentEnd={null}
      onApply={onApply}
      {...props}
    />,
  );
  const selects = () => screen.getAllByRole('combobox');
  const pick = (i, value) => fireEvent.change(selects()[i], { target: { value } });
  const solve = () => fireEvent.click(screen.getByTestId('solver-apply'));
  const problem = () => screen.queryByTestId('solver-problem');
  return { ...utils, onApply, pick, solve, problem };
};

beforeEach(() => mockToast.mockClear());

describe('unit normalisation', () => {
  test('a feet wellbore solves the metre target in feet, not metres', () => {
    const { onApply, pick, solve } = setup({
      wellbore: wellboreIn('ft'), mdUnit: 'ft',
    });
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-kop'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('solver-buildrate'), { target: { value: '3' } });
    solve();

    expect(onApply).toHaveBeenCalledTimes(1);
    const { report } = onApply.mock.calls[0][0];

    // What the engine gives for the same target converted to feet.
    const expected = solveSlant({
      target: {
        dE: 300 * M_TO_FT, dN: 300 * M_TO_FT,
        dTvd: (2500 + KB_M) * M_TO_FT - 1000,
      },
      buildRate: 3, mdUnit: 'ft',
    });
    expect(expected.feasible).toBe(true);
    expect(report.holdIncDeg).toBeCloseTo(expected.report.holdIncDeg, 9);

    // And it is measurably NOT the old defect, where the metre target
    // depth was solved against a feet kickoff and a deg/100ft rate.
    const leaked = solveSlant({
      target: { dE: 300, dN: 300, dTvd: (2500 + KB_M) - 1000 },
      buildRate: 3, mdUnit: 'ft',
    });
    expect(Math.abs(report.holdIncDeg - leaked.report.holdIncDeg)).toBeGreaterThan(1);
  });

  test('a metre wellbore solves the same target in metres', () => {
    const { onApply, pick, solve } = setup();
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-kop'), { target: { value: '300' } });
    solve();
    const { report } = onApply.mock.calls[0][0];
    const expected = solveSlant({
      target: { dE: 300, dN: 300, dTvd: (2500 + KB_M) - 300 },
      buildRate: 3, mdUnit: 'm',
    });
    expect(report.holdIncDeg).toBeCloseTo(expected.report.holdIncDeg, 9);
  });
});

describe('problems are inline, never thrown', () => {
  test('no target selected reports inline and does not solve', () => {
    const { onApply, solve, problem } = setup();
    expect(() => solve()).not.toThrow();
    expect(problem()).toHaveTextContent('Select a target first.');
    expect(onApply).not.toHaveBeenCalled();
  });

  test('a blank build rate is a field message, not a NaN solve', () => {
    const { onApply, pick, solve, problem } = setup();
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-buildrate'), { target: { value: '' } });
    solve();
    expect(problem()).toHaveTextContent(/build rate above zero/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('a target with no position is refused by name, not dereferenced', () => {
    const { onApply, pick, solve, problem } = setup();
    pick(TARGET, 't-bad');
    expect(() => solve()).not.toThrow();
    expect(problem()).toHaveTextContent(/no usable position/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('an infeasible geometry shows the engine message inline', () => {
    const { onApply, pick, solve, problem } = setup();
    pick(TARGET, 't-heel');
    // A kickoff below the target leaves nothing to build into.
    fireEvent.change(screen.getByTestId('solver-kop'), { target: { value: '5000' } });
    solve();
    expect(problem()).toHaveTextContent(/below the tie-on/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('the message clears when the designer changes an input', () => {
    const { pick, solve, problem } = setup();
    solve();
    expect(problem()).toBeInTheDocument();
    pick(TARGET, 't-heel');
    expect(problem()).not.toBeInTheDocument();
  });

  test('an append method with no design yet says so instead of solving', () => {
    const { onApply, pick, solve, problem } = setup({ currentEnd: null });
    pick(METHOD, 'horizontal');
    pick(TARGET, 't-heel');
    solve();
    expect(problem()).toHaveTextContent(/Design something first/i);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('horizontal landing takes a heel and a toe', () => {
  const AT_KOP = { inc: 0, azi: 0, n: 0, e: 0, tvd: 300 };
  const horizontal = () => {
    const u = setup({ currentEnd: AT_KOP });
    u.pick(METHOD, 'horizontal');
    return u;
  };

  test('both targets come from the existing target list', () => {
    const { pick } = horizontal();
    pick(TARGET, 't-heel');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByText('Alignment (toe) target')).toBeInTheDocument();
    expect(screen.getByText('Landing (heel) target')).toBeInTheDocument();
  });

  test('the landing azimuth is computed from the heel-to-toe vector', () => {
    const { onApply, pick, solve } = horizontal();
    pick(TARGET, 't-heel');
    pick(TOE, 't-toe');
    // Shown before solving.
    expect(screen.getByTestId('solver-effective-azi')).toHaveTextContent('45.0 deg');
    expect(screen.getByTestId('solver-alignment')).toHaveTextContent(/from heel to toe/i);
    solve();
    const { report } = onApply.mock.calls[0][0];
    expect(report.landAziSource).toBe('alignOn');
    expect(report.landAzi).toBeCloseTo(45, 6);
  });

  test('a toe on a different bearing moves the landing azimuth with it', () => {
    const dueEast = {
      id: 't-east', name: 'Due east toe',
      center_x: HEAD_X + 900, center_y: HEAD_Y + 300, tvdss_m: 2500,
    };
    const u = setup({ currentEnd: AT_KOP, targets: [...TARGETS, dueEast] });
    u.pick(METHOD, 'horizontal');
    u.pick(TARGET, 't-heel');
    u.pick(TOE, 't-east');
    expect(screen.getByTestId('solver-effective-azi')).toHaveTextContent('90.0 deg');
    u.solve();
    const { report } = u.onApply.mock.calls[0][0];
    expect(report.landAzi).toBeCloseTo(90, 6);
  });

  test('the manual azimuth field overrides the derived one', () => {
    const { onApply, pick, solve } = horizontal();
    pick(TARGET, 't-heel');
    pick(TOE, 't-toe');
    fireEvent.change(screen.getByTestId('solver-landazi'), { target: { value: '20' } });
    expect(screen.getByTestId('solver-effective-azi')).toHaveTextContent('20.0 deg');
    expect(screen.getByTestId('solver-alignment')).toHaveTextContent(/manual override/i);
    solve();
    const { report } = onApply.mock.calls[0][0];
    expect(report.landAziSource).toBe('override');
    expect(report.landAzi).toBeCloseTo(20, 9);
  });

  test('with no toe the azimuth still aims at the heel, as before', () => {
    const { onApply, pick, solve } = horizontal();
    pick(TARGET, 't-heel');
    expect(screen.getByTestId('solver-effective-azi')).toHaveTextContent('45.0 deg');
    solve();
    const { report } = onApply.mock.calls[0][0];
    expect(report.landAzi).toBeCloseTo(45, 6);
    // The engine derives it from the tie-on to the landing point.
    const expected = solveHorizontalLanding({
      tieOn: { inc: 0, azi: 0 },
      landing: { dE: 300, dN: 300, dTvd: (2500 + KB_M) - 300, incDeg: 90 },
      rate1: 3, rate2: 3, mdUnit: 'm',
    });
    expect(report.landAzi).toBeCloseTo(expected.report.landAzi, 9);
  });

  test('the landing inclination defaults to horizontal and is shown', () => {
    const { onApply, pick, solve } = horizontal();
    pick(TARGET, 't-heel');
    expect(screen.getByTestId('solver-effective-inc')).toHaveTextContent('90.0 deg');
    solve();
    const { report } = onApply.mock.calls[0][0];
    expect(report.landInc).toBeCloseTo(90, 9);
    expect(report.landIncSource).toBe('default');
  });

  test.each([89, 91, 88.5])('lands at %s deg when the designer asks for it', (inc) => {
    const { onApply, pick, solve } = horizontal();
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-landinc'), { target: { value: String(inc) } });
    expect(screen.getByTestId('solver-effective-inc')).toHaveTextContent(`${inc.toFixed(1)} deg`);
    solve();
    const { report } = onApply.mock.calls[0][0];
    expect(report.landInc).toBeCloseTo(inc, 9);
    expect(report.landIncSource).toBe('override');
  });

  test('a toe at a different TVD noses the landing along the heel-to-toe line', () => {
    // Toe 300 m NE of the heel and 20 m deeper: the lateral cannot be flat.
    const deepToe = {
      id: 't-deep', name: 'Deeper toe',
      center_x: HEAD_X + 600, center_y: HEAD_Y + 600, tvdss_m: 2520,
    };
    const u = setup({ currentEnd: AT_KOP, targets: [...TARGETS, deepToe] });
    u.pick(METHOD, 'horizontal');
    u.pick(TARGET, 't-heel');
    u.pick(TOE, 't-deep');
    const expected = (Math.atan2(Math.hypot(300, 300), 20) * 180) / Math.PI;
    expect(screen.getByTestId('solver-effective-inc')).toHaveTextContent(`${expected.toFixed(1)} deg`);
    expect(screen.getByTestId('solver-alignment')).toHaveTextContent(/deeper than the heel/i);
    u.solve();
    const { report } = u.onApply.mock.calls[0][0];
    expect(report.landIncSource).toBe('alignOn');
    expect(report.landInc).toBeCloseTo(expected, 6);
    expect(report.landInc).toBeLessThan(90);
  });

  test('the inclination override beats the heel-to-toe angle, azimuth still aligned', () => {
    const deepToe = {
      id: 't-deep', name: 'Deeper toe',
      center_x: HEAD_X + 600, center_y: HEAD_Y + 600, tvdss_m: 2520,
    };
    const u = setup({ currentEnd: AT_KOP, targets: [...TARGETS, deepToe] });
    u.pick(METHOD, 'horizontal');
    u.pick(TARGET, 't-heel');
    u.pick(TOE, 't-deep');
    fireEvent.change(screen.getByTestId('solver-landinc'), { target: { value: '91' } });
    u.solve();
    const { report } = u.onApply.mock.calls[0][0];
    expect(report.landIncSource).toBe('override');
    expect(report.landInc).toBeCloseTo(91, 9);
    expect(report.landAziSource).toBe('alignOn');
    expect(report.landAzi).toBeCloseTo(45, 6);
  });

  test('an out-of-range inclination is refused inline', () => {
    const { onApply, pick, solve, problem } = horizontal();
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-landinc'), { target: { value: '200' } });
    solve();
    expect(problem()).toHaveTextContent(/above 0 and no more than 180/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('the same target for heel and toe is refused', () => {
    const { onApply, pick, solve, problem } = horizontal();
    pick(TARGET, 't-heel');
    pick(TOE, 't-heel');
    solve();
    expect(problem()).toHaveTextContent(/heel and toe must be different targets/i);
    expect(onApply).not.toHaveBeenCalled();
  });
});

// ---- target frame (2026-09-03 fix) --------------------------------------
describe('target frame at the solver boundary', () => {
  test('a wellbore with no wellhead location refuses inline instead of solving against 0/0', () => {
    const { onApply, pick, solve, problem } = setup({
      wellbore: { ...wellboreIn('ft'), head_x: null, head_y: null }, mdUnit: 'ft',
    });
    pick(TARGET, 't-heel');
    solve();
    expect(problem()).toHaveTextContent(/no wellhead location/);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('a target in another coordinate frame is named as a frame mismatch, not degenerate geometry', () => {
    // the tester's case: local pad wellhead, target with a UTM easting
    const targets = [
      ...TARGETS,
      { id: 't-utm', name: 'UTM pick', center_x: 269000, center_y: 4700000, tvdss_m: 5000 },
    ];
    const { onApply, pick, solve, problem } = setup({
      targets, wellbore: { ...wellboreIn('ft'), head_x: 25000, head_y: 21000 }, mdUnit: 'ft',
    });
    pick(TARGET, 't-utm');
    fireEvent.change(screen.getByTestId('solver-kop'), { target: { value: '1000' } });
    solve();
    expect(problem()).toHaveTextContent(/not in the same coordinate frame/);
    expect(problem()).toHaveTextContent(/25,000 E, 21,000 N/);
    expect(problem()).not.toHaveTextContent(/of hole, past the/);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('a wellhead resolved from a slot on a pad with an origin solves like an explicit head', () => {
    const site = { origin_x: HEAD_X - 10, origin_y: HEAD_Y + 5, slots: [{ name: 'S1', dx_m: 10, dy_m: -5 }] };
    const { onApply, pick, solve } = setup({
      wellbore: { ...wellboreIn('m'), head_x: null, head_y: null, slot_name: 'S1' }, site,
    });
    pick(TARGET, 't-heel');
    fireEvent.change(screen.getByTestId('solver-kop'), { target: { value: '300' } });
    solve();
    expect(onApply).toHaveBeenCalledTimes(1);
    const expected = solveSlant({
      target: { dE: 300, dN: 300, dTvd: (2500 + KB_M) - 300 },
      buildRate: 3, mdUnit: 'm',
    });
    expect(onApply.mock.calls[0][0].report.holdIncDeg).toBeCloseTo(expected.report.holdIncDeg, 9);
  });
});
