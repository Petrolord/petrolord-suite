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
    expect(HELP_SECTIONS.length).toBe(12);
  });

  test('quotes the live unit choices and the EMW datum rule', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const u of PRESSURE_UNITS) expect(text).toContain(u.label);
    expect(text).toMatch(/rotary table when the dock's mudline MD is set/);
    expect(text).toMatch(/0\.052/);
    expect(text).toMatch(/PP, FP and OBG/);
    // U2-003
    expect(text).toMatch(/trip margin is added to the pore pressure/);
    // U2-001
    expect(text).toMatch(/1.2 for resistivity/);
    // U2-004
    expect(text).toMatch(/TVD below the rotary table, TVDSS or\s+MD below the rotary table/);
    // U2-005
    expect(text).toMatch(/Pick shales takes one shale point per interval/);
    // U2-011
    expect(text).toMatch(/the prognosis plot \(the curves/);
    // U2-006
    expect(text).toMatch(/Fit n to calibration \(Eaton sonic or resistivity\)/);
    // U2-008
    expect(text).toMatch(/A layer cake is read along the hole/);
    // U2-012
    expect(text).toMatch(/Calibrate FG to LOT sets the method's coefficient/);
    // U2-007
    expect(text).toMatch(/The Crossplot view plots velocity against the logged density/);
    // U2-002
    expect(text).toMatch(/declare the depth column and reference/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
