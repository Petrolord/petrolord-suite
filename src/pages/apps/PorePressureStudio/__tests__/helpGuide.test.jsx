// The Pore Pressure Studio help guide renders every section, quotes the
// live unit choices and the datum rule, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PorePressureStudioHelpGuide, { HELP_SECTIONS } from '../PorePressureStudioHelpGuide';
import { PRESSURE_UNITS } from '../services/units';

const renderGuide = () => render(<MemoryRouter><PorePressureStudioHelpGuide /></MemoryRouter>);

describe('PorePressureStudioHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Pore Pressure Studio Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(11);
  });

  test('quotes the live unit choices and the EMW datum rule', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const u of PRESSURE_UNITS) expect(text).toContain(u.label);
    expect(text).toMatch(/rotary table when the dock's mudline MD is set/);
    expect(text).toMatch(/0\.052/);
    expect(text).toMatch(/PP, FP and OBG/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
