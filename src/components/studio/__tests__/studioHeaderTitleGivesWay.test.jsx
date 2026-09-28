// W7F: in a themed studio the title block was shrink-0, so when the header
// ran short of room every pixel came off the tab row and labels were cut
// mid-word ("Surveillanc" in Waterflood at 1440 px). The title now shrinks
// first, down to its 8.5rem floor; only then does the tab row shrink. jsdom has no layout, so this pins the flex classes
// that give that order (checked on screen at 1440 and 390 px).
// Negative control: on the old header the title block carries shrink-0 and
// the tab row plain sm:shrink.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Droplets } from 'lucide-react';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) } },
}));

import { ThemedApp } from '@/design/ThemeProvider';
import StudioHeader from '@/components/studio/StudioHeader';

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
});

test('the title gives way before the tab row', () => {
  render(
    <MemoryRouter>
      <ThemedApp>
        <StudioHeader
          icon={Droplets}
          title="Waterflood Design Studio"
          tabs={['Displacement', 'Layered Sweep', 'Surveillance'].map((l) => ({ value: l, label: l }))}
          activeTab="Displacement"
          onTabChange={() => {}}
        />
      </ThemedApp>
    </MemoryRouter>,
  );
  const h1 = screen.getByRole('heading', { name: 'Waterflood Design Studio' });
  expect(h1).toHaveClass('truncate');
  expect(h1).toHaveAttribute('title', 'Waterflood Design Studio');
  const titleBlock = h1.parentElement;
  expect(titleBlock).not.toHaveClass('shrink-0');
  expect(titleBlock).toHaveClass('min-w-0', 'sm:min-w-[8.5rem]');
  const tabsRoot = screen.getByRole('tablist').parentElement;
  expect(tabsRoot).toHaveClass('min-w-0', 'sm:shrink-[0.001]');
  expect(tabsRoot).not.toHaveClass('sm:shrink');
});
