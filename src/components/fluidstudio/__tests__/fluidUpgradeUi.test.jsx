/**
 * Fluid Systems Studio upgrade, the page in jsdom (FLUID-U1): the unit
 * switch converts every door and card and leaves the stored state alone,
 * the sample is labelled as a sample until it is edited, the Report tab is
 * the door to the PDF, the P-T door reads back what it read, and the
 * handoff says whether the receiving app can find the fluid again. The
 * real browser walk is e2e/fluid-systems-upgrade.spec.js.
 */
import React from 'react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import FluidSystemsStudio from '@/pages/apps/FluidSystemsStudio';
import { StaticUnitProfileProvider } from '@/lib/units';
import { makeProfile } from '@/lib/units/presets';

const renderApp = (wrap = (x) => x) => render(wrap(<MemoryRouter><FluidSystemsStudio /></MemoryRouter>));
const kpi = (title) => screen.getByText(title, { selector: 'h3, div, p' }).closest('.rounded-lg, [class*="rounded"]');
const resultTab = (name) => { const all = screen.getAllByRole('tab', { name }); return all[all.length - 1]; };
const open = (tab) => { fireEvent.mouseDown(tab); fireEvent.click(tab); };

describe('Fluid Systems Studio upgrade: the page', () => {
  beforeAll(installDomShims);

  it('opens in oilfield units with no provider, labelled as the sample fluid', () => {
    renderApp();
    expect(screen.getByTestId('fluid-sample-banner')).toHaveTextContent('Sample fluid: these are example values');
    expect(screen.getByTestId('unit-api')).toHaveTextContent('degAPI');
    expect(screen.getByTestId('unit-temp')).toHaveTextContent('degF');
    expect(screen.getByTestId('unit-pb')).toHaveTextContent('psia');
    expect(document.getElementById('temp').value).toBe('200');
    expect(within(kpi('Bubble Point')).getByText('2998')).toBeInTheDocument();
    expect(within(kpi('Bubble Point')).getByText('psia')).toBeInTheDocument();
    // five property plots, Bg among them, each fed by the report's series
    for (const id of ['bo', 'rs', 'muo', 'z', 'bg']) expect(screen.getByTestId(`pvt-chart-${id}`)).toHaveAttribute('data-points', '41');
  });

  it('a new workspace follows the Suite unit profile; the stored value does not move', () => {
    renderApp((x) => <StaticUnitProfileProvider layers={{ user: makeProfile('metric'), organization: null, legacyDepthUnit: null }}>{x}</StaticUnitProfileProvider>);
    expect(screen.getByTestId('unit-temp')).toHaveTextContent('degC');
    expect(screen.getByTestId('unit-pb')).toHaveTextContent('kPa (abs)');
    expect(document.getElementById('temp').value).toBe('93.33333');
    expect(within(kpi('Bubble Point')).getByText('20670')).toBeInTheDocument();
    expect(within(kpi('Solution GOR')).getByText('115.8')).toBeInTheDocument();
    // typing 100 degC stores 212 degF: the KPI moves as the engine would for 212
    fireEvent.change(document.getElementById('temp'), { target: { value: '100' } });
    expect(document.getElementById('temp').value).toBe('100');
    expect(within(kpi('Bubble Point')).queryByText('20670')).not.toBeInTheDocument();
  });

  it('editing an input removes the sample label from that input only', () => {
    renderApp();
    open(resultTab('Report'));
    expect(screen.getByTestId('fluid-sample-note')).toHaveTextContent('7 input groups still hold the sample fluid values');
    expect(within(screen.getByTestId('fluid-report-inputs')).getAllByText(/Assumed\. Sample fluid value, not field data/).length).toBeGreaterThan(5);
    fireEvent.change(document.getElementById('api'), { target: { value: '35' } });
    expect(screen.getByTestId('fluid-sample-note')).toHaveTextContent('6 input groups still hold');
    const row = within(screen.getByTestId('fluid-report-inputs')).getByText('API gravity of the stock-tank oil').closest('tr');
    expect(row).toHaveTextContent('35.0');
    expect(row).toHaveTextContent('Entered, source not stated');
  });

  it('the Report tab takes the identification and the sources, and prints them in its own header and inputs table', () => {
    renderApp();
    open(resultTab('Report'));
    fireEvent.change(document.getElementById('id-field'), { target: { value: 'Ekene' } });
    fireEvent.change(document.getElementById('id-analyst'), { target: { value: 'A. Analyst' } });
    const header = screen.getByTestId('fluid-report-header');
    expect(header).toHaveTextContent('FieldEkene');
    expect(header).toHaveTextContent('AnalystA. Analyst');
    expect(header).toHaveTextContent('Licence or blockn/a');
    expect(header).toHaveTextContent('ProjectUnsaved workspace');
    // a source typed for the API gravity lands on its row
    fireEvent.change(within(screen.getByTestId('source-api')).getByLabelText('API gravity note'), { target: { value: 'Report RFL-1' } });
    const row = within(screen.getByTestId('fluid-report-inputs')).getByText('API gravity of the stock-tank oil').closest('tr');
    expect(row).toHaveTextContent('Report RFL-1');
    expect(screen.getByTestId('fluid-export-pdf')).toBeEnabled();
    // the plots the PDF will carry are listed, with the reason for each that does not apply
    const figs = screen.getByTestId('fluid-report-figures');
    expect(figs).toHaveTextContent('Oil formation volume factor Bo against pressurePlotted');
    expect(figs).toHaveTextContent('Does not apply: a phase envelope needs a composition');
    // the contract block is shown
    expect(screen.getByTestId('fluid-report-contract')).toHaveTextContent('PVT contractpvt-1');
  });

  it('the P-T door reads a hostile file back: units from the header, rows not read listed', () => {
    renderApp();
    open(screen.getAllByRole('tab', { name: 'Flow Assurance' })[0]);
    const box = document.getElementById('pt-profile');
    const hostile = fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/fluid-systems/hostile/tabs-header-bar-degC.txt'), 'utf8');
    fireEvent.change(box, { target: { value: hostile } });
    expect(screen.getByTestId('pt-readback')).toHaveTextContent('6 points read. Pressure in bar (abs) (read from the header); temperature in degC (read from the header).');
    fireEvent.change(box, { target: { value: fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/fluid-systems/hostile/hostile-mixed.txt'), 'utf8') } });
    const back = screen.getByTestId('pt-readback');
    expect(back).toHaveTextContent('3 points read, 5 lines not read.');
    expect(back).toHaveTextContent('Line 6 not read: 4 fields where 2 were expected');
    expect(back).toHaveTextContent('Line 3 not read: Not two numbers ("3000 psia, 180")');
  });

  it('the handoff says the fluid is not a saved project, so a refresh would lose it', () => {
    renderApp();
    expect(screen.getByTestId('fluid-handoff-note')).toHaveTextContent('This fluid is not saved as a project yet.');
    expect(screen.getByRole('button', { name: /Send to Well Test Analysis Studio/ })).toBeEnabled();
  });

  it('compositional mode: the cards and the report switch to the equation of state, and say which stream the KPI row is', async () => {
    renderApp();
    const select = screen.getAllByRole('combobox').find((el) => /Black oil correlations/.test(el.textContent));
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: /Compositional PR78 EOS/ }));
    await waitFor(() => expect(screen.getByTestId('fluid-kpi-basis')).toHaveTextContent('the report and the handoffs use the compositional table'));
    open(resultTab('Report'));
    expect(screen.getByTestId('fluid-report-header')).toHaveTextContent('PVT, equation of state (PR78)');
    expect(screen.getByTestId('fluid-report-tuning')).toHaveTextContent('No lab tuning. The C7+ fraction uses generalised correlations');
    expect(screen.getByTestId('fluid-report-figures')).toHaveTextContent('Not plotted: the envelope has not been traced in this session.');
  });
});

