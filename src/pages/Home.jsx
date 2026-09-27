import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Menu, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import BookDemoModal from '@/components/BookDemoModal';
import { SUITE_MODULES, suiteStats, NEXTGEN_LIVE_COURSES } from '@/data/suiteCatalog';
import { MODULE_PRICING, SEAT_TIERS } from '@/data/pricingModels';
import './Home.css';

// Public homepage, redesigned 2026-09-27 as a sibling of the NextGen Academy
// homepage (same certificate brand pack: petrol-green ink, gold, ivory).
// Every number on it is derived: app and module counts from
// src/data/suiteCatalog.js, prices from src/data/pricingModels.js (the
// client copy of pricing_config). Copy follows the owner style rule: no em
// dashes and no "X, not Y" constructions.

const LOGO = '/petrolord-icon.png';
const NEXTGEN_URL = 'https://nextgen.petrolord.com';
const HSE_URL = 'https://hse.petrolord.com';

// Per-app list prices on the live Active tiles (master_apps.price), checked
// 2026-09-27. The quote reads the tile price itself; this is display only.
const APP_PRICE_RANGE = [499, 899];

const NAV = [
  ['#modules', 'Modules'],
  ['#platform', 'Why Petrolord'],
  ['#pricing', 'Pricing'],
  ['#family', 'Academy & HSE'],
  ['#trust', 'Your Data'],
];

const usd = (n) => `$${n.toLocaleString('en-US')}`;

const PILLARS = [
  {
    n: '01',
    title: 'Engines you can check',
    body: 'The calculations behind each studio are tested against published references and known answers before the app is released, and those tests stay in place to guard every later change.',
  },
  {
    n: '02',
    title: 'One project, many studios',
    body: 'Wells, tops, surfaces and interpretations are published to shared registries, so an interpretation made in one studio is ready in the next.',
  },
  {
    n: '03',
    title: 'Nothing to install',
    body: 'The whole suite runs in a modern browser. New releases reach every seat at once, and there are no licence servers or dongles to manage.',
  },
  {
    n: '04',
    title: 'Help where you work',
    body: 'The studios carry built-in help guides, and the flagship apps come with full user manuals. NextGen Academy teaches the apps on the same screens.',
  },
];

const TRUST = [
  {
    title: 'Export any time',
    body: 'Organisation admins can download a complete copy of every record and stored file in minutes, any day, for any reason. It doubles as an off-platform backup.',
  },
  {
    title: 'Isolated by design',
    body: 'Each organisation’s data is kept apart at the database level with row security, and exports never include credentials or tokens.',
  },
  {
    title: 'Deletion you can prove',
    body: 'Account closure has a 30 day grace period, a verified purge and a Certificate of Data Deletion that anyone can check on our public verifier.',
  },
];

