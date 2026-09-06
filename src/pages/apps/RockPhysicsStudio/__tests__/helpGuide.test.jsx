// The Rock Physics Studio help guide renders every section, quotes the
// live curve aliases and unit choices, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RockPhysicsStudioHelpGuide, { HELP_SECTIONS } from '../RockPhysicsStudioHelpGuide';
import { CURVE_ALIASES } from '../services/prep';
import { VELOCITY_UNITS, DENSITY_UNITS } from '../services/units';

const renderGuide = () => render(<MemoryRouter><RockPhysicsStudioHelpGuide /></MemoryRouter>);

describe('RockPhysicsStudioHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Rock Physics Studio Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(11);
  });

  test('quotes the live curve aliases and unit choices', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const aliases of Object.values(CURVE_ALIASES)) expect(text).toContain(aliases.join(', '));
    for (const u of VELOCITY_UNITS) expect(text).toContain(u.label);
    for (const u of DENSITY_UNITS) expect(text).toContain(u.label);
    expect(text).toMatch(/VP_SUB/);
    expect(text).toMatch(/Vs estimated/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
