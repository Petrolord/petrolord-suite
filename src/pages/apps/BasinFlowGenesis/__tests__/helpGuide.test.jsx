// The Basin & Charge Modeling help guide renders every section, quotes the
// live presets and unit choices, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BasinFlowHelpGuide, { HELP_SECTIONS } from '../BasinFlowHelpGuide';
import { HeatFlowPresets } from '../data/HeatFlowPresets';
import { ErosionPresets } from '../data/ErosionPresets';

const renderGuide = () => render(<MemoryRouter><BasinFlowHelpGuide /></MemoryRouter>);

describe('BasinFlowHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Basin & Charge Modeling Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(13);
  });

  test('quotes the live presets and units', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const p of HeatFlowPresets) expect(text).toContain(p.name);
    for (const p of ErosionPresets) expect(text).toContain(p.name);
    expect(text).toMatch(/Auto-Fit/);
    expect(text).toMatch(/placeholders/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
