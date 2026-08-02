// Leading-zero regression: clearing a numeric field and typing a fresh number
// must show exactly what was typed (no snap-back to "0"), while parsed values
// still commit on every keystroke.
import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberField from '../NumberField';

// Harness mirrors real usage: commits feed state, state feeds value.
const Harness = ({ initial = 0.2, emptyValue = 0, onCommit }) => {
    const [val, setVal] = useState(initial);
    return (
        <NumberField
            value={val}
            emptyValue={emptyValue}
            onCommit={(v) => { setVal(v); onCommit?.(v); }}
            aria-label="num"
        />
    );
};

describe('NumberField', () => {
    it('lets the user clear and retype without a stuck leading zero', async () => {
        const user = userEvent.setup();
        const commits = [];
        render(<Harness initial={0.2} onCommit={(v) => commits.push(v)} />);

        const input = screen.getByLabelText('num');
        expect(input.value).toBe('0.2');

        await user.clear(input);
        expect(input.value).toBe(''); // empty while typing, not "0"

        await user.type(input, '25');
        expect(input.value).toBe('25');
        expect(commits[commits.length - 1]).toBe(25);
    });

    it('commits emptyValue while the field is cleared', async () => {
        const user = userEvent.setup();
        const commits = [];
        render(<Harness initial={50} emptyValue={0} onCommit={(v) => commits.push(v)} />);

        await user.clear(screen.getByLabelText('num'));
        expect(commits[commits.length - 1]).toBe(0);
    });

    it('resyncs from an external value change when not focused', () => {
        const { rerender } = render(<NumberField value={10} onCommit={() => {}} aria-label="num" />);
        rerender(<NumberField value={99} onCommit={() => {}} aria-label="num" />);
        expect(screen.getByLabelText('num').value).toBe('99');
    });
});
