/**
 * PETRO-M-006 (user manual, 2026-10-07): the histogram normalization fit maps
 * the overlay (target) well onto the open (reference) well, but Condition
 * prefilled it on whichever well was open, so it shifted the reference well
 * by its own correction. It is now offered only on the well it was fitted
 * for; elsewhere the dialog says which well to open. PETRO-M-005: the block
 * depth shift is typed in the session's unit.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConditioningDialog from '../components/ConditioningDialog';

const depth = Float64Array.from({ length: 50 }, (_, i) => 2000 + i * 0.5);
const gr = Float64Array.from(depth, (d, i) => 40 + (i % 10) * 5);
const wellData = (wellId) => ({ wellId, curves: { DEPT: depth, GR: gr }, allLogs: [] });
const fit = { targetId: 'w-offset', targetName: 'OFFSET-2', referenceId: 'w-type', curveKey: 'GR', result: { shift: 7.5, scale: 1.1 } };

function open(wellId, extra = {}) {
  render(<ConditioningDialog open onOpenChange={() => {}} wellData={wellData(wellId)} projectId="p" backend={{}} onSaved={() => {}} onStatus={() => {}} lastNormFit={fit} {...extra} />);
  fireEvent.change(screen.getByTestId('petro-cond-op'), { target: { value: 'normalize' } });
}

test('on the fitted (target) well the fit is prefilled', () => {
  open('w-offset');
  expect(screen.getByTestId('petro-cond-shift')).toHaveValue('7.5');
  expect(screen.getByTestId('petro-cond-scale')).toHaveValue('1.1');
  expect(screen.getByTestId('petro-cond-norm-note')).toHaveTextContent('prefilled from the histogram fit (GR)');
});

test('negative control: on the reference well the fit is not offered, and the dialog names the well to open', () => {
  open('w-type');
  expect(screen.getByTestId('petro-cond-shift')).toHaveValue('0');
  expect(screen.getByTestId('petro-cond-scale')).toHaveValue('1');
  expect(screen.getByTestId('petro-cond-norm-note')).toHaveTextContent('maps OFFSET-2 onto this well; open OFFSET-2 to apply it');
});

test('the block depth shift is labelled in the session unit', () => {
  render(<ConditioningDialog open onOpenChange={() => {}} wellData={wellData('w-type')} projectId="p" backend={{}} onSaved={() => {}} onStatus={() => {}} lastNormFit={null} depthUnit="ft" />);
  fireEvent.change(screen.getByTestId('petro-cond-op'), { target: { value: 'depth-shift' } });
  expect(screen.getByText('Shift (ft)')).toBeInTheDocument();
});
