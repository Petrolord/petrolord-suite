/**
 * Basin & Charge Modeling: typing a decimal into a converted box. Each box
 * below showed the stored SI value converted and rounded back on every key,
 * so the decimal point vanished ("2." showed as "2" and "13.7" ft was stored
 * as 137 ft), and a cleared box stored NaN into the model. The boxes keep
 * the typed text now (shared useDraftInput hook) and a cleared box stores
 * nothing: the last value is kept and the box names the field it refuses.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installDomShims } from '@/design/testing/themeAssertions';
import CalibrationPointsEditor from '../components/expert/CalibrationPointsEditor';
import ErosionEventsEditor from '../components/history/ErosionEventsEditor';
import ErosionStep from '../components/guided/ErosionStep';
import GlobalHistoryPanel from '../components/GlobalHistoryPanel';
import StratigraphyInputStep from '../components/guided/StratigraphyInputStep';
import { M_PER_FT } from '../services/units';

// The two contexts, as plain React state the test owns
const mockStore = { basin: null, guided: null };
jest.mock('../contexts/BasinFlowContext', () => ({ useBasinFlow: () => mockStore.basin }));
jest.mock('../contexts/GuidedModeContext', () => ({ useGuidedMode: () => mockStore.guided }));
jest.mock('react-beautiful-dnd', () => ({
  Droppable: ({ children }) => children({ droppableProps: {}, innerRef: () => {}, placeholder: null }, {}),
  Draggable: ({ children }) => children({ draggableProps: {}, dragHandleProps: {}, innerRef: () => {} }, {}),
}));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const ft = (v) => v * M_PER_FT;
const fToC = (v) => (v - 32) / 1.8;
let latest; // the last stored state, read after typing

// ---- hosts -----------------------------------------------------------------

function CalibrationHost() {
  const [cal, setCal] = useState({ ro: [{ id: 1, depth: 2000, value: 0.6 }], temp: [{ id: 2, depth: 2000, value: 80 }] });
  latest = cal;
  return <CalibrationPointsEditor ro={cal.ro} temp={cal.temp} onChange={setCal} units={{ depth: 'ft', temp: 'F' }} />;
}

function ErosionEditorHost() {
  const [events, setEvents] = useState([{ age: 10, amount: 500 }]);
  latest = events;
  return <ErosionEventsEditor events={events} maxAge={100} onChange={setEvents} depthUnit="ft" />;
}

// Comp is rendered here (not passed as children) so it re-renders with the store
function GuidedHost({ Comp }) {
  const [wizardData, setWizardData] = useState({
    erosionOption: 'custom', erosionEvent: { age: 10, amount: 500 },
    layers: [{ id: 'L1', name: 'Shale A', ageStart: 0, ageEnd: 20, thickness: 1000, lithology: 'shale' }],
  });
  latest = wizardData;
  mockStore.basin = { units: { depth: 'ft', temp: 'C' } };
  mockStore.guided = {
    wizardData, setWizardData, addLayer: () => {}, removeLayer: () => {},
    updateLayer: (id, patch) => setWizardData((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
  };
  return <Comp />;
}

function HistoryHost() {
  const [settings, setSettings] = useState({ surfaceTemp: 20 });
  latest = settings;
  mockStore.basin = {
    state: { heatFlow: { type: 'constant', value: 60 }, erosionEvents: [], settings },
    dispatch: (a) => { if (a.type === 'UPDATE_SETTINGS') setSettings((s) => ({ ...s, ...a.payload })); },
    stats: { maxAge: 100 },
    units: { depth: 'ft', temp: 'F' },
  };
  return <GlobalHistoryPanel />;
}

// ---- the boxes ---------------------------------------------------------------
// [name, host, testid, read the stored SI value, display -> SI]
const BOXES = [
  ['calibration Ro depth', CalibrationHost, 'bf-cal-ro-depth-0', () => latest.ro[0].depth, ft],
  ['calibration Ro value', CalibrationHost, 'bf-cal-ro-value-0', () => latest.ro[0].value, (v) => v],
  ['calibration temperature depth', CalibrationHost, 'bf-cal-temp-depth-0', () => latest.temp[0].depth, ft],
  ['calibration temperature value', CalibrationHost, 'bf-cal-temp-value-0', () => latest.temp[0].value, fToC],
  ['erosion editor amount', ErosionEditorHost, 'bf-erosion-amount-0', () => latest[0].amount, ft],
  ['guided erosion amount', () => <GuidedHost Comp={ErosionStep} />, 'bf-wizard-erosion-amount', () => latest.erosionEvent.amount, ft],
  ['surface temperature', HistoryHost, 'bf-surface-temp', () => latest.surfaceTemp, fToC],
  ['guided layer thickness', () => <GuidedHost Comp={StratigraphyInputStep} />, 'bf-guided-layer-thickness-0', () => latest.layers[0].thickness, ft],
];

describe.each(BOXES)('%s', (_name, Host, testId, stored, toSI) => {
  test.each(['2.', '0.5', '13.7'])('typing %s key by key keeps it and stores the SI twin', async (typed) => {
    render(<Host />);
    const input = screen.getByTestId(testId);
    await userEvent.clear(input);
    await userEvent.type(input, typed);
    expect(input.value).toBe(typed);
    expect(stored()).toBeCloseTo(toSI(Number(typed)), 9);
    fireEvent.blur(input);
    expect(stored()).toBeCloseTo(toSI(Number(typed)), 9);
  });

  test('clearing the box stores no NaN: the last value is kept and the field is named', async () => {
    render(<Host />);
    const input = screen.getByTestId(testId);
    const before = stored();
    const shown = input.value;
    await userEvent.clear(input);
    expect(Number.isFinite(stored())).toBe(true);
    expect(stored()).toBe(before);
    expect(screen.getByTestId(`${testId}-refused`)).toHaveTextContent(/needs a number\. The last value is kept\./);
    fireEvent.blur(input);
    expect(input.value).toBe(shown);
    expect(screen.queryByTestId(`${testId}-refused`)).toBeNull();
  });
});
