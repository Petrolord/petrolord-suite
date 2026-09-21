/**
 * EC4-1 and EC4-4 (engines #192) in the decision screens.
 *
 * EC4-1: a rolled-back decision node carries two tie sets. `tiedIndices` is
 * the exact band and drives the optimal-path marking; `tiedIndicesAtCardPrecision`
 * is the set that agrees with the 2 dp cards. A recommendation a reader acts
 * on must read the card-precision set, because otherwise the screen names one
 * of two branches whose printed EMVs are identical and calls the difference a
 * decision advantage of 0.00.
 *
 * EC4-4: the engine refuses a cost or payoff that is present but blank or not
 * a finite number, by node label, while an OMITTED cost is still 0. A cleared
 * box must therefore remove the field rather than store '' (a refusal) or 0
 * (a number nobody typed).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { rollback } from '@/lib/decisionTree';
import {
  firstMoveLabel, isIndifferentFirstMove, tiedFirstMoves,
} from '@/components/decisiontree/firstMoveLabel';
import TreeNodeEditor from '@/components/decisiontree/TreeNodeEditor';

const terminal = (label, payoff) => ({ id: `${label}-t`, type: 'terminal', label, payoff });

const twoOptionTree = (payoffA, payoffB) => ({
  id: 'root',
  type: 'decision',
  label: 'Develop?',
  branches: [
    { label: 'Option A', node: terminal('A', payoffA) },
    { label: 'Option B', node: terminal('B', payoffB) },
  ],
});

describe('a first move the numbers cannot separate', () => {
  it('is reported as indifferent, naming both branches', () => {
    const root = rollback(twoOptionTree(100, 100));
    expect(root.indifferent).toBe(true);
    expect(root.indifferentAtCardPrecision).toBe(true);
    expect(tiedFirstMoves(root)).toEqual(['Option A', 'Option B']);
    expect(firstMoveLabel(root)).toBe('Indifferent: "Option A" and "Option B" come to the same figure');
    expect(isIndifferentFirstMove(root)).toBe(true);
  });

  it('reads the card precision, not the exact band', () => {
    // 0.001 apart: two different numbers that both print as 100.00.
    const root = rollback(twoOptionTree(100, 100.001));
    expect(root.indifferent).toBe(false);
    expect(root.indifferentAtCardPrecision).toBe(true);
    expect(firstMoveLabel(root)).toMatch(/^Indifferent: /);
    // The optimal-path marking still picks one branch, as it must.
    expect(root.bestBranchIndex).toBe(1);
  });

  it('negative control: a gap the cards show names one branch', () => {
    const root = rollback(twoOptionTree(100, 140));
    expect(root.indifferentAtCardPrecision).toBe(false);
    expect(firstMoveLabel(root)).toBe('Option B');
    expect(isIndifferentFirstMove(root)).toBe(false);
    expect(tiedFirstMoves(root)).toEqual([]);
  });

  it('keeps the chance and terminal root statements', () => {
    expect(firstMoveLabel({ type: 'chance' })).toBe('Chance root: no first decision to make');
    expect(firstMoveLabel({ type: 'terminal' })).toBe('Single outcome: no decision to make');
    expect(firstMoveLabel(null)).toBe('N/A');
    expect(isIndifferentFirstMove({ type: 'chance' })).toBe(false);
  });
});

describe('a cleared cost or payoff box', () => {
  const decisionNode = {
    id: 'n1',
    type: 'decision',
    label: 'Develop?',
    branches: [{ label: 'Option A', cost: 5, node: terminal('A', 100) }],
  };

  it('omits the field rather than storing a blank the engine refuses', () => {
    const onChange = jest.fn();
    render(<TreeNodeEditor node={decisionNode} onChange={onChange} depth={0} />);
    const costBox = screen.getAllByRole('spinbutton').find((el) => el.value === '5');
    fireEvent.change(costBox, { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0];
    expect('cost' in emitted.branches[0]).toBe(false);
    // An omitted cost is 0 by contract, so the tree still rolls back.
    expect(() => rollback(emitted)).not.toThrow();
  });

  it('omits a cleared terminal payoff too', () => {
    const onChange = jest.fn();
    const node = terminal('A', 100);
    render(<TreeNodeEditor node={node} onChange={onChange} depth={0} />);
    const payoffBox = screen.getAllByRole('spinbutton').find((el) => el.value === '100');
    fireEvent.change(payoffBox, { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0];
    expect('payoff' in emitted).toBe(false);
  });

  it('negative control: a typed number is stored as a number', () => {
    const onChange = jest.fn();
    render(<TreeNodeEditor node={decisionNode} onChange={onChange} depth={0} />);
    const costBox = screen.getAllByRole('spinbutton').find((el) => el.value === '5');
    fireEvent.change(costBox, { target: { value: '12' } });
    expect(onChange.mock.calls[0][0].branches[0].cost).toBe(12);
  });
});

describe('the engine refusals the screens surface', () => {
  it('names the node and the field for a blank cost', () => {
    const tree = {
      id: 'root',
      type: 'decision',
      label: 'Develop?',
      branches: [
        { label: 'Option A', cost: '', node: terminal('A', 100) },
        { label: 'Option B', node: terminal('B', 90) },
      ],
    };
    expect(() => rollback(tree)).toThrow(/Branch "Option A" has a blank cost/);
    expect(() => rollback(tree)).toThrow(/Develop\?/);
  });

  it('refuses a negative cost and a non-finite payoff, and accepts an omitted cost', () => {
    const negative = {
      id: 'root', type: 'decision', label: 'Develop?',
      branches: [{ label: 'Option A', cost: -5, node: terminal('A', 100) }],
    };
    expect(() => rollback(negative)).toThrow(/negative cost/);
    const badPayoff = {
      id: 'root', type: 'decision', label: 'Develop?',
      branches: [{ label: 'Option A', node: terminal('A', 'abc') }],
    };
    expect(() => rollback(badPayoff)).toThrow();
    // Negative control: omitted cost, which is 0 by contract.
    const omitted = {
      id: 'root', type: 'decision', label: 'Develop?',
      branches: [{ label: 'Option A', node: terminal('A', 100) }],
    };
    expect(rollback(omitted).emv).toBe(100);
  });
});
