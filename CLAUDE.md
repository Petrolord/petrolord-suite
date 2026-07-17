# Petrolord Suite — Claude Code conventions

## What this repo is
Multi-app petroleum engineering platform: React 18 + Vite SPA (`src/`),
60+ apps as routes under `src/pages/apps/` with components under
`src/components/`. Backend is Supabase: Postgres + Auth + RLS + Edge
Functions (`supabase/functions/`, shared math in
`supabase/functions/_shared/`). Payments: Paystack.

## Environments
- Staging: Vite dev server on a bind mount of this worktree
  (suite.studio.petrolord.com). Edits are live via HMR immediately —
  a broken file is broken in staging instantly.
- Production: `npm run build` → dist → manual upload to Horizons
  (petrolord.com). Production is a static SPA + Supabase only.
- Engine edits are NOT deployed by committing: Edge Functions redeploy via
  `supabase functions deploy <name>`.

## Database rules (Petrolord_Database_Conventions)
- Product-prefixed tables: seismic_*, mbal_*, dca_*, epe_*, hse_*.
- Shared tables (organizations, users, invitations, onboarding): schema
  changes require a second engineer's review. Never change unilaterally.
- All schema changes are migration files, applied staging-first. Never
  hand-type DDL against production.
- Log every migration in MIGRATIONS.md.

## Conventions
- Follow existing app patterns: pick 2–3 apps in src/pages/apps/ as
  structural reference before creating a new one.
- Validation-first engine work: engine math validates against published /
  known-truth references before any tier promotion (see
  tools/validation/mbal-validation.ts as the exemplar).
- Per-app status docs live at docs/scope/<App>-STATUS.md. Update the
  relevant STATUS.md at the end of any significant work.
- Use the repo's existing test runner (check jest.config.js) — do not
  introduce a new one.
- No new Monte Carlo or NPV implementations; import canonical modules
  (docs/scope/ReservoirEngineering-Module.md §5: ReservoirCalc Pro's
  MonteCarloEngine.js for MC; npvCalculations.js calculateEconomics /
  epe-cash-flow-engine for NPV).
- Commit per completed sub-task; conventional commit messages; never
  commit on main directly — branch + PR (origin: Petrolord org on GitHub).

## Never
- Never commit secrets. .env* files are untracked by policy; .env.example
  is the only tracked env file.
- Never track build output (dist/) or dependencies (node_modules/).
- Never run DDL against the shared production database without following
  the conventions above.

## App-specific playbooks
- Seismolord (seismic interpretation): docs/scope/Seismolord-PLAYBOOK.md —
  read it before any Seismolord work.

## Known issues (as of 2026-07-10)
- node_modules/ is historically tracked in git (~64k files) even though
  .gitignore lists it — this is why git status shows node_modules noise.
  Do NOT commit node_modules changes; untracking it (git rm -r --cached
  node_modules) is a pending cleanup decision, not yet done.
- MIGRATIONS.md is referenced above but doesn't exist yet — create it when
  logging the first migration.
