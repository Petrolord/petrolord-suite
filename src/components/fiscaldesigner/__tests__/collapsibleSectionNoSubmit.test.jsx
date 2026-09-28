// W7F: the section toggle in the fiscal regime input form had no type, so
// it defaulted to "submit" and every open or close ran the analysis.
// Negative control: on the old code onSubmit is called once.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CollapsibleSection from '../CollapsibleSection';

test('toggling a section does not submit its form', () => {
  const onSubmit = jest.fn((e) => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <CollapsibleSection title="Project Basis" icon={<span />} defaultOpen>
        <input aria-label="x" />
      </CollapsibleSection>
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Project Basis/ }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Project Basis/ }).getAttribute('type')).toBe('button');
});
