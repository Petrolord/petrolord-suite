/** The EPE help guide describes the 2026-10-14 video-round features. */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EpeHelpGuide from '../EpeHelpGuide';

beforeAll(() => {
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

test('the guide covers received files, valuation date, out-of-date runs and the readouts', () => {
  render(<MemoryRouter><EpeHelpGuide /></MemoryRouter>);
  for (const h of ['Files received from other apps', 'Variable opex', 'Valuation date and discounting convention',
    'When the IRR is missing or reads backwards', 'Runs that are out of date', 'The readout under the chart']) {
    expect(screen.getByText(h)).toBeInTheDocument();
  }
  expect(screen.getByText(/valued at 31 December of the valuation year/)).toBeInTheDocument();
  expect(screen.getByText(/Take the new estimate/)).toBeInTheDocument();
});
