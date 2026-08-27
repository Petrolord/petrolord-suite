// Render smoke tests for the Reservoir full-page help guides.
//
// The source-level guard in src/components/__tests__/reservoirHelpGuides.test.js
// pins copy and coverage. This one pins that the guides actually mount: it
// catches a primitive missing from HelpGuideLayout, a section listed in the
// contents rail with no matching GuideSection, and any runtime error in the
// body that a production build would not surface.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EorScreeningHelpGuide from '../EorScreeningHelpGuide';
import ForecastScenarioHubHelpGuide from '../ForecastScenarioHubHelpGuide';
import RiskedReservesHelpGuide from '../RiskedReservesHelpGuide';
import WellSpacingHelpGuide from '../WellSpacingHelpGuide';

const GUIDES = [
  {
    name: 'EOR Screening',
    Component: EorScreeningHelpGuide,
    heading: /EOR Screening Help Guide/i,
    sectionIds: ['overview', 'quickstart', 'inputs', 'methods', 'scoring', 'pitfalls', 'references'],
  },
  {
    name: 'Forecast Scenario Hub',
    Component: ForecastScenarioHubHelpGuide,
    heading: /Forecast Scenario Hub Help Guide/i,
    sectionIds: ['overview', 'quickstart', 'cases', 'engine', 'results', 'economics', 'handoff', 'saving', 'pitfalls'],
  },
  {
    name: 'Risked Reserves Valuation',
    Component: RiskedReservesHelpGuide,
    heading: /Risked Reserves Valuation Help Guide/i,
    sectionIds: ['overview', 'convention', 'quickstart', 'variables', 'settings', 'engine', 'results', 'sensitivity', 'pitfalls'],
  },
  {
    name: 'Well Spacing Optimizer',
    Component: WellSpacingHelpGuide,
    heading: /Well Spacing Optimizer Help Guide/i,
    sectionIds: ['overview', 'model', 'quickstart', 'inputs', 'engine', 'results', 'choosing', 'pitfalls'],
  },
];

const renderGuide = (Component) => render(
  <MemoryRouter>
    <Component />
  </MemoryRouter>,
);

describe.each(GUIDES)('$name help guide', ({ Component, heading, sectionIds }) => {
  test('renders its heading', () => {
    renderGuide(Component);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  test('every contents entry has a matching section anchor', () => {
    renderGuide(Component);
    for (const id of sectionIds) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('rendered copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide(Component);
    expect(container.textContent.includes('—')).toBe(false);
  });
});
