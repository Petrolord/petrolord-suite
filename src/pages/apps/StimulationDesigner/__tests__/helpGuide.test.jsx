// D9 help-guide gates (the D7/D8 pattern): navigation completeness,
// honesty markers with golden numbers, and the owner copy rule.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StimulationDesignerHelpGuide from '../StimulationDesignerHelpGuide';

const SECTION_IDS = [
  'overview', 'quickstart', 'design', 'schedule', 'productivity',
  'acidizing', 'validation', 'pitfalls', 'glossary',
];

function renderGuide() {
  return render(
    <MemoryRouter>
      <StimulationDesignerHelpGuide />
    </MemoryRouter>,
  );
}

test('renders the header and every navigation section', () => {
  renderGuide();
  expect(screen.getByText('Stimulation Designer Help Guide')).toBeTruthy();
  for (const id of SECTION_IDS) {
    expect(document.getElementById(`section-${id}`)).toBeTruthy();
  }
});

test('content stays honest about the model', () => {
  const { container } = renderGuide();
  const text = container.textContent;
  expect(text).toMatch(/not a pseudo-3D simulator/i);
  expect(text).toMatch(/vendor conductivity/i);
  expect(text).toMatch(/lab owns the chemistry/i);
  expect(text).toMatch(/Cinco-Ley/);
  // Golden numbers quoted from the oracle: the 6.39 mm PKN hand case,
  // f(1.6) = 1.384, and the ~29 t golden schedule.
  expect(text).toMatch(/6\.39/);
  expect(text).toMatch(/1\.384/);
  expect(text).toMatch(/29 tonnes/);
});

test('copy carries no em dashes (owner rule)', () => {
  const { container } = renderGuide();
  expect(container.textContent.includes('—')).toBe(false);
});
