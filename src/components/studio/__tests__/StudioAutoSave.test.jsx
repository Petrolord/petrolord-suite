/**
 * Wiring tests for the Studio shell's autosave widget: renders its saving /
 * failed / saved / never-saved states and fires onSave on click.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import StudioAutoSave from '../StudioAutoSave';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
});

describe('StudioAutoSave', () => {
  it('shows the saving state and disables the button', () => {
    render(<StudioAutoSave isSaving saveError={null} lastSaveTime={null} onSave={jest.fn()} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows the failure state when saveError is set', () => {
    render(<StudioAutoSave isSaving={false} saveError="Auto-save failed" lastSaveTime={null} onSave={jest.fn()} />);
    expect(screen.getByText('Save Failed')).toBeInTheDocument();
  });

  it('shows Saved after a successful save', () => {
    render(<StudioAutoSave isSaving={false} saveError={null} lastSaveTime={new Date()} onSave={jest.fn()} />);
    expect(screen.getByText(/Saved Just now/i)).toBeInTheDocument();
  });

  it('shows a plain Save affordance before any save has happened', () => {
    render(<StudioAutoSave isSaving={false} saveError={null} lastSaveTime={null} onSave={jest.fn()} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('fires onSave on click', () => {
    const onSave = jest.fn();
    render(<StudioAutoSave isSaving={false} saveError={null} lastSaveTime={null} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
