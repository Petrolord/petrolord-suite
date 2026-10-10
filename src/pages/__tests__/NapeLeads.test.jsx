import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

const mockInserted = [];
let mockFail = false;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: async (row) => {
        if (mockFail) return { error: { message: 'relation "public.event_leads" does not exist' } };
        mockInserted.push(row);
        return { error: null };
      },
    }),
  },
}));

import NapeLeads from '../events/NapeLeads';

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><NapeLeads /></MemoryRouter>);
const fill = () => {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada Obi' } });
  fireEvent.change(screen.getByLabelText('Phone (WhatsApp)'), { target: { value: '0803 123 4567' } });
  fireEvent.click(screen.getByTestId('nape-interest-suite'));
};

beforeEach(() => { mockInserted.length = 0; mockFail = false; window.localStorage.clear(); });

test('consent is required before anything is saved (negative control)', async () => {
  renderAt('/nape?src=tablet');
  fill();
  fireEvent.click(screen.getByTestId('nape-submit'));
  expect(await screen.findByText(/tick the box/)).toBeInTheDocument();
  expect(mockInserted).toHaveLength(0);
});

test('a tablet lead is saved and the visitor gets the WhatsApp button with their name and interest', async () => {
  renderAt('/nape?src=tablet');
  fill();
  fireEvent.click(screen.getByTestId('nape-consent'));
  fireEvent.click(screen.getByTestId('nape-submit'));
  const wa = await screen.findByTestId('nape-whatsapp');
  expect(mockInserted).toHaveLength(1);
  expect(mockInserted[0]).toMatchObject({ name: 'Ada Obi', phone: '2348031234567', interests: ['suite'], source: 'tablet', consent: true });
  expect(decodeURIComponent(wa.getAttribute('href'))).toMatch(/^https:\/\/wa\.me\/2349015566981\?text=Hello Petrolord, this is Ada Obi\. .*Petrolord Suite\.$/);
  expect(screen.getByText(/Your details are saved/)).toBeInTheDocument();
  // the booth quiz link (QUIZ_URL) leads to the Petrolord Upstream Challenge
  expect(screen.getByTestId('nape-quiz')).toHaveAttribute('href', '/nape/quiz');
  expect(screen.getByTestId('nape-quiz')).toHaveTextContent('Play the Petrolord Upstream Challenge');
  fireEvent.click(screen.getByTestId('nape-next'));
  expect(screen.getByLabelText('Your name')).toHaveValue('');
});

test('before the table exists the lead is kept on the phone, WhatsApp still works, and the next visit sends it', async () => {
  mockFail = true;
  const first = renderAt('/nape?src=tablet');
  fill();
  fireEvent.click(screen.getByTestId('nape-consent'));
  fireEvent.click(screen.getByTestId('nape-submit'));
  expect(await screen.findByTestId('nape-whatsapp')).toBeInTheDocument();
  expect(screen.getByText(/kept on this phone/)).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('pl.eventLeads.queue'))).toHaveLength(1);
  first.unmount();
  mockFail = false;
  renderAt('/nape');
  await waitFor(() => expect(mockInserted).toHaveLength(1));
  expect(window.localStorage.getItem('pl.eventLeads.queue')).toBeNull();
});
