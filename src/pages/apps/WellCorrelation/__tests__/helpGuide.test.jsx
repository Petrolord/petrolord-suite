// The Well Correlation help guide renders every section, quotes the live
// depth references and section parameters, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CorrelationHelpGuide, { HELP_SECTIONS } from '../CorrelationHelpGuide';
import { DEPTH_REF_LABEL } from '../engine/sectionFrame';
import { CORR_PARAMS } from '../components/CorrelationWorkstation';

const renderGuide = () => render(<MemoryRouter><CorrelationHelpGuide /></MemoryRouter>);

describe('CorrelationHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Well Correlation Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(13);
  });

  test('quotes the live depth references and section parameters', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const label of Object.values(DEPTH_REF_LABEL)) expect(text).toContain(label);
    expect(text).toContain(String(CORR_PARAMS.grClean));
    expect(text).toContain(String(CORR_PARAMS.cutSw));
    expect(text).toMatch(/no automatic correlation/i);
    expect(text).toMatch(/falls back to MD/i);
  });

  // AppUpgrade WC-U1-014: the datum section described modes the app does not
  // have ("Datum mode none", "A depth datum") and missed Stretch; the quick
  // start said Raw quicklook draws every mnemonic
  test('names the datum modes and controls the dock really has', async () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const s of ['Structural (true depth)', 'Flatten on top', 'Stretch between two tops', 'Track layout', 'Report header', 'no KB: TVDSS = TVD', 'no survey: vertical', 'unsaved changes']) {
      expect(text).toContain(s);
    }
    expect(text).not.toMatch(/Datum mode none|A depth datum|Track details|draws every mnemonic/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
