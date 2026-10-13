// Depth units in Well Design Studio (2026-10-13): target depths, the
// wellbore datum, the vertical tolerance and the separation-rule inputs
// show and take feet for an oilfield profile while every value is still
// stored in metres. Negative control in each case: the metre path stores
// what was typed, unchanged.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

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
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

// eslint-disable-next-line import/first
import { mToUnit, unitToM, fieldFromM, showDepth } from '../services/depthUnits';
// eslint-disable-next-line import/first
import TargetDialog from '../components/TargetDialog';
// eslint-disable-next-line import/first
import UnitNumberInput from '../components/UnitNumberInput';
// eslint-disable-next-line import/first
import SolverDialog from '../components/SolverDialog';

const T1 = 1885.36; // kit ekene-11-targets.csv, T1 Oboro Sand, m TVDSS

describe('conversions', () => {
  test('feet round trip to the centimetre, metres untouched', () => {
    expect(unitToM('6185.6', 'ft')).toBeCloseTo(1885.37, 2);
    expect(fieldFromM(T1, 'ft')).toBe('6185.5643');
    expect(unitToM(fieldFromM(T1, 'ft'), 'ft')).toBeCloseTo(T1, 4);
    expect(unitToM('1885.36', 'm')).toBe(1885.36);
    expect(mToUnit(T1, 'm')).toBe(T1);
    expect(showDepth(T1, 'ft', 1)).toBe('6185.6');
    expect(unitToM('', 'ft')).toBeNull();
    expect(fieldFromM(null, 'ft')).toBe('');
  });
});

const fillTarget = (tvdss, radius) => {
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'T1 Oboro Sand' } });
  const nums = screen.getAllByRole('spinbutton');
  fireEvent.change(nums[0], { target: { value: '402250' } });
  fireEvent.change(nums[1], { target: { value: '521750' } });
  fireEvent.change(screen.getByTestId('wd-target-tvdss'), { target: { value: tvdss } });
  if (radius != null) {
    // circle kind shows the radius field
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'circle' } });
    fireEvent.change(screen.getByTestId('wd-target-radius'), { target: { value: radius } });
  }
};

describe('TargetDialog', () => {
  test('a feet profile types 6185.6 ft and 164 ft and stores metres', async () => {
    const onSave = jest.fn(async () => {});
    render(<TargetDialog open onOpenChange={() => {}} target={null} onSave={onSave} depthUnit="ft" />);
    expect(screen.getByText('TVDSS (ft)')).toBeInTheDocument();
    fillTarget('6185.6', '164');
    fireEvent.click(screen.getByRole('button', { name: 'Create target' }));
    await screen.findByRole('button', { name: 'Create target' });
    const p = onSave.mock.calls[0][0];
    expect(p.tvdss_m).toBeCloseTo(1885.37, 2);
    expect(p.geometry.radius_m).toBeCloseTo(49.99, 2);
    expect(p.center_x).toBe(402250); // eastings stay in site metres
  });

  test('negative control: a metre profile stores what was typed', async () => {
    const onSave = jest.fn(async () => {});
    render(<TargetDialog open onOpenChange={() => {}} target={null} onSave={onSave} depthUnit="m" />);
    expect(screen.getByText('TVDSS (m)')).toBeInTheDocument();
    fillTarget('1885.36', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Create target' }));
    await screen.findByRole('button', { name: 'Create target' });
    expect(onSave.mock.calls[0][0].tvdss_m).toBe(1885.36);
    expect(onSave.mock.calls[0][0].geometry.radius_m).toBe(50);
  });

  test('an existing target opens in feet and saves back the same metres', async () => {
    const onSave = jest.fn(async () => {});
    const target = { id: 'x', name: 'T1', kind: 'circle', category: 'geological', center_x: 402250, center_y: 521750, tvdss_m: T1, geometry: { radius_m: 50 } };
    render(<TargetDialog open onOpenChange={() => {}} target={target} onSave={onSave} depthUnit="ft" />);
    expect(screen.getByTestId('wd-target-tvdss')).toHaveValue(6185.5643);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Save changes' });
    expect(onSave.mock.calls[0][0].tvdss_m).toBeCloseTo(T1, 4);
    expect(onSave.mock.calls[0][0].geometry.radius_m).toBeCloseTo(50, 4);
  });
});

describe('UnitNumberInput', () => {
  const Harness = ({ unit, onM }) => {
    const [m, setM] = React.useState(25);
    return <UnitNumberInput unit={unit} valueM={m} onChangeM={(v) => { setM(v); onM(v); }} data-testid="f" />;
  };
  test('KB 25 m shows 82.021 ft; typing 82.02 ft stores 25.0 m; flipping to metres shows the metres', () => {
    const onM = jest.fn();
    const { rerender } = render(<Harness unit="ft" onM={onM} />);
    expect(screen.getByTestId('f')).toHaveValue(82.021);
    fireEvent.change(screen.getByTestId('f'), { target: { value: '82.02' } });
    expect(onM.mock.calls.at(-1)[0]).toBeCloseTo(25.0, 3);
    rerender(<Harness unit="m" onM={onM} />);
    expect(screen.getByTestId('f')).toHaveValue(25);
  });
  test('negative control: metres pass through', () => {
    const onM = jest.fn();
    render(<Harness unit="m" onM={onM} />);
    fireEvent.change(screen.getByTestId('f'), { target: { value: '30' } });
    expect(onM).toHaveBeenLastCalledWith(30);
  });
});

describe('SolverDialog target list', () => {
  const props = {
    open: true, onOpenChange: () => {}, kbM: 25, currentEnd: null, onApply: jest.fn(),
    targets: [{ id: 't1', name: 'T1 Oboro Sand', center_x: 402250, center_y: 521750, tvdss_m: T1 }],
  };
  test('a feet wellbore names the target depth in feet', () => {
    render(<SolverDialog {...props} wellbore={{ id: 'w', head_x: 401700, head_y: 521600, kb_elev_m: 25, depth_unit: 'ft' }} mdUnit="ft" />);
    expect(screen.getByRole('option', { name: 'T1 Oboro Sand (6186 ft TVDSS)' })).toBeInTheDocument();
  });
  test('negative control: a metre wellbore keeps metres', () => {
    render(<SolverDialog {...props} wellbore={{ id: 'w', head_x: 401700, head_y: 521600, kb_elev_m: 25, depth_unit: 'm' }} mdUnit="m" />);
    expect(screen.getByRole('option', { name: 'T1 Oboro Sand (1885 m TVDSS)' })).toBeInTheDocument();
  });
});
