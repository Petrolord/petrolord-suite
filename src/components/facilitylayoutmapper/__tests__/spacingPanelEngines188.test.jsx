/**
 * FC1-0 (engines #188) render gates for the Layout Mapper spacing panel.
 *
 * `pass` is null when nothing was checked, which is not a pass; the panel
 * says so. Two rankings are named instead of one "worst", each violation
 * carries its shortfall fraction, and an incomplete check says why.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SpacingPanel from '../SpacingPanel';
import { DEFAULT_SPACING_INPUTS } from '@/utils/facilities/layoutSpacing';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const BASE_LAT = 4.8156;
const BASE_LON = 7.0498;
const layer = (id, iconName, dLatM, extra = {}) => ({
  id,
  type: 'icon',
  iconName,
  tag: `${iconName}-001`,
  latlng: { lat: BASE_LAT + dLatM / 111320, lng: BASE_LON },
  ...extra,
});
const NO_RADIATION = { ...DEFAULT_SPACING_INPUTS, flareEnabled: false, poolEnabled: false };

describe('nothing checked', () => {
  it('says so rather than reporting a pass', () => {
    // The table gives a valve and a PSV no required separation, so there is
    // nothing to check between them.
    render(<SpacingPanel layers={[layer('v', 'Valve', 0), layer('p', 'PSV', 2)]} inputs={NO_RADIATION} />);
    expect(screen.getByText('Nothing was checked: 1 pair on this layout has no required spacing in the table.'))
      .toBeInTheDocument();
    expect(screen.queryByText(/checks pass/)).not.toBeInTheDocument();
  });

  it('negative control: a pair with a requirement is checked and reported', () => {
    render(<SpacingPanel layers={[layer('a', 'Wellhead', 0), layer('b', 'Tank', 300)]} inputs={NO_RADIATION} />);
    expect(screen.getByText('All 1 checks pass.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was checked/)).not.toBeInTheDocument();
  });
});

describe('the two rankings and the shortfall fraction', () => {
  it('names both, and prints each shortfall as metres and percent', () => {
    const layers = [layer('a', 'Wellhead', 0), layer('b', 'Tank', 5), layer('c', 'Wellhead', 3)];
    render(<SpacingPanel layers={layers} inputs={NO_RADIATION} />);
    const rankings = screen.getByTestId('worst-rankings');
    expect(rankings).toHaveTextContent(/Largest shortfall: .* short [\d.]+ m of [\d.]+ m\./);
    expect(rankings).toHaveTextContent(/Largest shortfall against its own requirement: .* percent short\./);
    expect(screen.getAllByText(/percent\)/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('an incomplete check', () => {
  it('says what could not be judged', () => {
    const layers = [
      layer('a', 'Wellhead', 0),
      layer('b', 'Tank', 300),
      { id: 'u', type: 'icon', iconName: 'Separator', tag: 'Sep-9', latlng: null },
    ];
    render(<SpacingPanel layers={layers} inputs={NO_RADIATION} />);
    expect(screen.getByTestId('incomplete-reasons'))
      .toHaveTextContent('1 item with no position on the map could not be judged');
    expect(screen.getByText(/checks that ran pass, but the check is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/Not checked: 1 item with no position on the map/)).toBeInTheDocument();
  });

  it('negative control: a complete layout says nothing about incompleteness', () => {
    render(<SpacingPanel layers={[layer('a', 'Wellhead', 0), layer('b', 'Tank', 300)]} inputs={NO_RADIATION} />);
    expect(screen.queryByTestId('incomplete-reasons')).not.toBeInTheDocument();
  });
});
