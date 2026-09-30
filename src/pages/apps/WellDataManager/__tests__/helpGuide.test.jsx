// WDM-U2-003: the Well Data Manager help guide renders every section,
// quotes the live QC flags and depth aliases (so it cannot drift from what
// the app computes), states the datum assumption, is linked from the
// ribbon, and carries no em dashes.
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellDataManagerHelpGuide, { HELP_SECTIONS, APP_PATH } from '../WellDataManagerHelpGuide';
import { QC_FLAGS } from '../engine/inventory';
import { CURVE_ALIASES } from '@/components/wells/curveMap';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const renderGuide = () => render(<MemoryRouter><WellDataManagerHelpGuide /></MemoryRouter>);

describe('WellDataManagerHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Well Data Manager Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
  });

  test('quotes the live QC flags, the depth aliases and the stated assumptions', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const f of QC_FLAGS) {
      expect(text).toContain(f.label);
      expect(text).toContain(f.why);
    }
    for (const a of CURVE_ALIASES.DEPT) expect(text).toContain(a);
    expect(text).toMatch(/assumed to be mean sea level/);
    expect(text).toMatch(/exactly\s+0\.3048 m/);
    expect(text).toContain('TVDSS = TVD - KB');
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });

  test('routed under the app and linked from the ribbon (live and harness)', () => {
    const root = path.join(__dirname, '..', '..', '..', '..');
    const app = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
    expect(app).toContain(`path="${APP_PATH.replace('/dashboard/', '')}/help"`);
    expect(app).toContain('path="/dev/well-data-manager/help"');
    const ws = fs.readFileSync(path.join(__dirname, '..', 'components', 'WellWorkstation.jsx'), 'utf8');
    expect(ws).toContain(`helpPath = '${APP_PATH}/help'`);
    expect(ws).toContain('data-testid="wdm-help"');
  });
});
