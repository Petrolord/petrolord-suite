/**
 * Group 5 docked interpretation toolbox, component level: the real
 * InterpretationToolbox + useFaultStickEditor + UndoStack, with section
 * clicks fed in as the SliceView hands them over ({ilIdx, xlIdx, sample}).
 * Owner's required case: "a fault shortened and erased, then undone".
 */
import React, { useReducer, useState } from 'react';
import {
  render, screen, fireEvent, act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import InterpretationToolbox from '@/pages/apps/Seismolord/components/workspace/InterpretationToolbox';
import useFaultStickEditor from '@/pages/apps/Seismolord/hooks/useFaultStickEditor';
import { UndoStack } from '@/pages/apps/Seismolord/lib/undoStack';

const P = (xl, s) => ({ il: 10, xl, s });
const STORED = { id: 'f1', name: 'Main fault', is_own: true };
const INITIAL = [
  [P(20, 100), P(21, 120), P(22, 140), P(23, 160)],
  [P(40, 90), P(41, 130)],
];

let sectionPick = null;       // what the next "section click" hands over
let latest = null;            // harness state for assertions

function Harness({ onDeleteStoredFault, horizonOverrides = {} }) {
  const [, tick] = useReducer((n) => n + 1, 0);
  const [undoStack] = useState(() => new UndoStack(60, tick));
  const [draft, setDraft] = useState(INITIAL);
  const [editingFault, setEditingFault] = useState(STORED);
  const [pickMode, setPickMode] = useState(null);
  const [corrThreshold, setCorrThreshold] = useState(0.7);
  const [snapMode, setSnapMode] = useState('peak');
  const ed = useFaultStickEditor({
    draftSticks: draft, setDraftSticks: setDraft, undoStack, orientation: 'inline',
  });
  latest = {
    draft, editingFault, pickMode, ed, corrThreshold, snapMode,
  };

  const deleteActiveFault = async () => {
    // the controller's contract: the stored fault goes (undoable) and the
    // draft that stood in for it is cleared
    const f = editingFault;
    const prevDraft = draft;
    await onDeleteStoredFault(f);
    setDraft([]);
    setEditingFault(null);
    undoStack.push({
      label: `delete fault "${f.name}"`,
      undo: () => { setEditingFault(f); setDraft(prevDraft); },
      redo: () => { setEditingFault(null); setDraft([]); },
    });
  };

  return (
    <>
      <InterpretationToolbox
        hasSection
        history={{
          undo: () => undoStack.undo(),
          redo: () => undoStack.redo(),
          canUndo: undoStack.canUndo,
          canRedo: undoStack.canRedo,
          undoLabel: undoStack.peekUndo(),
          redoLabel: undoStack.peekRedo(),
        }}
        horizon={{
          hasVolume: true,
          pickMode,
          setPickMode,
          editTarget: 'new',
          changeEditTarget: jest.fn(),
          horizons: [],
          toggleEditTool: (t) => setPickMode((p) => (p === t ? null : t)),
          snapMode,
          setSnapMode,
          snapWindow: 3,
          setSnapWindow: jest.fn(),
          corrThreshold,
          setCorrThreshold,
          seedPick: null,
          tracking: null,
          track2D: jest.fn(),
          trackHorizon: jest.fn(),
          growHorizon: jest.fn(),
          cancelTracking: jest.fn(),
          eraseSize: 1,
          setEraseSize: jest.fn(),
          edit: { active: false, undo: 0, redo: 0 },
          editBusy: false,
          saveEdits: jest.fn(),
          discardEdits: jest.fn(),
          ...horizonOverrides,
        }}
        fault={{
          faults: [STORED],
          editingFault,
          setActiveFault: jest.fn(),
          newFaultName: '',
          setNewFaultName: jest.fn(),
          defaultFaultName: 'Fault 2',
          draftSticks: draft,
          tool: ed.tool,
          setTool: ed.setTool,
          selected: ed.selected,
          selectedPoints: ed.selectedPoints,
          newStick: ed.newStick,
          trim: ed.trim,
          deleteSelected: ed.deleteSelected,
          saveDraftFault: jest.fn(),
          discardDraft: jest.fn(),
          deleteActiveFault,
          openFaultSettings: jest.fn(),
        }}
      />
      <button type="button" data-testid="section-click" onClick={() => ed.pick(sectionPick)}>section</button>
      <button type="button" data-testid="section-drag-end" onClick={() => ed.dragEnd()}>up</button>
    </>
  );
}

const clickSection = (xl, sample, extra = {}) => {
  sectionPick = {
    ilIdx: 10, xlIdx: xl, sample, ...extra,
  };
  fireEvent.click(screen.getByTestId('section-click'));
};
const undo = async () => { await act(async () => { fireEvent.click(screen.getByTestId('sl-toolbox-undo')); }); };
const redo = async () => { await act(async () => { fireEvent.click(screen.getByTestId('sl-toolbox-redo')); }); };

describe('InterpretationToolbox', () => {
  test('a fault shortened and erased, then undone', async () => {
    const onDeleteStoredFault = jest.fn(async () => {});
    render(<Harness onDeleteStoredFault={onDeleteStoredFault} />);

    // Shorten: pick the tool (turns fault picking on), click the third
    // node of the long stick: it and the deeper part go
    fireEvent.click(screen.getByTestId('sl-fault-tool-shorten'));
    expect(latest.pickMode).toBe('fault');
    clickSection(22, 141);
    expect(latest.draft[0]).toEqual([P(20, 100), P(21, 120)]);

    // Trim bottom on the (now selected) shortened stick
    fireEvent.click(screen.getByTestId('sl-fault-trim-bottom'));
    expect(latest.draft[0]).toEqual([P(20, 100)]);

    // Erase: delete a node, then a whole stick, then the fault itself
    fireEvent.click(screen.getByTestId('sl-fault-tool-deleteNode'));
    clickSection(41, 129);
    expect(latest.draft[1]).toEqual([P(40, 90)]);
    fireEvent.click(screen.getByTestId('sl-fault-tool-deleteStick'));
    clickSection(20, 102);
    expect(latest.draft).toEqual([[P(40, 90)]]);
    await act(async () => { fireEvent.click(screen.getByTestId('sl-fault-delete-fault')); });
    expect(onDeleteStoredFault).toHaveBeenCalledWith(STORED);
    expect(latest.draft).toEqual([]);
    expect(latest.editingFault).toBeNull();

    // Undo every step: fault, stick, node, trim, shorten
    await undo();
    expect(latest.editingFault).toEqual(STORED);
    expect(latest.draft).toEqual([[P(40, 90)]]);
    await undo();
    await undo();
    await undo();
    await undo();
    expect(latest.draft).toEqual(INITIAL);
    expect(screen.getByTestId('sl-toolbox-undo')).toBeDisabled();

    // redo replays the shorten
    await redo();
    expect(latest.draft[0]).toEqual([P(20, 100), P(21, 120)]);
  });

  test('extend grows the nearer end; a node drag is one undo step', async () => {
    render(<Harness onDeleteStoredFault={jest.fn()} />);
    fireEvent.click(screen.getByTestId('sl-fault-tool-select'));
    clickSection(20, 110);                       // select the long stick
    expect(latest.ed.selected).toBe(0);
    expect(screen.getByTestId('sl-fault-readout')).toHaveTextContent('Stick 1 of 2 selected (4 points)');

    fireEvent.click(screen.getByTestId('sl-fault-tool-extend'));
    clickSection(19, 80);                        // above the top
    expect(latest.draft[0][0]).toEqual(P(19, 80));

    fireEvent.click(screen.getByTestId('sl-fault-tool-move'));
    expect(latest.ed.streams).toBe(true);
    clickSection(21, 121);                       // pointer down grabs the node
    clickSection(21, 126);                       // moves stream
    clickSection(21, 131);
    fireEvent.click(screen.getByTestId('section-drag-end'));
    expect(latest.draft[0][2]).toEqual(P(21, 131));
    await undo();
    expect(latest.draft[0][2]).toEqual(P(21, 120));
    await undo();
    expect(latest.draft).toEqual(INITIAL);
  });

  test('New stick selects the new stick and Alt+click deletes a point', () => {
    render(<Harness onDeleteStoredFault={jest.fn()} />);
    fireEvent.click(screen.getByTestId('sl-fault-new-stick'));
    expect(latest.draft).toHaveLength(3);
    expect(latest.ed.selected).toBe(2);
    clickSection(60, 100);
    clickSection(61, 140);
    expect(latest.draft[2]).toEqual([P(60, 100), P(61, 140)]);
    clickSection(61, 139, { altKey: true });
    expect(latest.draft[2]).toEqual([P(60, 100)]);
  });

  test('the correlation threshold is always visible and editable', () => {
    render(<Harness onDeleteStoredFault={jest.fn()} />);
    const thr = screen.getByLabelText('Correlation threshold');
    expect(thr).toBeEnabled();
    fireEvent.change(thr, { target: { value: '0.8' } });
    expect(latest.corrThreshold).toBe(0.8);
    fireEvent.click(screen.getByText('Track by correlation'));
    expect(latest.snapMode).toBe('ncc');
    expect(screen.getByLabelText('Search window')).toBeInTheDocument();
    expect(screen.getByLabelText('Eraser brush')).toBeInTheDocument();
  });

  test('horizon tools drive the shared pick mode', () => {
    render(<Harness onDeleteStoredFault={jest.fn()} />);
    fireEvent.click(screen.getByTestId('sl-toolbox-manual'));
    expect(latest.pickMode).toBe('manual');
    fireEvent.click(screen.getByTestId('sl-toolbox-erase'));
    expect(latest.pickMode).toBe('erase');
    fireEvent.click(screen.getByTestId('sl-toolbox-seed'));
    expect(latest.pickMode).toBe('seed');
  });

  test('toolbox copy carries no em dashes (owner rule)', () => {
    const { container } = render(<Harness onDeleteStoredFault={jest.fn()} />);
    expect(container.textContent.includes('—')).toBe(false);
  });
});
