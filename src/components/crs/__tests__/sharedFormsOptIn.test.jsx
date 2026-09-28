/**
 * Design system pilot 4 (Seismolord): the shared import forms that open
 * inside Seismolord (CRS picker and badge, Project CRS dialog, culture
 * import, well import with its column mapper, the Open in menu) follow the
 * theme inside an opted-in scope. Every other app that uses them must see
 * no change: the snapshots below were recorded on main (7ac8b8213) before
 * the pilot touched these files. Inside a scope no dark console colour is
 * left.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/crs/settingsService', () => ({
  getProjectCrs: jest.fn().mockResolvedValue({ tag: 'EPSG:32631', name: 'WGS 84 / UTM zone 31N' }),
  setProjectCrs: jest.fn(),
  countCrsTaggedData: jest.fn().mockResolvedValue({ total: 0 }),
  addCustomDef: jest.fn(),
  getDepthUnit: jest.fn().mockResolvedValue('m'),
}));
jest.mock('@/lib/crs/reprojectProject', () => ({ reprojectProjectData: jest.fn() }));
jest.mock('@/lib/cultureRegistry', () => ({ saveCulture: jest.fn() }));

/* eslint-disable import/first */
import { ThemedApp } from '@/design/ThemeProvider';
import CrsBadge from '@/components/crs/CrsBadge';
import CrsPicker from '@/components/crs/CrsPicker';
import ProjectCrsDialog from '@/components/crs/ProjectCrsDialog';
import CultureImportDialog from '@/components/culture/CultureImportDialog';
import WellImport from '@/components/wells/WellImport';
import { OpenInAppMenu } from '@/components/wells/OpenInAppMenu';
/* eslint-enable import/first */

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

// Radix and React generate ids per mount; they are not class strings.
const stable = (html) => html
  .replace(/radix-:r[0-9a-z]+:/g, 'radix-ID')
  .replace(/:r[0-9a-z]+:/g, ':ID:');

const LEGACY_CONSOLE = /\b(bg|text|border)-(slate|cyan|lime|emerald|amber|red|sky)-\d{2,3}\b|\btext-white\b/;

const forms = () => (
  <>
    <CrsBadge tag="UNKNOWN" />
    <CrsBadge tag="LOCAL" />
    <CrsBadge tag="EPSG:32631" name="WGS 84 / UTM zone 31N" />
    <div data-testid="picker"><CrsPicker value="EPSG:32631" onChange={() => {}} /></div>
    <OpenInAppMenu wellIds={['w1']} />
    <WellImport onSave={() => {}} />
  </>
);

const renderAll = async (wrap = (x) => x) => {
  let view;
  await act(async () => {
    view = render(<MemoryRouter>{wrap(forms())}</MemoryRouter>);
  });
  // open the CRS picker's dropdown so its list is in the markup too
  await act(async () => {
    fireEvent.click(screen.getByTestId('picker').querySelector('button'));
  });
  return view;
};

const renderDialogs = async (wrap = (x) => x) => {
  await act(async () => {
    render(
      <MemoryRouter>
        {wrap(
          <>
            <ProjectCrsDialog open onOpenChange={() => {}} />
            <CultureImportDialog open onOpenChange={() => {}} />
          </>,
        )}
      </MemoryRouter>,
    );
  });
  return document.body;
};

describe('outside a scope the shared import forms render exactly as on main', () => {
  test('badge, picker (open), Open in menu and the well import form', async () => {
    const { container } = await renderAll();
    expect(stable(container.innerHTML)).toMatchSnapshot();
    expect(container.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
  });

  test('Project CRS and culture import dialogs', async () => {
    const body = await renderDialogs();
    expect(stable(body.innerHTML)).toMatchSnapshot();
    expect(body.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
  });
});

describe('inside a scope they follow the theme', () => {
  test('no dark console colours are left in the forms', async () => {
    const { container } = await renderAll((x) => <ThemedApp userId="t1">{x}</ThemedApp>);
    expect(container.innerHTML).toMatch(/text-pl-/);
    expect(container.innerHTML).not.toMatch(LEGACY_CONSOLE);
  });

  test('no dark console colours are left in the dialogs', async () => {
    const body = await renderDialogs((x) => <ThemedApp userId="t1">{x}</ThemedApp>);
    const dialogs = [...body.querySelectorAll('[role="dialog"]')];
    expect(dialogs.length).toBe(2);
    for (const d of dialogs) {
      expect(d).toHaveAttribute('data-pl-theme', 'light');
      expect(d.innerHTML).not.toMatch(LEGACY_CONSOLE);
    }
  });
});
