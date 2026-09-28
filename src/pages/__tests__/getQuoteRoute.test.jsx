/**
 * Get a quote goes to the working quote-and-pay flow.
 *
 * The old configurator (src/pages/GetQuote.jsx) builds its module list from
 * appCategories in src/data/applications.js, which is an empty list, so it
 * showed no modules and Next stayed disabled: a customer could not get a
 * quote there. The first test pins that, using the real applications.js,
 * so nobody re-points a route at the old page by accident.
 *
 * The working flow is the upgrade page (QuoteBuilder at /dashboard/upgrade),
 * which reads the live catalogue and generate-quote prices server side. The
 * homepage CTA, the old /dashboard/get-quote route, the old public
 * /get-quote promo share links and the admin share-link builder all land
 * there now.
 */
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return { supabase: makeSupabase({}, {}) };
});

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

function Landing() {
  const location = useLocation();
  return (
    <div data-testid="landed">
      {location.pathname}
      {location.search}
      {location.state ? `|${JSON.stringify(location.state)}` : ''}
    </div>
  );
}

describe('the old configurator is a dead end with the real catalogue', () => {
  it('shows no modules and cannot move past step 1', async () => {
    const { appCategories } = jest.requireActual('@/data/applications');
    expect(appCategories).toEqual([]);

    const GetQuote = require('@/pages/GetQuote').default;
    const { renderAccountPage } = require('./accountTestKit');
    renderAccountPage(GetQuote);
    await screen.findByText('Select Modules');
    expect(screen.queryAllByText(/Starts at/)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });
});

describe('GetQuoteRedirect', () => {
  const renderAt = (entry) => {
    const GetQuoteRedirect = require('@/pages/GetQuoteRedirect').default;
    return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/get-quote" element={<GetQuoteRedirect />} />
        <Route path="/dashboard/get-quote" element={<GetQuoteRedirect />} />
        <Route path="/dashboard/upgrade" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
    );
  };

  it('sends /dashboard/get-quote to the upgrade page', () => {
    renderAt('/dashboard/get-quote');
    expect(screen.getByTestId('landed')).toHaveTextContent(/^\/dashboard\/upgrade$/);
  });

  it('keeps the query string, so old promo share links carry their code', () => {
    renderAt('/get-quote?promo=EARLY20');
    expect(screen.getByTestId('landed')).toHaveTextContent('/dashboard/upgrade?promo=EARLY20');
  });

  it('keeps router state', () => {
    renderAt({ pathname: '/dashboard/get-quote', state: { targetOrgId: 'o9' } });
    expect(screen.getByTestId('landed')).toHaveTextContent('/dashboard/upgrade|{"targetOrgId":"o9"}');
  });
});

describe('every link to get a quote lands on the upgrade page', () => {
  it('the app routes map both get-quote paths to the redirect, and nothing routes to the old page', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/<Route path="get-quote" element={<GetQuoteRedirect \/>} \/>/);
    expect(app).toMatch(/<Route path="\/get-quote" element={<GetQuoteRedirect \/>} \/>/);
    expect(app).not.toMatch(/import\('@\/pages\/GetQuote'\)/);
    expect(app).not.toMatch(/<GetQuote \/>/);
  });

  it('the admin promo share link points at the upgrade page', () => {
    const promo = read('pages/admin/PromoCodes.jsx');
    expect(promo).toContain('/dashboard/upgrade?promo=');
    expect(promo).not.toContain('/get-quote');
  });

  it('no source file outside the old page links to get-quote', () => {
    const offenders = [];
    const walk = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) {
          if (d.name !== '__tests__') walk(p);
          return;
        }
        if (!/\.(jsx?|tsx?)$/.test(d.name)) return;
        const rel = path.relative(path.join(__dirname, '..', '..'), p);
        // The old page itself, the redirect, the route table (checked above)
        // and the W3F theme path list are the only places allowed to say it.
        if (['pages/GetQuote.jsx', 'pages/GetQuoteRedirect.jsx', 'App.jsx', 'design/rollout/w3f.js'].includes(rel)) return;
        const src = fs.readFileSync(p, 'utf8');
        if (/['"`/]get-quote/.test(src)) {
          offenders.push(rel);
        }
      });
    };
    walk(path.join(__dirname, '..', '..'));
    expect(offenders).toEqual([]);
  });
});

describe('the homepage Get a quote button', () => {
  it('takes a signed-in visitor to the upgrade page', async () => {
    const { AuthContext } = require('@/contexts/SupabaseAuthContext');
    const Home = require('@/pages/Home').default;
    render(
      <AuthContext.Provider value={{ user: { id: 'u1', email: 'ada@example.com' }, loading: false }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard/upgrade" element={<Landing />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Get an instant quote/ }));
    expect(await screen.findByTestId('landed')).toHaveTextContent(/^\/dashboard\/upgrade$/);
  });
});
