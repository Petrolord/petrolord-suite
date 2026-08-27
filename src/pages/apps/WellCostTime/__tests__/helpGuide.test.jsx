// D11 help-guide gates (the D7-D10 pattern): navigation completeness,
// honesty markers with golden numbers, and the owner copy rule.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellCostTimeHelpGuide from '../WellCostTimeHelpGuide';

const SECTION_IDS = [
  'overview', 'quickstart', 'program', 'afe', 'risk',
  'benchmarks', 'validation', 'pitfalls', 'glossary',
];

function renderGuide() {
  return render(
    <MemoryRouter>
      <WellCostTimeHelpGuide />
    </MemoryRouter>,
  );
}

test('renders the header and every navigation section', () => {
  renderGuide();
  expect(screen.getByText('Well Cost & Time Help Guide')).toBeTruthy();
  for (const id of SECTION_IDS) {
    expect(document.getElementById(`section-${id}`)).toBeTruthy();
  }
});

test('content stays honest about the model', () => {
  const { container } = renderGuide();
  const text = container.textContent;
  expect(text).toMatch(/not a market quotation/i);
  expect(text).toMatch(/P10 is the LOW outcome/);
  expect(text).toMatch(/replaces the deterministic contingency/i);
  expect(text).toMatch(/order-of-magnitude planning prefill/i);
  expect(text).toMatch(/canonical Monte Carlo module/i);
  // Golden numbers quoted from the oracle: the 18.0-day hand well, the
  // 5,918,000 USD AFE and the 770 USD/m cost-per-depth hand case.
  expect(text).toMatch(/18\.0/);
  expect(text).toMatch(/5,918,000/);
  expect(text).toMatch(/770 USD\/m/);
});

test('copy carries no em dashes (owner rule)', () => {
  const { container } = renderGuide();
  expect(container.textContent.includes('—')).toBe(false);
});
