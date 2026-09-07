// Tester fix 2026-09-07 (Petrophysics Studio): the track range boxes must
// accept a negative sign and decimals the way people type them. The old
// controlled input parsed every keystroke and discarded "-" and "2.".

import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import LayoutPanel from '../LayoutPanel';
import { buildDefaultLayouts, activeTemplate } from '../layout/layoutSchema';

function Host({ onChange }) {
  const [layouts, setLayouts] = useState(() => buildDefaultLayouts());
  return (
    <LayoutPanel layouts={layouts} onLayoutsChange={(next) => { setLayouts(next); onChange(next); }} onStatus={() => {}} />
  );
}

const firstCurveTrack = (layouts) => activeTemplate(layouts).tracks.find((t) => t.type !== 'strip');

describe('LayoutPanel numeric boxes', () => {
  test('a negative decimal range can be typed digit by digit', () => {
    const seen = [];
    render(<Host onChange={(l) => seen.push(l)} />);
    const track = firstCurveTrack(buildDefaultLayouts());
    fireEvent.click(screen.getByTestId(`petro-layout-expand-${track.title}`));
    const min = screen.getByTestId('petro-layout-track-min');
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: '-' } });
    // the sign stays on screen and nothing is committed yet
    expect(min).toHaveValue('-');
    expect(seen).toHaveLength(0);
    fireEvent.change(min, { target: { value: '-0' } });
    fireEvent.change(min, { target: { value: '-0.' } });
    expect(min).toHaveValue('-0.');
    fireEvent.change(min, { target: { value: '-0.5' } });
    expect(min).toHaveValue('-0.5');
    const last = seen[seen.length - 1];
    expect(firstCurveTrack(last).min).toBe(-0.5);
  });

  test('a trailing decimal point survives until the next digit, and the box resyncs on blur', () => {
    const seen = [];
    render(<Host onChange={(l) => seen.push(l)} />);
    const track = firstCurveTrack(buildDefaultLayouts());
    fireEvent.click(screen.getByTestId(`petro-layout-expand-${track.title}`));
    const max = screen.getByTestId('petro-layout-track-max');
    fireEvent.focus(max);
    fireEvent.change(max, { target: { value: '2.' } });
    expect(max).toHaveValue('2.');
    expect(firstCurveTrack(seen[seen.length - 1]).max).toBe(2);
    fireEvent.change(max, { target: { value: '2.75' } });
    expect(firstCurveTrack(seen[seen.length - 1]).max).toBe(2.75);
    fireEvent.change(max, { target: { value: 'abc' } });
    expect(max).toHaveValue('abc');
    expect(firstCurveTrack(seen[seen.length - 1]).max).toBe(2.75);
    fireEvent.blur(max);
    expect(max).toHaveValue('2.75');
  });

  test('a curve override can be cleared back to the track range', () => {
    const seen = [];
    render(<Host onChange={(l) => seen.push(l)} />);
    const track = firstCurveTrack(buildDefaultLayouts());
    fireEvent.click(screen.getByTestId(`petro-layout-expand-${track.title}`));
    const cmin = screen.getByTestId('petro-layout-curve-min-0');
    fireEvent.focus(cmin);
    fireEvent.change(cmin, { target: { value: '-15' } });
    expect(firstCurveTrack(seen[seen.length - 1]).curves[0].min).toBe(-15);
    fireEvent.change(cmin, { target: { value: '' } });
    expect(firstCurveTrack(seen[seen.length - 1]).curves[0].min).toBeUndefined();
  });
});
