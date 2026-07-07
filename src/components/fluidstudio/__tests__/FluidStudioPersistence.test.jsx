/**
 * Persistence wiring tests. Auth and the Supabase client are mocked so the real
 * save/query code paths run without a live database.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
const mockOrder = jest.fn(() => Promise.resolve({
  data: [{ id: 'p1', project_name: 'Case A', inputs_data: { marker: 42 }, created_at: '2026-07-07T00:00:00Z' }],
  error: null,
}));
const mockDeleteEq = jest.fn(() => Promise.resolve({ error: null }));

jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: (...args) => mockInsert(...args),
      select: () => ({ eq: () => ({ order: () => mockOrder() }) }),
      delete: () => ({ eq: () => mockDeleteEq() }),
    })),
  },
}));

// eslint-disable-next-line import/first
import { SaveProjectDialog, LoadProjectsDrawer, friendlyError } from '../FluidStudioPersistence';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
});

beforeEach(() => jest.clearAllMocks());

describe('SaveProjectDialog', () => {
  it('inserts the project with the signed-in user id and current inputs', async () => {
    render(<SaveProjectDialog open onOpenChange={() => {}} inputs={{ a: 1 }} results={{ b: 2 }} />);
    fireEvent.change(screen.getByPlaceholderText(/Field A blend case/i), { target: { value: 'My Case' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload).toMatchObject({ user_id: 'user-1', project_name: 'My Case', inputs_data: { a: 1 }, results_data: { b: 2 } });
  });

  it('does not insert when the name is blank', async () => {
    render(<SaveProjectDialog open onOpenChange={() => {}} inputs={{}} results={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(mockInsert).not.toHaveBeenCalled());
  });
});

describe('friendlyError', () => {
  it('maps missing-table (code or table-named message) to the migration hint', () => {
    expect(friendlyError({ code: '42P01', message: 'whatever' })).toMatch(/run the create_saved_fluid_studio_projects migration/);
    expect(friendlyError({ message: 'relation "saved_fluid_studio_projects" does not exist' })).toMatch(/migration/);
  });
  it('does NOT hijack unrelated errors that merely say "does not exist"', () => {
    expect(friendlyError({ code: '42703', message: 'column "foo" does not exist' })).toBe('column "foo" does not exist');
    expect(friendlyError({ message: 'permission denied for table saved_fluid_studio_projects' })).toBe('permission denied for table saved_fluid_studio_projects');
  });
});

describe('LoadProjectsDrawer', () => {
  it('lists saved projects and calls onSelect on Load', async () => {
    const onSelect = jest.fn();
    render(<LoadProjectsDrawer open onOpenChange={() => {}} onSelect={onSelect} />);
    await screen.findByText('Case A');
    fireEvent.click(screen.getByRole('button', { name: /Load/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', inputs_data: { marker: 42 } }));
  });
});
