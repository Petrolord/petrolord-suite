/**
 * Design system rollout W4E: Lessons Learned opts in to the Petrolord
 * theme. The shell mounts on the real hook over the in-memory database and
 * runs the shared four checks (opens light, the header toggle goes to dark
 * and back and stores the choice, no legacy console colour outside
 * data-canvas regions with a negative control, the route is registered for
 * the themed cold-load loaders). Every page is then walked in light and
 * dark, and the delete confirmation is opened and checked.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  describeAppTheme, installDomShims, expectThemedPath,
} from '@/design/testing/themeAssertions';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import {
  renderShell, settled, walkPages, expectConfirmOnRoles,
} from '../../__tests__/themeWalk';
import LessonsLearnedPageShell from '../LessonsLearnedPageShell';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

const ORG = 'org-1';
const BASE = '/dashboard/apps/assurance/lessons-learned';
const substance = { description: 'Pump tripped', root_cause: 'Seal wear', recommendation: 'Inspect seals monthly' };
const seed = () => ({
  lesson_records: [
    { id: 'l-emb', org_id: ORG, lesson_code: 'LL-2026-001', title: 'Seals', status: 'Embedded', validated_at: '2026-05-01', validator_name: 'V', review_due: '2026-01-01', category: 'Maintenance', ...substance },
    { id: 'l-draft', org_id: ORG, lesson_code: 'LL-2026-002', title: 'Valves', status: 'Draft', category: 'Operations', ...substance },
  ],
  lesson_applications: [
    { id: 'ap-only', lesson_id: 'l-emb', target_type: 'Procedure', reference: 'SOP-1', outcome: 'Adopted', applied_on: '2026-06-01' },
  ],
  lesson_activity_log: [],
  risk_register: [],
  moc_records: [],
  organization_members: [],
});

beforeAll(installDomShims);
beforeEach(() => { mockDb = makeFakeSupabase(seed()); });

describeAppTheme({
  name: 'Lessons Learned',
  route: BASE,
  renderApp: () => renderShell(LessonsLearnedPageShell, BASE),
  ready: settled,
  scopeTestId: 'lessons-theme-scope',
});

const PAGES = [
  ['', null], ['/register', 'LL-2026-001'], ['/new', null], ['/search', null],
  ['/reports', null], ['/l-emb', /LL-2026-001/], ['/l-draft', /LL-2026-002/],
];

describe('Lessons Learned themed pages', () => {
  it('every page reads in light with no legacy chrome', async () => {
    await walkPages(LessonsLearnedPageShell, BASE, PAGES, 'light');
  });

  it('every page reads in dark with no legacy chrome', async () => {
    await walkPages(LessonsLearnedPageShell, BASE, PAGES, 'dark');
  });

  it('the delete confirmation opens themed with its action on the danger role', async () => {
    renderShell(LessonsLearnedPageShell, BASE, '/register');
    await settled();
    const bins = await screen.findAllByTitle('Delete a lesson that was never validated');
    fireEvent.click(bins[bins.length - 1]);
    await expectConfirmOnRoles();
  });

  it('registers every sub-page for the cold-load loaders', () => {
    PAGES.forEach(([sub]) => expectThemedPath(`${BASE}${sub}`));
  });
});
