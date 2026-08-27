// D10 help-guide gates (the D7-D9 pattern): navigation completeness,
// honesty markers with golden numbers, and the owner copy rule.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellIntegrityPAHelpGuide from '../WellIntegrityPAHelpGuide';

const SECTION_IDS = [
  'overview', 'quickstart', 'barriers', 'annulus', 'plugs',
  'program', 'validation', 'pitfalls', 'glossary',
];

function renderGuide() {
  return render(
    <MemoryRouter>
      <WellIntegrityPAHelpGuide />
    </MemoryRouter>,
  );
}

test('renders the header and every navigation section', () => {
  renderGuide();
  expect(screen.getByText('Well Integrity & P&A Help Guide')).toBeTruthy();
  for (const id of SECTION_IDS) {
    expect(document.getElementById(`section-${id}`)).toBeTruthy();
  }
});

test('content stays honest about the model', () => {
  const { container } = renderGuide();
  const text = container.textContent;
  expect(text).toMatch(/not an operational procedure/i);
  expect(text).toMatch(/documents govern/i);
  expect(text).toMatch(/does not verify that your elements/i);
  expect(text).toMatch(/NORSOK D-010/);
  expect(text).toMatch(/API RP 90/);
  // Golden numbers quoted from the oracle: the 1820 m plugged-top hand
  // case and the 20.67 MPa MAASP hand fixture.
  expect(text).toMatch(/1820/);
  expect(text).toMatch(/20\.67/);
});

test('copy carries no em dashes (owner rule)', () => {
  const { container } = renderGuide();
  expect(container.textContent.includes('—')).toBe(false);
});
