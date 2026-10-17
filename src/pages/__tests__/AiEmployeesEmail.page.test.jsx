/**
 * The AI employees admin page shows an email_campaign draft: subject,
 * preheader, audience, Lagos time, the facts to fill, the reviewer notes, a
 * sandboxed HTML preview (no scripts) and the text version; approving writes
 * the filled facts. Supabase is the accountTestKit stand-in.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const now = new Date().toISOString();
  const html = '<!DOCTYPE html><html><head><title>Save the date</title></head><body><div><!--preheader-->Meet the team<!--/preheader--></div><p>Booth [BOOTH NUMBER]</p><a href="{{ unsubscribe }}">Unsubscribe</a></body></html>';
  return {
    supabase: makeSupabase({
      ai_employees: [{
        id: 'e2', slug: 'email-marketer', role_title: 'Email marketer', manager_email: 'ayoasaolu@lordswayenergy.com',
        next_manager_email: 'seyiojo@lordswayenergy.com', autonomy_step: 1, status: 'active', next_review_at: '2026-11-16T00:00:00Z', created_at: now,
      }],
      ai_employee_tasks: [{
        id: 't9', employee_id: 'e2', kind: 'email_campaign', status: 'proposed', title: 'Save the date: Petrolord at NAPE 2026', created_at: now,
        payload: {
          key: 'nape2026-1', subject: 'Save the date: Petrolord at NAPE 2026', preheader: 'Meet the team', html, text: 'Booth [BOOTH NUMBER]\nUnsubscribe: {{ unsubscribe }}',
          audience: ['nape-optins', 'nape-2026-leads'], scheduled_at: '2026-10-21T08:00:00.000Z', sender: { name: 'Petrolord', email: 'info@lordswayenergy.com' }, reply_to: 'info@lordswayenergy.com',
          placeholders: ['[BOOTH NUMBER]'], facts: { '[BOOTH NUMBER]': '' }, notes: ['Check the counts before approving.'],
        },
      }],
      ai_employee_actions: [],
    }),
  };
});

import AiEmployees from '@/pages/admin/AiEmployees';
import { supabase } from '@/lib/customSupabaseClient';
import { installDomShims } from '@/design/testing/themeAssertions';
import { renderAccountPage } from './accountTestKit';

beforeAll(installDomShims);

test('email draft preview renders and approve writes the filled facts', async () => {
  renderAccountPage(AiEmployees, { auth: { isSuperAdmin: true, actualUser: { id: 'u1', email: 'ayoasaolu@lordswayenergy.com' } } });
  await screen.findByText('Email marketer');
  expect(await screen.findByDisplayValue('Save the date: Petrolord at NAPE 2026')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Meet the team')).toBeInTheDocument();
  expect(screen.getByText('2026-10-21 09:00 Lagos (2026-10-21 08:00 UTC)')).toBeInTheDocument();
  expect(screen.getByText(/people who opted in at the last NAPE exhibition/)).toBeInTheDocument();
  expect(screen.getByText('Check the counts before approving.')).toBeInTheDocument();
  expect(screen.getByTestId('ai-email-placeholders')).toHaveTextContent('1 still missing');

  const frame = screen.getByTestId('ai-email-iframe');
  expect(frame.getAttribute('sandbox')).toBe(''); // no scripts, no same origin
  expect(frame.getAttribute('srcdoc')).toContain('Booth [BOOTH NUMBER]');
  expect(screen.getByTestId('ai-email-text')).toHaveTextContent('Unsubscribe: {{ unsubscribe }}');

  fireEvent.change(screen.getByTestId('ai-email-fact'), { target: { value: 'B12' } });
  await waitFor(() => expect(screen.getByTestId('ai-email-iframe').getAttribute('srcdoc')).toContain('Booth B12'));
  expect(screen.getByTestId('ai-email-placeholders')).toHaveTextContent('all filled');

  supabase.from.mockClear();
  fireEvent.click(screen.getByTestId('ai-task-approve'));
  await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('ai_employee_tasks'));
  await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('ai_employee_actions'));
});
