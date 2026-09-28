/**
 * The single opt-in helper (src/design/themeClass.js) and the Studio kit's
 * useStudioTheme, which must return the same picker.
 */
import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));

import { ThemedApp } from '@/design/ThemeProvider';
import { useThemeClass, themeClassPicker } from '@/design/themeClass';
import { useStudioTheme } from '@/components/studio/studioTheme';

const TABLE = { 'bg-slate-900': 'bg-pl-surface' };

function Probe({ onResult }) {
  const tc = useThemeClass(TABLE);
  const { ds, tc: stc } = useStudioTheme();
  onResult({
    table: tc('bg-slate-900'),
    unknown: tc('p-2'),
    pair: tc('text-white', 'text-pl-text'),
    dropped: tc('border-slate-800', undefined),
    studioPair: stc('text-white', 'text-pl-text'),
    studioDropped: stc('border-slate-800', undefined),
    ds: Boolean(ds),
  });
  return null;
}

const run = (wrap) => {
  let out;
  render(wrap(<Probe onResult={(r) => { out = r; }} />));
  return out;
};

it('outside a scope every form returns the legacy string unchanged', () => {
  expect(run((c) => c)).toEqual({
    table: 'bg-slate-900', unknown: 'p-2', pair: 'text-white', dropped: 'border-slate-800',
    studioPair: 'text-white', studioDropped: 'border-slate-800', ds: false,
  });
});

it('inside a scope: table lookup, the second argument (even undefined), pass-through', () => {
  expect(run((c) => <ThemedApp userId="t">{c}</ThemedApp>)).toEqual({
    table: 'bg-pl-surface', unknown: 'p-2', pair: 'text-pl-text', dropped: undefined,
    studioPair: 'text-pl-text', studioDropped: undefined, ds: true,
  });
});

it('themeClassPicker(null) is the identity', () => {
  const tc = themeClassPicker(null, TABLE);
  expect(tc('bg-slate-900', 'x')).toBe('bg-slate-900');
});
