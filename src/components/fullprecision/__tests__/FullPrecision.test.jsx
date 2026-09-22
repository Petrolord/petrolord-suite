// W3 (D3): the shared Full precision switch. Off by default, product text
// unchanged when off, 6 decimals (money 4 in $MM) when on, no grouping.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FullPrecisionProvider, FullPrecisionToggle, FullPrecisionNote, useFullPrecision,
} from '../FullPrecision';
import {
  formatFull, formatMoneyMM, pickPrecision, sortedSampleCsv,
} from '@/lib/fullPrecision';

describe('formatFull', () => {
  test('six decimals by default, no digit grouping, no exponent', () => {
    expect(formatFull(1250.5424879929428)).toBe('1250.542488');
    expect(formatFull(35027.51189671851, 4)).toBe('35027.5119');
    expect(formatFull(12345678.9, 2)).toBe('12345678.90');
  });
  test('more decimals where a tolerance needs them', () => {
    expect(formatFull(0.9551900686419833, 9)).toBe('0.955190069');
    expect(formatFull(0.027758986529736098, 10)).toBe('0.0277589865');
  });
  test('never prints negative zero', () => {
    expect(formatFull(-0)).toBe('0.000000');
    expect(formatFull(-1e-9)).toBe('0.000000');
    expect(formatFull(-4e-7)).toBe('0.000000');
    expect(formatFull(-0.4, 0)).toBe('0');
    expect(formatFull(-43.22592817326132, 4)).toBe('-43.2259');
  });
  test('non-numbers print the placeholder', () => {
    [null, undefined, '', NaN, Infinity, -Infinity, 'abc', true].forEach((v) => expect(formatFull(v)).toBe('--'));
    expect(formatFull('2.5', 2)).toBe('2.50');
  });
});

describe('formatMoneyMM', () => {
  test('USD to $MM at 4 decimals', () => {
    expect(formatMoneyMM(344326000)).toBe('344.3260');
    expect(formatMoneyMM(-9458763.830643502)).toBe('-9.4588');
    expect(formatMoneyMM(20141999.999999996)).toBe('20.1420');
    expect(formatMoneyMM(null)).toBe('--');
  });
});

describe('pickPrecision', () => {
  test('returns the product text untouched when off', () => {
    expect(pickPrecision(false, '1,251', 1250.5424879929428)).toBe('1,251');
    expect(pickPrecision(true, '1,251', 1250.5424879929428)).toBe('1250.542488');
  });
});

describe('sortedSampleCsv', () => {
  test('ascending, ranked, full precision, non-finite dropped', () => {
    const csv = sortedSampleCsv([3.5, -1.25, NaN, 2], 'npv_musd', 4);
    expect(csv).toBe('rank,npv_musd\n1,-1.2500\n2,2.0000\n3,3.5000\n');
  });
  test('typed arrays are accepted', () => {
    expect(sortedSampleCsv(new Float64Array([2, 1]), 'x', 1)).toBe('rank,x\n1,1.0\n2,2.0\n');
  });
});

function Card() {
  const { show, showMM } = useFullPrecision();
  return (
    <div>
      <span data-testid="flow">{show('1,251', 1250.5424879929428)}</span>
      <span data-testid="emv">{showMM('$344 MM', 344326000)}</span>
    </div>
  );
}

describe('FullPrecisionToggle', () => {
  test('is off by default and the card prints its product text', () => {
    render(<FullPrecisionProvider><FullPrecisionToggle app="pump-station" /><Card /></FullPrecisionProvider>);
    const sw = screen.getByRole('switch', { name: 'Full precision' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('flow').textContent).toBe('1,251');
    expect(screen.getByTestId('emv').textContent).toBe('$344 MM');
    expect(screen.queryByTestId('full-precision-note')).toBeNull();
  });
  test('switching it on prints full precision; switching it off restores the product text', () => {
    render(<FullPrecisionProvider><FullPrecisionToggle app="pump-station" /><FullPrecisionNote /><Card /></FullPrecisionProvider>);
    const sw = screen.getByRole('switch', { name: 'Full precision' });
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('flow').textContent).toBe('1250.542488');
    expect(screen.getByTestId('emv').textContent).toBe('344.3260');
    expect(screen.getByTestId('full-precision-note')).toBeTruthy();
    fireEvent.click(sw);
    expect(screen.getByTestId('flow').textContent).toBe('1,251');
  });
  test('the label click toggles too, and the app marker is on the wrapper', () => {
    render(<FullPrecisionProvider><FullPrecisionToggle app="relief-studio" /><Card /></FullPrecisionProvider>);
    fireEvent.click(screen.getByText('Full precision'));
    expect(screen.getByTestId('flow').textContent).toBe('1250.542488');
    expect(screen.getByTestId('full-precision-toggle').getAttribute('data-full-precision-app')).toBe('relief-studio');
  });
  test('outside a provider the toggle renders nothing and panels stay off', () => {
    const { container } = render(<div><FullPrecisionToggle app="x" /><Card /></div>);
    expect(container.querySelector('[data-testid="full-precision-toggle"]')).toBeNull();
    expect(screen.getByTestId('flow').textContent).toBe('1,251');
  });
  test('a provider may start on (for tests and previews only)', () => {
    render(<FullPrecisionProvider initial><Card /></FullPrecisionProvider>);
    expect(screen.getByTestId('flow').textContent).toBe('1250.542488');
  });
});
