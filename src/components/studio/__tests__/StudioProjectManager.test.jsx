/**
 * Wiring tests for the Studio shell's project manager: the Select lists
 * projects, the create dialog fires onCreate, delete is confirm-guarded.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudioProjectManager from '../StudioProjectManager';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  // Radix Select needs these in jsdom
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

const projects = [
  { id: 'p1', name: 'Flood North' },
  { id: 'p2', name: 'Flood South' },
];

describe('StudioProjectManager', () => {
  it('shows the current project name in the Select', () => {
    render(
      <StudioProjectManager
        projects={projects}
        currentProjectId="p2"
        onCreate={jest.fn()} onOpen={jest.fn()} onDelete={jest.fn()}
      />
    );
    expect(screen.getByText('Flood South')).toBeInTheDocument();
  });

  it('creates a project through the dialog and fires onCreate with the typed name', async () => {
    const onCreate = jest.fn();
    render(
      <StudioProjectManager
        projects={[]}
        currentProjectId={null}
        onCreate={onCreate} onOpen={jest.fn()} onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Create new project'));
    const input = await screen.findByPlaceholderText('Project Name');
    fireEvent.change(input, { target: { value: 'My Flood' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('My Flood'));
  });

  it('does not create with a blank name', async () => {
    const onCreate = jest.fn();
    render(
      <StudioProjectManager
        projects={[]}
        currentProjectId={null}
        onCreate={onCreate} onOpen={jest.fn()} onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Create new project'));
    fireEvent.click(await screen.findByRole('button', { name: /Create Project/i }));
    await waitFor(() => expect(onCreate).not.toHaveBeenCalled());
  });

  it('deletes only after window.confirm accepts', () => {
    const onDelete = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm');

    const { rerender } = render(
      <StudioProjectManager
        projects={projects}
        currentProjectId="p1"
        onCreate={jest.fn()} onOpen={jest.fn()} onDelete={onDelete}
      />
    );

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle('Delete current project'));
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    rerender(
      <StudioProjectManager
        projects={projects}
        currentProjectId="p1"
        onCreate={jest.fn()} onOpen={jest.fn()} onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTitle('Delete current project'));
    expect(onDelete).toHaveBeenCalledWith('p1');

    confirmSpy.mockRestore();
  });

  it('hides the delete button when no project is open', () => {
    render(
      <StudioProjectManager
        projects={projects}
        currentProjectId={null}
        onCreate={jest.fn()} onOpen={jest.fn()} onDelete={jest.fn()}
      />
    );
    expect(screen.queryByTitle('Delete current project')).not.toBeInTheDocument();
  });
});
