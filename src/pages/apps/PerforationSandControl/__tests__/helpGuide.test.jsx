// D8 help-guide gates (the D7 pattern): navigation completeness, honesty
// markers with a golden number, and the owner copy rule.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PerforationSandControlHelpGuide from '../PerforationSandControlHelpGuide';

const SECTION_IDS = [
  'overview', 'quickstart', 'interval', 'perforating', 'sandcontrol',
  'sanding', 'validation', 'pitfalls', 'glossary',
];

function renderGuide() {
  return render(
    <MemoryRouter>
      <PerforationSandControlHelpGuide />
    </MemoryRouter>,
  );
}

test('renders the header and every navigation section', () => {
  renderGuide();
  expect(screen.getByText('Perforation & Sand Control Help Guide')).toBeTruthy();
  for (const id of SECTION_IDS) {
    expect(document.getElementById(`section-${id}`)).toBeTruthy();
  }
});

test('content stays honest about the model', () => {
  const { container } = renderGuide();
  const text = container.textContent;
  expect(text).toMatch(/nominal planning/i);
  expect(text).toMatch(/screening grade/i);
  expect(text).toMatch(/SPE 18247/);
  expect(text).toMatch(/deliberately a range/i);
  // Golden numbers quoted from the oracle: 20/40 gravel, 16 thou gauge.
  expect(text).toMatch(/20\/40/);
  expect(text).toMatch(/16 thou/);
});

test('copy carries no em dashes (owner rule)', () => {
  const { container } = renderGuide();
  expect(container.textContent.includes('—')).toBe(false);
});
