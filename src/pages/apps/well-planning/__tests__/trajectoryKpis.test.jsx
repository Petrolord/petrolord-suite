/**
 * Bottom hole KPI (2026-10-13): the latitude and longitude carry their
 * hemispheres, so "4.7198, 8.1186" can no longer be read as a grid offset
 * or with the hemisphere guessed.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TrajectoryKPIs, { formatLatLon } from '../components/TrajectoryKPIs';

const SUMMARY = {
  totalMD: 6626, totalTVD: 6268, horizontalDisplacement: 1862, maxInclination: 22.4, maxDLS: 2.54,
};

describe('formatLatLon', () => {
  it('names the hemisphere of each value', () => {
    expect(formatLatLon(4.71984, 8.11861)).toBe('4.7198° N, 8.1186° E');
    expect(formatLatLon(-33.9249, 18.4241)).toBe('33.9249° S, 18.4241° E');
    expect(formatLatLon(29.7604, -95.3698)).toBe('29.7604° N, 95.3698° W');
    expect(formatLatLon(-22.9, -43.2, 2)).toBe('22.90° S, 43.20° W');
  });
  it('never prints a minus sign once the hemisphere says it', () => {
    expect(formatLatLon(-1.5, -2.5)).not.toMatch(/-/);
  });
  it('is null without two finite numbers', () => {
    expect(formatLatLon(NaN, 8)).toBeNull();
    expect(formatLatLon(4, undefined)).toBeNull();
    expect(formatLatLon(null, null)).toBeNull();
  });
});

describe('Bottom hole KPI', () => {
  it('shows the labelled position', () => {
    render(<TrajectoryKPIs summary={{ ...SUMMARY, bottomHole: { lat: 4.71984, lon: 8.11861 } }} depthUnit="ft" />);
    expect(screen.getByTestId('kpi-bottom-hole')).toHaveTextContent('4.7198° N, 8.1186° E');
    // negative control: the old bare pair is gone
    expect(screen.getByTestId('kpi-bottom-hole')).not.toHaveTextContent('4.7198, 8.1186');
  });
  it('keeps the Set well CRS state without a position', () => {
    render(<TrajectoryKPIs summary={{ ...SUMMARY, bottomHole: null }} depthUnit="ft" />);
    expect(screen.getByTestId('kpi-bottom-hole')).toHaveTextContent('Set well CRS');
  });
});
