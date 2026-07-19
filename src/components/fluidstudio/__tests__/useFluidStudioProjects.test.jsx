/**
 * Project-lifecycle hook tests. The shared saved-projects service is mocked so
 * the real create/open/delete/save paths run without a live database. Covers
 * the legacy-payload path: rows written by the pre-shell SaveProjectDialog
 * stored the raw inputs object as inputs_data.
 */
import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFluidStudioProjects, inputsFromPayload, friendlyError } from '../useFluidStudioProjects';

jest.mock('@/utils/savedProjects', () => {
  const svc = {
    list: jest.fn(() => Promise.resolve([])),
    save: jest.fn(() => Promise.resolve({ success: true })),
    load: jest.fn(() => Promise.resolve(null)),
    remove: jest.fn(() => Promise.resolve({ success: true })),
  };
  return { createSavedProjectsService: () => svc, __mockService: svc };
});

const { __mockService: mockService } = jest.requireMock('@/utils/savedProjects');

const setup = (initialInputs = { marker: 1 }) => renderHook(() => {
  const [inputs, setInputs] = useState(initialInputs);
  const hook = useFluidStudioProjects({ inputs, setInputs });
  return { ...hook, inputs };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockService.list.mockResolvedValue([]);
});

describe('useFluidStudioProjects', () => {
  it('lists projects on mount', async () => {
    mockService.list.mockResolvedValue([{ id: 'p1', name: 'Case A' }]);
    const { result } = setup();
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(result.current.projects[0]).toMatchObject({ id: 'p1', name: 'Case A' });
  });

  it('createProject saves a schema-1 payload carrying the current inputs', async () => {
    const { result } = setup({ marker: 42 });
    await act(async () => { await result.current.createProject('My Case'); });
    expect(mockService.save).toHaveBeenCalledTimes(1);
    const [id, payload] = mockService.save.mock.calls[0];
    expect(typeof id).toBe('string');
    expect(payload).toMatchObject({ name: 'My Case', schema: 1, inputs: { marker: 42 } });
    expect(result.current.currentProjectId).toBe(id);
    expect(result.current.lastSaveTime).toBeInstanceOf(Date);
  });

  it('openProject restores inputs from a shell payload', async () => {
    mockService.load.mockResolvedValue({ name: 'Case B', schema: 1, inputs: { marker: 7 } });
    const { result } = setup({ marker: 1 });
    await act(async () => { await result.current.openProject('p2'); });
    expect(result.current.inputs).toEqual({ marker: 7 });
    expect(result.current.currentProjectId).toBe('p2');
    expect(result.current.projectName).toBe('Case B');
  });

  it('openProject restores a legacy pre-shell payload (raw inputs object)', async () => {
    mockService.load.mockResolvedValue({ streamA: { blackOil: { api: 35 } }, fluidModel: 'blackoil' });
    mockService.list.mockResolvedValue([{ id: 'p3', name: 'Old row' }]);
    const { result } = setup({ marker: 1 });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(async () => { await result.current.openProject('p3'); });
    expect(result.current.inputs).toEqual({ streamA: { blackOil: { api: 35 } }, fluidModel: 'blackoil' });
    expect(result.current.projectName).toBe('Old row');
  });

  it('deleteProject clears the current project when it was open', async () => {
    mockService.load.mockResolvedValue({ name: 'Case C', schema: 1, inputs: { marker: 3 } });
    const { result } = setup();
    await act(async () => { await result.current.openProject('p4'); });
    await act(async () => { await result.current.deleteProject('p4'); });
    expect(mockService.remove).toHaveBeenCalledWith('p4');
    expect(result.current.currentProjectId).toBeNull();
  });

  it('manualSave without an open project only notifies', async () => {
    const { result } = setup();
    await act(async () => { await result.current.manualSave(); });
    expect(mockService.save).not.toHaveBeenCalled();
    expect(result.current.notifications.some((n) => /Create or open/i.test(n.message))).toBe(true);
  });
});

describe('inputsFromPayload', () => {
  it('prefers the shell payload inputs field', () => {
    expect(inputsFromPayload({ name: 'x', inputs: { a: 1 } })).toEqual({ a: 1 });
  });
  it('falls back to the payload itself for legacy rows', () => {
    expect(inputsFromPayload({ streamA: {} })).toEqual({ streamA: {} });
  });
  it('rejects empty payloads', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('friendlyError', () => {
  it('maps a missing table to the migration hint', () => {
    expect(friendlyError({ code: '42P01', message: 'relation does not exist' })).toMatch(/migration/i);
  });
  it('passes other errors through', () => {
    expect(friendlyError({ message: 'column x does not exist' })).toBe('column x does not exist');
  });
});
