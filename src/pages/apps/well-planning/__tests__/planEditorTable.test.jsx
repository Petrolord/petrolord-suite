// Plan Editor table: defining cells are inputs, computed cells are text,
// edits commit on Enter only when the text changed, read-only designs
// show no inputs.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanEditorTable from '../components/PlanEditorTable';
import { compileSegments } from '../engine/segmentCompiler';
import { resolvePlan, derivePlanTable } from '../services/planEditor';

const segments = [
    { id: 'a', type: 'Hold', length: 500 },
    { id: 'b', type: 'Build', length: 300, buildRate: 3 },
    { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1200 },
];

function rowsFor(segs, targets = []) {
    const { compilerSegments, spans } = resolvePlan(segs);
    const { table } = compileSegments({ segments: compilerSegments, subdivideMd: 30 });
    return derivePlanTable({ segments: segs, spans, planRows: table, targets });
}

const setup = (props = {}) => {
    const handlers = {
        onEdit: jest.fn(() => true), onChangeType: jest.fn(), onInsert: jest.fn(),
        onDelete: jest.fn(), onUndo: jest.fn(), onRedo: jest.fn(),
    };
    render(<PlanEditorTable rows={rowsFor(segments)} mdUnit="m" canUndo canRedo={false} {...handlers} {...props} />);
    return handlers;
};

describe('PlanEditorTable', () => {
    test('defining cells are editable per section type; computed cells are not', () => {
        setup();
        expect(screen.getByTestId('plan-row-tie')).toBeInTheDocument();
        expect(screen.getByTestId('plan-cell-0-md')).toHaveValue('500.00');
        expect(screen.getByTestId('plan-cell-0-cl')).toBeInTheDocument();
        expect(screen.queryByTestId('plan-cell-0-inc')).toBeNull();
        expect(screen.getByTestId('plan-cell-1-build')).toHaveValue('3.00');
        expect(screen.getByTestId('plan-cell-1-dls')).toBeInTheDocument();
        expect(screen.queryByTestId('plan-cell-1-tf')).toBeNull();
        expect(screen.getByTestId('plan-cell-2-inc')).toHaveValue('60.00');
        expect(screen.getByTestId('plan-cell-2-azi')).toHaveValue('45.00');
        expect(screen.queryByTestId('plan-cell-2-dls')).toBeNull();
        expect(screen.queryByTestId('plan-cell-2-tvd')).toBeNull();
    });

    test('Enter commits a changed cell; an untouched blur does not', () => {
        const h = setup();
        const cell = screen.getByTestId('plan-cell-2-inc');
        fireEvent.blur(cell);
        expect(h.onEdit).not.toHaveBeenCalled();
        fireEvent.change(cell, { target: { value: '75' } });
        fireEvent.keyDown(cell, { key: 'Enter' });
        expect(h.onEdit).toHaveBeenCalledTimes(1);
        expect(h.onEdit.mock.calls[0][1]).toBe('inc');
        expect(h.onEdit.mock.calls[0][2]).toBe('75');
        expect(h.onEdit.mock.calls[0][0].segIndex).toBe(2);
    });

    test('a refused edit reverts the cell', () => {
        const h = setup();
        h.onEdit.mockReturnValue(false);
        const cell = screen.getByTestId('plan-cell-0-md');
        fireEvent.change(cell, { target: { value: '-4' } });
        fireEvent.keyDown(cell, { key: 'Enter' });
        expect(cell).toHaveValue('500.00');
    });

    test('insert, delete, undo and redo controls', () => {
        const h = setup();
        fireEvent.click(screen.getByTestId('plan-insert-above-1'));
        expect(h.onInsert).toHaveBeenLastCalledWith(1);
        fireEvent.click(screen.getByTestId('plan-insert-below-1'));
        expect(h.onInsert).toHaveBeenLastCalledWith(2);
        fireEvent.click(screen.getByTestId('plan-insert-below-tie'));
        expect(h.onInsert).toHaveBeenLastCalledWith(0);
        fireEvent.click(screen.getByTestId('plan-delete-0'));
        expect(h.onDelete).toHaveBeenCalledWith(0);
        fireEvent.click(screen.getByTestId('plan-undo'));
        expect(h.onUndo).toHaveBeenCalled();
        expect(screen.getByTestId('plan-redo')).toBeDisabled();
    });

    test('target names show on the row that lands on them', () => {
        const rows = rowsFor(segments);
        const end = rows[3];
        render(<PlanEditorTable rows={rowsFor(segments, [{ name: 'Heel', n: end.n, e: end.e, tvd: end.tvd }])} mdUnit="m" onEdit={jest.fn()} />);
        expect(screen.getByTestId('plan-row-2')).toHaveTextContent('Heel');
    });

    test('read-only designs have no inputs and no row actions', () => {
        setup({ readOnly: true });
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
        expect(screen.queryByTestId('plan-delete-0')).toBeNull();
        expect(screen.queryByTestId('plan-undo')).toBeNull();
        expect(screen.getByText('This design is read-only.')).toBeInTheDocument();
    });
});
