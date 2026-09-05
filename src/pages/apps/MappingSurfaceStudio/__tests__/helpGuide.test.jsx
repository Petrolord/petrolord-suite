// The in-app help guide renders every section, quotes the live export
// formats, arithmetic operations and skip reasons, and carries no em
// dashes (owner rule).
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MappingHelpGuide, { HELP_SECTIONS } from '../MappingHelpGuide';
import { EXPORT_FORMATS } from '../services/surfaceExport';
import { ARITH_OPS } from '../services/arithmetic';
import { CONTROL_POINT_SKIP_REASONS } from '../engine/surface';

const renderGuide = () => render(<MemoryRouter><MappingHelpGuide /></MemoryRouter>);

describe('MappingHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Mapping & Surface Studio Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(15);
  });

  test('quotes the live formats, operations and skip reasons', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const f of EXPORT_FORMATS) expect(text).toContain(f.label);
    for (const o of ARITH_OPS) expect(text).toContain(o.label);
    for (const v of Object.values(CONTROL_POINT_SKIP_REASONS)) expect(text).toContain(v);
  });

  test('content stays honest about the convention and the limits', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    expect(text).toMatch(/negative below the datum/i);
    expect(text).toMatch(/defaults to feet/i);
    expect(text).toMatch(/fewer than three control points/i);
    expect(text).toMatch(/layer-cake model is refused/i);
    expect(text).toMatch(/keeps its id/i);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
