/**
 * The AI employees admin page renders the register, the youtube_listing
 * preview in the approval queue, the scorecard and the action log, and an
 * approval writes to the task and the action log.
 * Supabase is the accountTestKit stand-in; nothing reaches a database.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const now = new Date().toISOString();
  return {
    supabase: makeSupabase({
      ai_employees: [{
        id: 'e1', slug: 'youtube-channel-manager', role_title: 'YouTube channel manager', manager_email: 'ayoasaolu@lordswayenergy.com',
        next_manager_email: 'seyiojo@lordswayenergy.com', autonomy_step: 1, status: 'active', next_review_at: '2026-11-10T00:00:00Z', created_at: now,
      }],
      ai_employee_tasks: [{
        id: 't1', employee_id: 'e1', kind: 'youtube_listing', status: 'proposed', title: 'Does the Seismic See the Oil?', created_at: now,
        payload: { video_key: 'qi-01', title: 'Does the Seismic See the Oil?', description: 'Body.\n\nPetrolord Suite: https://petrolord.com', chapters: [{ t: '0:00', label: 'Introduction' }], tags: ['AVO', 'QI'], playlist: 'QI Studio', privacy: 'private', scheduled_at: '2026-10-20T09:00:00Z' },
      }],
      ai_employee_actions: [{ id: 'a1', employee_id: 'e1', task_id: 't1', action: 'proposal_created', detail: { video_key: 'qi-01' }, created_at: now }],
    }),
  };
});

import AiEmployees from '@/pages/admin/AiEmployees';
import { supabase } from '@/lib/customSupabaseClient';
import { installDomShims } from '@/design/testing/themeAssertions';
import { renderAccountPage } from './accountTestKit';

beforeAll(installDomShims);

test('register, listing preview, scorecard and log render; approve writes the task and the log', async () => {
  renderAccountPage(AiEmployees, { auth: { isSuperAdmin: true, actualUser: { id: 'u1', email: 'AyoAsaolu@lordswayenergy.com' } } });
  await screen.findByText('YouTube channel manager');
  expect(screen.getByText('Step 1: Shadow')).toBeInTheDocument();
  expect(screen.getByText('seyiojo@lordswayenergy.com')).toBeInTheDocument();
  expect(screen.getByText('2026-11-10')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('Does the Seismic See the Oil?')).toBeInTheDocument();
  expect(screen.getByText('QI Studio')).toBeInTheDocument();
  expect(screen.getByText('2026-10-20 09:00 UTC')).toBeInTheDocument();
  expect(screen.getByText('Introduction')).toBeInTheDocument();
  expect(screen.getByText('AVO, QI')).toBeInTheDocument();
  expect(screen.getByText('proposal created')).toBeInTheDocument();
  expect(screen.getByTestId('ai-scorecard')).toHaveTextContent('Proposed1');

  fireEvent.change(screen.getByTestId('ai-task-edit-title'), { target: { value: 'Does the Seismic See the Oil? QI Studio' } });
  supabase.from.mockClear();
  fireEvent.click(screen.getByTestId('ai-task-approve'));
  await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('ai_employee_tasks'));
  await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('ai_employee_actions'));
});
