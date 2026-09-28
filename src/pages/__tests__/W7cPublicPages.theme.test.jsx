/**
 * Design system rollout batch 7C: the public and auth pages (sign in, sign
 * up, confirmation, forgot, set and reset password, accept invite, payment
 * verification, solutions, resources, about, careers and the legal pages)
 * wrap themselves in PublicPage. They always render light, with no toggle:
 * even a signed-in user whose own choice is dark sees them light, as the
 * homepage. Each page is checked for the scope, the ink brand bar, no legacy
 * console colour outside canvases (with a negative control) and the
 * cold-load registration. Supabase is a stand-in (accountTestKit), so
 * nothing reaches auth, an edge function or a database; the two form checks
 * at the end only prove the handlers still receive what the user typed.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return { supabase: makeSupabase({}) };
});

import {
  expectLightByDefault, expectNoLegacyChrome, expectNegativeControl, expectThemedPath,
  getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import { coldLoadTheme } from '@/design/coldLoad';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ConfirmationPage from '@/pages/auth/ConfirmationPage';
import ForgotPassword from '@/pages/ForgotPassword';
import SetPassword from '@/pages/SetPassword';
import AcceptInvite from '@/pages/auth/AcceptInvite';
import PaymentVerification from '@/pages/PaymentVerification';
import Solutions from '@/pages/Solutions';
import Resources from '@/pages/Resources';
import AboutUs from '@/pages/company/AboutUs';
import Careers from '@/pages/company/Careers';
import TermsOfService from '@/pages/legal/TermsOfService';
import PrivacyPolicy from '@/pages/legal/PrivacyPolicy';
import DataRetention from '@/pages/legal/DataRetention';
import DataProcessingAgreement from '@/pages/legal/DataProcessingAgreement';
import VerifyDeletion from '@/pages/legal/VerifyDeletion';
import VerifyExport from '@/pages/legal/VerifyExport';
import Support from '@/pages/legal/Support';
import Documentation from '@/pages/legal/Documentation';

const SIGNED_OUT = { user: null, loading: false, signIn: jest.fn(), resetPassword: jest.fn(), signOut: jest.fn() };
const SIGNED_IN = { ...SIGNED_OUT, user: { id: 'u1', email: 'dark@example.com', user_metadata: {} } };

function mount(Page, route, auth = SIGNED_OUT) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="*" element={<Page />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const PAGES = [
  ['Login', Login, '/login', 'login-theme-scope', 'Welcome back'],
  ['Signup', Signup, '/signup', 'signup-theme-scope', 'Create Your Organization Account'],
  ['Confirmation', ConfirmationPage, '/auth/confirm', 'confirmation-theme-scope', 'Check Your Email'],
  ['Forgot password', ForgotPassword, '/forgot-password', 'forgot-password-theme-scope', 'Forgot Password'],
  ['Set password', SetPassword, '/set-password', 'set-password-theme-scope', /Set Your Password|Validating Invitation/],
  ['Reset password', SetPassword, '/auth/reset-password', 'set-password-theme-scope', /Set Your Password|Validating Invitation/],
  ['Accept invite', AcceptInvite, '/auth/accept-invite', 'accept-invite-theme-scope', 'Set Your Password'],
  ['Payment verification', PaymentVerification, '/payment/verify', 'payment-verification-theme-scope', 'Verification Failed'],
  ['Solutions', Solutions, '/solutions', 'solutions-theme-scope', /modules\. One workflow\./],
  ['Resources', Resources, '/resources', 'resources-theme-scope', 'Where to learn the platform and where to get help with it.'],
  ['About us', AboutUs, '/about-us', 'about-us-theme-scope', 'About Petrolord'],
  ['Careers', Careers, '/careers', 'careers-theme-scope', 'Shape the Future of Energy'],
  ['Terms of service', TermsOfService, '/legal/terms-of-service', 'terms-theme-scope', 'Terms of Service'],
  ['Privacy policy', PrivacyPolicy, '/legal/privacy-policy', 'privacy-theme-scope', 'Privacy Policy'],
  ['Data retention', DataRetention, '/legal/data-retention', 'data-retention-theme-scope', /Data Retention/],
  ['Data processing agreement', DataProcessingAgreement, '/legal/dpa', 'dpa-theme-scope', /Data Processing Agreement/],
  ['Verify deletion', VerifyDeletion, '/legal/verify-deletion', 'verify-deletion-theme-scope', 'Verify a Certificate of Data Deletion'],
  ['Verify export', VerifyExport, '/legal/verify-export', 'verify-export-theme-scope', 'Verify a Certificate of Export'],
  ['Support', Support, '/legal/support', 'support-theme-scope', 'Support Center'],
  ['Documentation', Documentation, '/legal/documentation', 'documentation-theme-scope', /Documentation/],
];

beforeAll(() => {
  installDomShims();
  // framer-motion's whileInView (Solutions, About, Careers) needs it in jsdom
  if (!global.IntersectionObserver) {
    global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  }
});
beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* storage unavailable */ }
});
afterEach(cleanup);

