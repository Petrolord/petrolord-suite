// The Wellsite Studio help guide renders every section, quotes the live
// vocabulary (so it cannot drift from what the app stores), names the
// offline requirements, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteHelpGuide, { HELP_SECTIONS } from '../WellsiteHelpGuide';
import { SAMPLE_STAGES } from '@/lib/wellsite/sampleProgram';
import { EVENT_TYPES } from '@/lib/wellsite/events';
import { SHOW_QUALITIES } from '@/lib/wellsite/shows';
import { TOP_STATUSES } from '@/lib/wellsite/tops';
import { OBSERVATION_TYPES } from '../services/observations';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const renderGuide = () => render(<MemoryRouter><WellsiteHelpGuide /></MemoryRouter>);

test('renders the header and every navigation section', () => {
  renderGuide();
  expect(screen.getByRole('heading', { level: 1, name: /Wellsite Studio Help Guide/ })).toBeInTheDocument();
  for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
  expect(HELP_SECTIONS.length).toBe(19);
});

test('quotes the live vocabulary and the offline requirements', () => {
  const { container } = renderGuide();
  const text = container.textContent;
  for (const s of SAMPLE_STAGES) expect(text).toContain(s);
  for (const e of EVENT_TYPES) expect(text.toLowerCase()).toContain(e.name.toLowerCase());
  for (const q of SHOW_QUALITIES) expect(text).toContain(q.name);
  for (const s of TOP_STATUSES) expect(text).toContain(s);
  for (const o of OBSERVATION_TYPES) expect(text.toLowerCase()).toContain(o.name.toLowerCase());
  expect(text).toContain('BitLocker');
  expect(text).toContain('Keep offline');
  expect(text).toMatch(/counted in pump strokes/);
  expect(text).toMatch(/overdue for review/);
  expect(text).toMatch(/never says it was missed/);
});

test('copy carries no em dashes (owner rule) and never claims a determination', () => {
  const { container } = renderGuide();
  expect(container.textContent.includes('—')).toBe(false);
  expect(container.textContent).not.toMatch(/kick detected|oil determined|determined/i);
});