// Sample decline for the hero illustration: an Arps hyperbolic curve
// (qi 1,200 bbl/d, Di 0.06 per month, b 0.8) with lightly scattered history.
const DECLINE = (() => {
  const q = (t) => 1200 / (1 + 0.8 * 0.06 * t) ** (1 / 0.8);
  const W = 300; const H = 120; const T = 60;
  const x = (t) => (t / T) * W;
  const y = (v) => H - (v / 1300) * H;
  const curve = Array.from({ length: 61 }, (_, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(q(t)).toFixed(1)}`).join(' ');
  const jitter = [0.04, -0.05, 0.02, 0.06, -0.03, 0.05, -0.06, 0.01, 0.04, -0.02, 0.03, -0.04, 0.05, -0.01, 0.02, -0.05, 0.03, 0.01];
  const points = jitter.map((j, i) => {
    const t = i * 2 + 1;
    return [x(t), y(q(t) * (1 + j))];
  });
  return { curve, points, splitX: x(36) };
})();

function SuiteWindow() {
  return (
    <div className="window" aria-label="Illustration of the Petrolord Suite workspace">
      <div className="win-bar">
        <span className="dots"><i /><i /><i /></span>
        <span className="win-title">Petrolord Suite · Sample Field</span>
      </div>
      <div className="win-body">
        <ul className="win-rail">
          {SUITE_MODULES.slice(0, 7).map((m, i) => (
            <li key={m.slug} className={i === 1 ? 'on' : undefined}>
              <span>{m.short}</span><em>{m.apps.length}</em>
            </li>
          ))}
          <li className="more">+ {SUITE_MODULES.length - 7} more</li>
        </ul>
        <div className="win-main">
          <div className="win-crumb">Reservoir · Decline Curve Analysis · Well A-12</div>
          <div className="chart-card">
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label="Sample hyperbolic decline fit">
              {[30, 60, 90].map((gy) => <line key={gy} x1="0" x2="300" y1={gy} y2={gy} className="grid" />)}
              <rect x={DECLINE.splitX} y="0" width={300 - DECLINE.splitX} height="120" className="fc-zone" />
              <path d={DECLINE.curve} className="fit" />
              {DECLINE.points.map(([px, py]) => <circle key={px} cx={px} cy={py} r="2.3" className="pt" />)}
            </svg>
            <div className="legend"><span><i className="l-pt" />History</span><span><i className="l-fit" />Hyperbolic fit</span><span><i className="l-fc" />Forecast</span></div>
          </div>
          <div className="win-kpis">
            <div><small>Initial rate</small><b>1,200 bbl/d</b></div>
            <div><small>b factor</small><b>0.80</b></div>
            <div><small>Initial decline</small><b>6% a month</b></div>
          </div>
        </div>
      </div>
      <span className="win-sample">Sample data</span>
    </div>
  );
}

function ModuleCatalogue({ onOpen }) {
  const [active, setActive] = useState('all');
  const [term, setTerm] = useState('');
  const q = term.trim().toLowerCase();
  const mod = SUITE_MODULES.find((m) => m.slug === active);
  const stats = suiteStats();

  const hits = q
    ? SUITE_MODULES.flatMap((m) => m.apps.filter((a) => `${a} ${m.name}`.toLowerCase().includes(q)).map((a) => ({ app: a, mod: m })))
    : [];

  return (
    <>
      <div className="cat-top">
        <div className="tabs" role="tablist" aria-label="Modules">
          {[{ slug: 'all', short: 'All modules', apps: { length: stats.apps } }, ...SUITE_MODULES].map((m) => (
            <button
              key={m.slug}
              type="button"
              role="tab"
              className="tab"
              aria-selected={!q && active === m.slug}
              onClick={() => { setActive(m.slug); setTerm(''); }}
            >
              {m.short}<span className="c">{m.apps.length}</span>
            </button>
          ))}
        </div>
        <label className="search" htmlFor="home-app-search">
          <Search className="w-4 h-4" aria-hidden="true" />
          <input
            id="home-app-search"
            type="search"
            placeholder="Search apps, e.g. gas lift"
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
      </div>

      <div aria-live="polite">
        {q ? (
          <div className="hits">
            {hits.length === 0 && <p className="empty">No app matches that search yet. Try a broader word, or browse by module.</p>}
            {hits.map(({ app, mod: m }) => (
              <button type="button" className="hit" key={`${m.slug}-${app}`} onClick={() => { setActive(m.slug); setTerm(''); }}>
                <span className="mod">{m.name}</span>
                <b>{app}</b>
              </button>
            ))}
          </div>
        ) : mod ? (
          <article className="mod-panel">
            <div className="mod-intro">
              <p className="eyebrow">{mod.apps.length} apps live</p>
              <h3>{mod.name}</h3>
              <p className="tag">{mod.tagline}</p>
              <p>{mod.description}</p>
              <div className="mod-price">
                <span>Whole module</span>
                <strong>{usd(MODULE_PRICING[mod.slug])}<small> a month</small></strong>
                <span>includes every app listed here</span>
              </div>
              <button type="button" className="btn btn-ink" onClick={() => onOpen(mod)}>
                Open {mod.short} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <ol className="app-list">
              {mod.apps.map((a, i) => (
                <li key={a}><span className="n">{String(i + 1).padStart(2, '0')}</span>{a}</li>
              ))}
            </ol>
          </article>
        ) : (
          <div className="mod-grid">
            {SUITE_MODULES.map((m) => (
              <button type="button" className="mod-card" key={m.slug} onClick={() => setActive(m.slug)}>
                <span className="count">{m.apps.length} apps</span>
                <h4>{m.name}</h4>
                <p>{m.tagline}</p>
                <span className="peek">{m.apps.slice(0, 3).join(' · ')}</span>
                <span className="go">See all {m.apps.length} <ArrowRight className="w-3.5 h-3.5" /></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const stats = suiteStats();

  const prices = Object.values(MODULE_PRICING);
  const moduleFrom = Math.min(...prices);
  const moduleTo = Math.max(...prices);
  const seatHigh = SEAT_TIERS[0].price;
  const seatLow = SEAT_TIERS[SEAT_TIERS.length - 1].price;

  const quote = () => navigate(user ? '/dashboard/get-quote' : '/signup');
  const openModule = (m) => navigate(user ? `/dashboard/${m.slug}` : '/signup');
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="suite-home">
      <Helmet>
        <title>Petrolord Suite | Engineering software for the whole energy asset</title>
        <meta
          name="description"
          content={`${stats.apps} engineering applications across ${stats.modules} modules, from seismic interpretation and reservoir simulation to facilities, process safety, refining and economics. Browser based, with calculation engines checked against published references.`}
        />
      </Helmet>

      <header className="site">
        <div className="wrap nav">
          <Link className="brand" to="/" aria-label="Petrolord Suite home">
            <span className="crest"><img src={LOGO} alt="" /></span>
            <span>Petrolord <em>Suite</em></span>
          </Link>
          <nav className="links" aria-label="Main">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="nav-cta">
            {user ? (
              <Link className="btn btn-gold" to="/dashboard">Dashboard</Link>
            ) : (
              <>
                <Link className="login" to="/login">Log in</Link>
                <Link className="btn btn-gold" to="/signup">Get started</Link>
              </>
            )}
            <button
              type="button"
              className="menu-btn"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        <nav className={`mobile-menu${menuOpen ? ' open' : ''}`} aria-label="Mobile">
          {NAV.map(([href, label]) => <a key={href} href={href} onClick={closeMenu}>{label}</a>)}
          {!user && <Link to="/login" onClick={closeMenu}>Log in</Link>}
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <p className="eyebrow">The Petrolord Suite</p>
              <h1>Every discipline of the asset, <em>in one engineering suite.</em></h1>
              <p className="lede">
                {stats.apps} engineering applications across {stats.modules} modules, from seismic interpretation and
                reservoir simulation to process safety, refining and economics. They share one project database, run in
                your browser, and stand on calculation engines checked against published references.
              </p>
              <div className="ctas">
                {user ? (
                  <Link className="btn btn-gold" to="/dashboard">Open your dashboard <ArrowRight className="w-4 h-4" /></Link>
                ) : (
                  <button type="button" className="btn btn-gold" onClick={quote}>Get an instant quote <ArrowRight className="w-4 h-4" /></button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => setDemoOpen(true)}>Book a demo</button>
              </div>
              <p className="fine">Pricing is published. <a href="#pricing">See what a module costs</a> before you talk to anyone.</p>
            </div>
            <SuiteWindow />
          </div>
          <div className="ledger">
            <ul className="wrap" aria-label="The Suite at a glance">
              <li><strong>{stats.apps}</strong><span>engineering applications live today</span></li>
              <li><strong>{stats.modules}</strong><span>modules across the energy value chain</span></li>
              <li><strong>1</strong><span>sign-in for every studio your organisation licenses</span></li>
              <li><strong>{NEXTGEN_LIVE_COURSES}</strong><span>NextGen Academy courses taught on these apps</span></li>
              <li><strong>0</strong><span>software to install. It runs in the browser</span></li>
            </ul>
          </div>
        </section>

        <section className="block cat-bg" id="modules">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">The modules</p>
              <h2>{stats.modulesWord} modules. {stats.apps} apps. One workflow from seismic to sales.</h2>
              <p>Every app listed here is live and ready to use. Choose a module to see its applications, or search for the tool you need.</p>
            </div>
            <ModuleCatalogue onOpen={openModule} />
          </div>
        </section>

        <section className="block" id="platform">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">Why Petrolord</p>
              <h2>Built the way engineering software should be.</h2>
              <p>An answer is only useful if you can trust it, share it and find it again next quarter.</p>
            </div>
            <ol className="pillars">
              {PILLARS.map((p) => (
                <li key={p.n}><span className="n">{p.n}</span><h3>{p.title}</h3><p>{p.body}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="block price-sec" id="pricing">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">Pricing</p>
              <h2>Published prices. <em>An instant quote.</em></h2>
              <p>Build a quote in a few minutes and see every line before you pay. There is no sales call standing between you and the number.</p>
            </div>
            <div className="plans">
              <article className="plan feature">
                <p className="eyebrow">Best value</p>
                <h3>A whole module</h3>
                <strong>from {usd(moduleFrom)}<small> a month</small></strong>
                <p>Every app in the module is included, so a module costs about what three of its apps would on their own. Module prices run from {usd(moduleFrom)} to {usd(moduleTo)} a month.</p>
              </article>
              <article className="plan">
                <p className="eyebrow">A la carte</p>
                <h3>Single apps</h3>
                <strong>{usd(APP_PRICE_RANGE[0])} to {usd(APP_PRICE_RANGE[1])}<small> a month</small></strong>
                <p>Pick only the studios you need. Each app is priced on its own, and you can move up to the full module later.</p>
              </article>
              <article className="plan">
                <p className="eyebrow">Your team</p>
                <h3>User seats</h3>
                <strong>{usd(seatHigh)} down to {usd(seatLow)}<small> a seat</small></strong>
                <p>Seats are priced monthly in volume bands, so each additional seat on an app costs less than the one before.</p>
              </article>
            </div>
            <div className="plan-foot">
              <p>Pay monthly, or save 10% on quarterly and 15% on annual billing. Quotes itemise modules, apps, seats and 7.5% VAT, and are paid through secure online checkout.</p>
              <button type="button" className="btn btn-ink" onClick={quote}>Build your quote <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        </section>

        <section className="block" id="family">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">The Petrolord family</p>
              <h2>Train the people. Protect the workforce.</h2>
            </div>
            <div className="family">
              <article className="ng">
                <p className="eyebrow">NextGen Academy</p>
                <h3>Learn on the same apps you will work with.</h3>
                <p>{NEXTGEN_LIVE_COURSES} hands-on courses taught inside the Suite, from geoscience to HSE. Each has Associate, Professional and Expert tiers, earned on auto-graded practicals.</p>
                <ul>
                  <li>Certificates anyone can verify on a public register</li>
                  <li>Employers sponsor seats and follow every learner&apos;s progress</li>
                  <li>Expert certificate holders receive a 50% code toward a Suite module</li>
                </ul>
                <div className="actions"><a className="btn btn-gold" href={NEXTGEN_URL}>Visit NextGen Academy <ArrowRight className="w-4 h-4" /></a></div>
              </article>
              <article className="hse">
                <p className="eyebrow">Petrolord HSE</p>
                <h3>Health, safety, security and environment in one place.</h3>
                <p>Incident reporting, permit to work, and audits and inspections, built for the whole workforce.</p>
                <ul>
                  <li>Free to start, with a Professional plan as your team grows</li>
                  <li>Professional plans bought and renewed online</li>
                  <li>Its own portal at hse.petrolord.com</li>
                </ul>
                <div className="actions"><a className="btn btn-ink" href={HSE_URL}>Explore Petrolord HSE <ArrowRight className="w-4 h-4" /></a></div>
              </article>
            </div>
          </div>
        </section>

        <section className="block flush" id="trust">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">Your data</p>
              <h2>Everything your team creates stays yours.</h2>
              <p>And you can prove it, from the first export to the last deletion certificate.</p>
            </div>
            <div className="trust">
              {TRUST.map((t) => (
                <article key={t.title}><span className="tick"><Check className="w-4 h-4" /></span><h3>{t.title}</h3><p>{t.body}</p></article>
              ))}
            </div>
            <p className="trust-links">
              <Link to="/legal/data-retention">Data Retention &amp; Offboarding policy</Link>
              <Link to="/legal/dpa">Data Processing Agreement</Link>
              <Link to="/legal/verify-deletion">Verify a deletion certificate</Link>
            </p>
          </div>
        </section>

        <section className="block final" id="contact">
          <div className="wrap">
            <p className="eyebrow">Start today</p>
            <h2>Put the whole asset team on <em>one suite.</em></h2>
            <p>Build a quote in minutes, or ask us for a walkthrough on your own field data.</p>
            <div className="ctas">
              <button type="button" className="btn btn-gold" onClick={quote}>Get an instant quote</button>
              <button type="button" className="btn btn-ghost" onClick={() => setDemoOpen(true)}>Book a demo</button>
            </div>
            <p className="contact-line">
              <a href="mailto:info@petrolord.com">info@petrolord.com</a> · <a href="mailto:info@lordswayenergy.com">info@lordswayenergy.com</a> · +234 901 556 6981 · +44 7403 660720
            </p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-grid">
          <div>
            <Link className="brand" to="/">
              <span className="crest"><img src={LOGO} alt="" /></span>
              <span>Petrolord <em>Suite</em></span>
            </Link>
            <p>Engineering software for the whole energy asset, from subsurface to sales. A Lordsway Energy company.</p>
          </div>
          <FooterCol title="Platform">
            <Link to="/solutions">Solutions</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/legal/documentation">Documentation</Link>
            <a href={NEXTGEN_URL}>NextGen Academy</a>
            <a href={HSE_URL}>Petrolord HSE</a>
          </FooterCol>
          <FooterCol title="Company">
            <Link to="/about-us">About Us</Link>
            <Link to="/careers">Careers</Link>
            <Link to="/legal/support">Contact &amp; Support</Link>
            <a href="mailto:info@petrolord.com">info@petrolord.com</a>
          </FooterCol>
          <FooterCol title="Legal">
            <Link to="/legal/terms-of-service">Terms of Service</Link>
            <Link to="/legal/privacy-policy">Privacy Policy</Link>
            <Link to="/legal/data-retention">Data Retention &amp; Offboarding</Link>
            <Link to="/legal/dpa">Data Processing Agreement</Link>
          </FooterCol>
          <FooterCol title="Offices">
            <p>8 The Providence Street, Lekki Phase 1, Lagos, Nigeria</p>
            <p>128 City Road, London EC1V 2NX, United Kingdom</p>
          </FooterCol>
        </div>
        <div className="wrap foot-bottom">
          <span>© {new Date().getFullYear()} Lordsway Energy. All rights reserved.</span>
        </div>
      </footer>

      <BookDemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}

function FooterCol({ title, children }) {
  return (
    <div className="foot-col">
      <h5>{title}</h5>
      {children}
    </div>
  );
}

export default Home;
