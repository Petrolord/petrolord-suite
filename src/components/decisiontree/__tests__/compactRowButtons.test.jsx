/**
 * W9. A CompactInput / COMPACT_FIELD_THEMED field is 26px tall (text-xs 16px
 * line, py-1, 1px border). The Decision Tree node row put `sm` Buttons forced
 * to h-6 (24px) beside those fields, so the row did not line up. The ui Button
 * now has an `xs` size at h-[26px] and the row uses it.
 * Negative control: on the old row the buttons carry h-6 and fail the check.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TreeNodeEditor from '@/components/decisiontree/TreeNodeEditor';
import { buttonVariants } from '@/components/ui/button';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';

const is26 = (cls) => /(^|\s)h-\[26px\](\s|$)/.test(cls) && !/(^|\s)h-(6|7|8)(\s|$)/.test(cls);

test('the xs Button size matches the compact field height', () => {
  expect(is26(buttonVariants({ size: 'xs' }))).toBe(true);
  expect(is26(buttonVariants({ size: 'sm' }))).toBe(false); // sm stays h-8
  // the compact field is the 26px one: text-xs, py-1 and a 1px border
  expect(COMPACT_FIELD_THEMED).toMatch(/(^|\s)text-xs(\s|$)/);
  expect(COMPACT_FIELD_THEMED).toMatch(/(^|\s)py-1(\s|$)/);
  expect(COMPACT_FIELD_THEMED).toMatch(/(^|\s)border(\s|$)/);
});

test('buttons in a Decision Tree node row match its compact fields', () => {
  const decision = {
    id: 'root', type: 'decision', label: 'Develop?',
    branches: [{ label: 'Option A', cost: 0, node: { id: 't', type: 'terminal', label: 'A', payoff: 1 } }],
  };
  render(<TreeNodeEditor node={decision} onChange={() => {}} onLinkMcRun={() => {}} depth={0} />);
  const branch = screen.getByRole('button', { name: 'Branch' });
  const link = screen.getByRole('button', { name: /link epe mc run/i });
  expect(is26('h-6 px-2 text-xs')).toBe(false); // negative control: the old class
  expect(is26(branch.className)).toBe(true);
  expect(is26(link.className)).toBe(true);
});
