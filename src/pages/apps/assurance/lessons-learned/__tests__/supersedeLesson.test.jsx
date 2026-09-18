/**
 * AS13, defect 19: the Superseded button could never succeed, because
 * nothing on the page named the lesson that replaces this one. This
 * renders the page and proves the button now asks for it and sends it.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LessonDetail from '../LessonDetail';

const mockAdvance = jest.fn(async () => ({ success: true }));
const substance = { description: 'Pump tripped', root_cause: 'Seal wear', recommendation: 'Inspect seals' };
const mockLessons = [
  { id: 'l1', lesson_code: 'LL-2026-001', title: 'Old lesson', status: 'Published', applicability_scope: 'This asset', applications: [], ...substance },
  { id: 'l2', lesson_code: 'LL-2026-002', title: 'Better lesson', status: 'Validated', applicability_scope: 'This asset', applications: [], ...substance },
  { id: 'l3', lesson_code: 'LL-2026-003', title: 'Archived one', status: 'Archived', applicability_scope: 'This asset', applications: [], ...substance },
];

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../hooks/useLessonsLearned', () => ({
  useLessonsLearned: () => ({
    lessons: mockLessons,
    risks: [],
    mocs: [],
    userId: 'user-1',
    activityFor: () => [],
    loading: false,
    error: null,
    refresh: jest.fn(),
    hasAs9Schema: true,
    editLesson: jest.fn(),
    validateLesson: jest.fn(),
    advanceLesson: (...args) => mockAdvance(...args),
    recordApplication: jest.fn(),
    deleteApplication: jest.fn(),
    raiseRiskFromLesson: jest.fn(),
    raiseMocFromLesson: jest.fn(),
  }),
}));

describe('superseding a lesson (AS13 defect 19)', () => {
  it('names the replacing lesson, offering only live ones, and sends it', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/apps/assurance/lessons-learned/l1']}>
        <Routes>
          <Route path="/dashboard/apps/assurance/lessons-learned/:lessonId" element={<LessonDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Superseded' }));
    const picker = screen.getByLabelText('Which lesson replaces this one?');
    const options = [...picker.querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['', 'l2']);
    const submit = screen.getByRole('button', { name: 'Mark superseded' });
    expect(submit).toBeDisabled();

    fireEvent.change(picker, { target: { value: 'l2' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mockAdvance).toHaveBeenCalledTimes(1));
    const [lesson, to, patch] = mockAdvance.mock.calls[0];
    expect(lesson.id).toBe('l1');
    expect(to).toBe('Superseded');
    expect(patch).toEqual({ superseded_by: 'l2' });
  });

  it('a published lesson offers no in-place edit, and says why', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/apps/assurance/lessons-learned/l1']}>
        <Routes>
          <Route path="/dashboard/apps/assurance/lessons-learned/:lessonId" element={<LessonDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Edit the lesson' })).toBeNull();
    expect(screen.getByText(/capture a new lesson and mark this one Superseded/)).toBeInTheDocument();
  });
});
