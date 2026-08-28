// Guards for the ReservoirCalc Pro documentation.
//
// The old docs carried five articles describing things that did not exist (a
// Petrolord.ReservoirCalc JS API, video tutorials, sample projects with dead
// Load buttons, a stale changelog and a support form with no submit path) plus
// a keyboard-shortcut article listing four shortcuts none of which were wired.
// These tests pin the replacement: every registered article renders, the copy
// rule holds on rendered output, and the retired fictions cannot return.

import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import GettingStartedGuide from '../GettingStartedGuide';
import UIGuide from '../UIGuide';
import InputMethodsGuide from '../InputMethodsGuide';
import ProjectsGuide from '../ProjectsGuide';
import MultiReservoirGuide from '../MultiReservoirGuide';
import SurfaceImportGuide from '../SurfaceImportGuide';
import FluidPropertiesGuide from '../FluidPropertiesGuide';
import UnitsGuide from '../UnitsGuide';
import SettingsGriddingGuide from '../SettingsGriddingGuide';
import CalculationReference from '../CalculationReference';
import ContactVolumetricsGuide from '../ContactVolumetricsGuide';
import ProbabilisticGuide from '../ProbabilisticGuide';
import SensitivityGuide from '../SensitivityGuide';
import MapGenerationGuide from '../MapGenerationGuide';
import SurfacePaintingGuide from '../SurfacePaintingGuide';
import PolygonGuide from '../PolygonGuide';
import ProspectRiskingGuide from '../ProspectRiskingGuide';
import ReportsGuide from '../ReportsGuide';
import AuditTrailGuide from '../AuditTrailGuide';
import CollaborationGuide from '../CollaborationGuide';
import TroubleshootingGuide from '../TroubleshootingGuide';
import BestPracticesGuide from '../BestPracticesGuide';
import Glossary from '../Glossary';

const ARTICLES = [
  ['GettingStartedGuide', GettingStartedGuide],
  ['UIGuide', UIGuide],
  ['InputMethodsGuide', InputMethodsGuide],
  ['ProjectsGuide', ProjectsGuide],
  ['MultiReservoirGuide', MultiReservoirGuide],
  ['SurfaceImportGuide', SurfaceImportGuide],
  ['FluidPropertiesGuide', FluidPropertiesGuide],
  ['UnitsGuide', UnitsGuide],
  ['SettingsGriddingGuide', SettingsGriddingGuide],
  ['CalculationReference', CalculationReference],
  ['ContactVolumetricsGuide', ContactVolumetricsGuide],
  ['ProbabilisticGuide', ProbabilisticGuide],
  ['SensitivityGuide', SensitivityGuide],
  ['MapGenerationGuide', MapGenerationGuide],
  ['SurfacePaintingGuide', SurfacePaintingGuide],
  ['PolygonGuide', PolygonGuide],
  ['ProspectRiskingGuide', ProspectRiskingGuide],
  ['ReportsGuide', ReportsGuide],
  ['AuditTrailGuide', AuditTrailGuide],
  ['CollaborationGuide', CollaborationGuide],
  ['TroubleshootingGuide', TroubleshootingGuide],
  ['BestPracticesGuide', BestPracticesGuide],
  ['Glossary', Glossary],
];

const DOCS_DIR = path.resolve(__dirname, '..');

// Files that existed only to describe features that were never built.
const RETIRED_ARTICLES = [
  'APIDocumentation.jsx',
  'VideoTutorials.jsx',
  'SampleProjects.jsx',
  'ReleaseNotes.jsx',
  'FeedbackSupport.jsx',
  'KeyboardShortcutsGuide.jsx',
  'IntegrationGuide.jsx',
];

// Claims that were in the old docs and were untrue of the app.
const RETIRED_CLAIMS = [
  /Petrolord\.ReservoirCalc/,
  /13 distinct property maps/i,
  /Circle by center/i,
  /Integration Hub/i,
  /Ctrl\+Enter/,
  /Zoom to Extents/i,
];

describe('ReservoirCalc Pro documentation', () => {
  test.each(ARTICLES)('%s renders with a heading', (_name, Component) => {
    render(<Component />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  test.each(ARTICLES)('%s rendered copy carries no em dashes (owner rule)', (_name, Component) => {
    const { container } = render(<Component />);
    expect(container.textContent.includes('—')).toBe(false);
  });

  test('the fabricated articles are gone', () => {
    for (const file of RETIRED_ARTICLES) {
      expect(fs.existsSync(path.join(DOCS_DIR, file))).toBe(false);
    }
  });

  test('no article reintroduces a retired claim', () => {
    const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.jsx'));
    for (const file of files) {
      const source = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
      for (const claim of RETIRED_CLAIMS) {
        // The hub's own guard list is allowed to name them.
        if (file === '__tests__') continue;
        expect(source).not.toMatch(claim);
      }
    }
  });

  test('every article is registered in the hub', () => {
    const hub = fs.readFileSync(path.join(DOCS_DIR, 'DocumentationHub.jsx'), 'utf8');
    for (const [name] of ARTICLES) {
      expect(hub).toContain(`from './${name}'`);
    }
  });
});