describe('RL11 static guard: every PVT intake has a sender', () => {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = walk(path.join(process.cwd(), 'src')).map((f) => [path.relative(process.cwd(), f), fs.readFileSync(f, 'utf8')]);

  it('the router-state handoff and the project id in the URL are each written by Fluid Systems Studio and read elsewhere', () => {
    const readers = files.filter(([, s]) => /location\.state\?\.fluidStudioData/.test(s)).map(([f]) => f).sort();
    const writers = files.filter(([, s]) => /state:\s*\{\s*fluidStudioData/.test(s)).map(([f]) => f);
    expect(readers).toEqual(['src/pages/apps/PipelineLineSizingStudio.jsx', 'src/pages/apps/WellTestAnalysisStudio.jsx']);
    expect(writers).toEqual(['src/components/fluidstudio/FluidStudioResults.jsx']);
    const idReaders = files.filter(([f, s]) => /searchParams\.get\(PVT_PROJECT_PARAM\)/.test(s)).map(([f]) => f);
    const idWriters = files.filter(([, s]) => /\$\{PVT_PROJECT_PARAM\}=/.test(s)).map(([f]) => f);
    // SCAL Studio reads the id too (SCAL-U2-005: its gravities door, which also lists the saved Fluid projects)
    // and Waterflood Design Studio (WF-U1: its PVT intake panel, sent to with "Send to Waterflood Design Studio")
    expect(idReaders.sort()).toEqual(['src/components/scalstudio/FluidGravitiesIntake.jsx', 'src/components/waterflooddesign/PvtIntakePanel.jsx', 'src/pages/apps/WellTestAnalysisStudio.jsx']);
    expect(idWriters).toEqual(['src/components/fluidstudio/FluidStudioResults.jsx']);
    // every reader of the saved block goes through the one reader module
    const blockReaders = files.filter(([f, s]) => /readFluidProjectPvt\(/.test(s) && f !== 'src/lib/pvtSource.js').map(([f]) => f);
    expect(blockReaders).toEqual(['src/pages/apps/WellTestAnalysisStudio.jsx']);
  });
});
