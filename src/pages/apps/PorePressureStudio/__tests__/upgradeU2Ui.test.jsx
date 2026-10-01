/**
 * Pore Pressure Studio U2 in the workstation (jsdom): the doors and the
 * words. Geometry and the real browser are in e2e/pore-pressure-u2.spec.js.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

const mount = (opts = {}) => render(
  <MemoryRouter><PPWorkstation backend={makeInMemoryBackend(opts)} /></MemoryRouter>,
);
const ready = async () => {
  const row = await screen.findByTestId('pp-well-row', {}, { timeout: 15000 });
  fireEvent.click(row);
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
};
const setField = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });
const apply = () => fireEvent.click(screen.getByTestId('pp-apply-params'));

describe('U2-003 margins and casing seats in the workstation', () => {
  test('the seats line follows the margins typed in the dock (ppg)', async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByTestId('pp-unit-pressure'), { target: { value: 'ppg' } });
    await waitFor(() => expect(screen.getByTestId('pp-casing-seats')).toBeInTheDocument());
    expect(screen.getByTestId('pp-casing-seats')).toHaveTextContent(/trip margin 0.50 ppg, kick margin 0.50 ppg/);
    expect(screen.getByTestId('pp-param-trip')).toHaveValue(0.5);
    // the goldens' well needs no string at nu 0.4; at nu 0.25 it needs one
    expect(screen.getByTestId('pp-casing-seats')).toHaveAttribute('data-seats', '0');
    setField('pp-param-nu', '0.25');
    apply();
    await waitFor(() => expect(Number(screen.getByTestId('pp-casing-seats').getAttribute('data-seats'))).toBeGreaterThan(0));
    expect(screen.getByTestId('pp-casing-seat-0')).toHaveTextContent(/shoe at least/);
    expect(screen.getByTestId('pp-casing-sections')).toHaveTextContent(/margin to the design FG/);
    // margins that close the window are said
    setField('pp-param-trip', '3');
    setField('pp-param-kick', '3');
    apply();
    await waitFor(() => expect(screen.getByTestId('pp-casing-closed')).toBeInTheDocument());
    expect(screen.getByTestId('pp-prognosis-chart')).toBeInTheDocument();
  });
});

describe('U2-002 the calibration import door', () => {
  test('a pasted table is read, the missing units are asked for, then points are added and drawn', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('pp-cal-import-open'));
    fireEvent.change(screen.getByTestId('pp-cal-import-paste'), { target: { value: '1130\t13.382\tLOT\n2130\t14.363\tFIT\n' } });
    fireEvent.click(screen.getByTestId('pp-cal-import-read'));
    expect(screen.getByTestId('pp-cal-import-read-summary')).toHaveTextContent(/2 rows, 3 columns/);
    expect(screen.getByTestId('pp-cal-import-missing')).toHaveTextContent(/declare the depth reference/);
    expect(screen.getByTestId('pp-cal-import-add')).toBeDisabled();
    fireEvent.change(screen.getByTestId('pp-cal-depthref'), { target: { value: 'md' } });
    fireEvent.change(screen.getByTestId('pp-cal-depthunit'), { target: { value: 'm' } });
    fireEvent.change(screen.getByTestId('pp-cal-valueunit'), { target: { value: 'ppg' } });
    fireEvent.change(screen.getByTestId('pp-cal-kindcol'), { target: { value: '2' } });
    expect(screen.getByTestId('pp-cal-import-preview')).toHaveAttribute('data-read', '2');
    fireEvent.click(screen.getByTestId('pp-cal-import-add'));
    await waitFor(() => expect(screen.getByTestId('pp-cal-imported')).toHaveTextContent(/1 LOT, 1 FIT from pasted table/));
    expect(screen.getByTestId('pp-status')).toHaveTextContent(/Imported 2 calibration points/);
    expect(screen.getByTestId('pp-note-lot')).toHaveTextContent(/LOT\/FIT: 2 tests/);
    expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-lot', '2');
    // typed points and Apply keep the imported ones
    fireEvent.change(screen.getByTestId('pp-param-cal'), { target: { value: '3000, 33.3' } });
    apply();
    await waitFor(() => expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-cal', '1'));
    expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-lot', '2');
    fireEvent.click(screen.getByTestId('pp-cal-clear-imported'));
    await waitFor(() => expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-lot', '0'));
  });
});

describe('U2-004 the depth frame in the ribbon', () => {
  test('TVDSS: the readout takes and shows TVDSS; the same sample as below mudline', async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByTestId('pp-unit-depth'), { target: { value: 'm' } });
    fireEvent.change(screen.getByTestId('pp-unit-pressure'), { target: { value: 'MPa' } });
    fireEvent.change(screen.getByTestId('pp-readout-depth'), { target: { value: '3500' } });
    const atBml = screen.getByTestId('pp-readout-pp').textContent;
    fireEvent.change(screen.getByTestId('pp-depth-ref'), { target: { value: 'tvdss' } });
    await waitFor(() => expect(screen.getByTestId('pp-readout-ref')).toHaveTextContent('m TVDSS'));
    // the readout text moved into the frame: 3,500 m bml is 3,600 m TVDSS on 100 m of water
    expect(screen.getByTestId('pp-readout-depth')).toHaveValue('3600');
    expect(screen.getByTestId('pp-readout-pp').textContent).toBe(atBml);
    expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-ref', 'tvdss');
    // every frame is offered on this well (offshore, mudline MD set, MD on the log)
    const opts = Array.from(screen.getByTestId('pp-depth-ref').querySelectorAll('option'));
    expect(opts.filter((o) => o.disabled)).toHaveLength(0);
  });
});

describe('U2-005 the NCT view: shale picks, trend breaks', () => {
  test('Pick shales takes VSH shale points only; a break adds a segment fitted on its own picks', async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByTestId('pp-unit-depth'), { target: { value: 'm' } });
    fireEvent.click(screen.getByTestId('pp-view-nct'));
    await waitFor(() => expect(screen.getByTestId('pp-nct-chart')).toHaveAttribute('data-log', 'true'));
    expect(screen.getByTestId('pp-nct-shale')).toHaveTextContent(/Shale picks on VSH at or above/);
    fireEvent.change(screen.getByTestId('pp-shale-from'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('pp-shale-to'), { target: { value: '2390' } });
    fireEvent.change(screen.getByTestId('pp-shale-every'), { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('pp-auto-pick'));
    await waitFor(() => expect(screen.getByTestId('pp-nct-chart')).toHaveAttribute('data-picks', '11'));
    expect(screen.queryByTestId('pp-picks-in-sand')).toBeNull();
    // a hand pick in a sand bed is flagged
    fireEvent.change(screen.getByTestId('pp-pick-depth'), { target: { value: '620' } });
    fireEvent.click(screen.getByTestId('pp-add-pick'));
    await waitFor(() => expect(screen.getByTestId('pp-picks-in-sand')).toHaveTextContent('1 pick in sand'));
    fireEvent.change(screen.getByTestId('pp-break-depth'), { target: { value: '1500' } });
    fireEvent.click(screen.getByTestId('pp-add-break'));
    await waitFor(() => expect(screen.getByTestId('pp-break-0')).toHaveTextContent('1500 m'));
    expect(screen.getByTestId('pp-status')).toHaveTextContent(/fit the NCT again/);
    fireEvent.click(screen.getByTestId('pp-fit-nct'));
    await waitFor(() => expect(screen.getByTestId('pp-status')).toHaveTextContent(/NCT fitted: the base trend, the segment from 1500 m/));
    fireEvent.click(screen.getByTestId('pp-nct-logaxis'));
    expect(screen.getByTestId('pp-nct-chart')).toHaveAttribute('data-log', 'false');
  });
});

describe('U2-006 fit to calibration', () => {
  test('n typed off, points entered, the fit brings n back and says the misfit before and after', async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByTestId('pp-unit-depth'), { target: { value: 'm' } });
    fireEvent.change(screen.getByTestId('pp-unit-pressure'), { target: { value: 'MPa' } });
    await waitFor(() => expect(screen.getByTestId('pp-param-eatonn')).toHaveValue(3));
    setField('pp-param-eatonn', '2.2');
    setField('pp-param-cal', '2700, 29.08\n3000, 33.31\n3300, 37.54\n3700, 43.18');
    apply();
    await waitFor(() => expect(screen.getByTestId('pp-fit-calibration')).toHaveTextContent('Fit n to calibration (4 points)'));
    fireEvent.click(screen.getByTestId('pp-fit-calibration'));
    await waitFor(() => expect(screen.getByTestId('pp-status')).toHaveTextContent(/Fitted n 3\.0\d\d to 4 measured pressures/));
    await waitFor(() => expect(Number(screen.getByTestId('pp-param-eatonn').value)).toBeCloseTo(3, 1));
  });
});

describe('U2-008 the seismic datum and the layer cake read at the well', () => {
  test('the note says where and against which datum; a declared SRD moves the trend', async () => {
    mount({ layerCake: true });
    const row = await screen.findByTestId('pp-well-row', {}, { timeout: 15000 });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 30000 });
    fireEvent.change(screen.getByTestId('pp-unit-depth'), { target: { value: 'm' } });
    fireEvent.change(screen.getByTestId('pp-unit-pressure'), { target: { value: 'MPa' } });
    fireEvent.click(screen.getAllByTestId('pp-velocity-row')[1]);
    await waitFor(() => expect(screen.getByTestId('pp-note-seismic')).toHaveTextContent(/at the wellhead/), { timeout: 30000 });
    expect(screen.getByTestId('pp-note-seismic')).toHaveTextContent(/taken at sea level \(SRD 0 m\)/);
    fireEvent.change(screen.getByTestId('pp-readout-depth'), { target: { value: '2000' } });
    const before = screen.getByTestId('pp-readout-obg').textContent;
    setField('pp-param-srd', '50');
    apply();
    await waitFor(() => expect(screen.getByTestId('pp-note-seismic')).not.toHaveTextContent(/taken at sea level/));
    await waitFor(() => expect(screen.getByTestId('pp-readout-obg').textContent).not.toBe(before));
  });
});

describe('U2-007 and U2-012 in the workstation', () => {
  test('the crossplot sets Bowers unloading; the fracture method switches the dock field', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('pp-view-crossplot'));
    await waitFor(() => expect(screen.getByTestId('pp-xp-summary')).toHaveTextContent(/Loading trend V =/));
    fireEvent.click(screen.getByTestId('pp-xp-use'));
    await waitFor(() => expect(screen.getByTestId('pp-status')).toHaveTextContent(/Bowers unloading set from the crossplot: U 3, sigma max/));
    expect(screen.getByTestId('pp-param-bowersu')).toHaveValue(3);
    fireEvent.change(screen.getByTestId('pp-param-fracmethod'), { target: { value: 'matthews-kelly' } });
    expect(screen.getByTestId('pp-param-k0')).toHaveValue(0.75);
    expect(screen.queryByTestId('pp-param-nu')).toBeNull();
  });
});