describe.each(PAGES)('%s on the public frame', (name, Page, route, scopeTestId, title) => {
  const ready = async () => (await screen.findAllByText(title))[0];

  it('opens light in its scope, under the ink brand bar with the wordmark, and has no toggle', async () => {
    mount(Page, route);
    await ready();
    const scope = getScopeRoot(scopeTestId);
    expectLightByDefault(scope);
    const bar = screen.getByTestId('public-brand-bar');
    expect(bar).toHaveAttribute('data-pl-theme', 'dark');
    expect(bar.querySelector('img[src="/petrolord-suite-wordmark.png"]')).not.toBeNull();
    expect(scope.querySelector('[data-testid="theme-toggle"]')).toBeNull();
  });

  it('stays light for a signed-in user whose own choice is dark', async () => {
    window.localStorage.setItem(themeStorageKey('u1'), 'dark');
    mount(Page, route, SIGNED_IN);
    await ready();
    expect(getScopeRoot(scopeTestId)).toHaveAttribute('data-pl-theme', 'light');
  });

  it('leaves no legacy console colour outside canvases (with a negative control)', async () => {
    mount(Page, route);
    await ready();
    expectNoLegacyChrome();
    expectNegativeControl(getScopeRoot(scopeTestId));
  });

  it(`registers ${route} for the cold-load loaders, which paint it light`, () => {
    expectThemedPath(route);
    window.localStorage.setItem('petrolord.theme.v1.last', 'dark');
    expect(coldLoadTheme(route)).toBe('light');
  });
});

describe('further states', () => {
  it('the Careers application dialog is themed', async () => {
    mount(Careers, '/careers');
    fireEvent.click((await screen.findAllByText('Apply Now'))[0]);
    await screen.findByText(/Apply for Senior Reservoir Engineer/);
    expectNoLegacyChrome();
  });

  it('the public header shows the account menu trigger for a signed-in user, themed', async () => {
    mount(Solutions, '/solutions', SIGNED_IN);
    await screen.findByText('dark@example.com');
    expectNoLegacyChrome();
  });

  it('the Signup field errors and strength meter use the status roles', async () => {
    mount(Signup, '/signup');
    const pw = await screen.findByLabelText(/^Password/);
    fireEvent.change(pw, { target: { name: 'password', value: 'Abc' } });
    fireEvent.blur(pw, { target: { name: 'password', value: 'Abc' } });
    expect(await screen.findByText('Password must be at least 8 characters')).toHaveClass('text-pl-danger-text');
    expect(screen.getByText('Weak')).toHaveClass('text-pl-danger-text');
    expectNoLegacyChrome();
  });
});

describe('the auth handlers are unchanged', () => {
  it('Login passes the typed email and password to signIn', async () => {
    const signIn = jest.fn().mockResolvedValue({ error: null });
    mount(Login, '/login', { ...SIGNED_OUT, signIn });
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Login/ }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('a@b.com', 'secret-pw'));
  });

  it('Forgot password passes the typed email to resetPassword', async () => {
    const resetPassword = jest.fn().mockResolvedValue({});
    mount(ForgotPassword, '/forgot-password', { ...SIGNED_OUT, resetPassword });
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Reset Link/ }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('a@b.com'));
  });
});
