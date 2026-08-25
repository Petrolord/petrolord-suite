// WD6 follow-on: the in-app help guide renders every section with its
// navigation entry, and the content stays honest about the shipped
// feature set (spot markers per chapter).

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellDesignHelpGuide from '../WellDesignHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <WellDesignHelpGuide />
  </MemoryRouter>,
);

describe('WellDesignHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Well Design Studio Help Guide')).toBeInTheDocument();
    for (const title of [
      'What is the Studio?', 'Quick Start (10 min)', 'Sites, wellbores, designs',
      'Designing the trajectory', 'Design methods (solvers)', 'Targets',
      'Charts, table and 3D', 'North references and magnetics', 'Actual surveys',
      'Uncertainty (EOU)', 'Anti-collision', 'Publish and integrations',
      'Exports and reports', 'Validation basis', 'Pitfalls & FAQ', 'Glossary',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(title.replace(/[()?&]/g, '.')) }))
        .toBeInTheDocument();
    }
    // every section anchor exists for the scroll navigation
    for (const id of [
      'overview', 'quickstart', 'workspace', 'design', 'solvers', 'targets',
      'views', 'north', 'surveys', 'uncertainty', 'anticollision', 'publish',
      'reports', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content matches the shipped feature set', () => {
    renderGuide();
    expect(screen.getAllByText(/Build and hold \(J\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ISCWSA MWD Revision 4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SPE 187073/).length).toBeGreaterThan(0);
    expect(screen.getByText(/WMM2025, computed in-app/)).toBeInTheDocument();
    expect(screen.getAllByText(/Traveling cylinder/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deeper run wins from its tie-on down/).length).toBeGreaterThan(0);
    expect(screen.getByText(/TVD 1653\.99 ft, ND 954\.93 ft/)).toBeInTheDocument();
    // back link points at the app
    expect(screen.getByRole('link', { name: /Back to Well Design Studio/ }))
      .toHaveAttribute('href', '/dashboard/apps/drilling/well-planning');
  });

  test('honest about remaining armed literature gates', () => {
    renderGuide();
    expect(screen.getByText(/Mitchell and Miska survey table and the\s+Amoco MD-TVD table/)).toBeInTheDocument();
  });
});
