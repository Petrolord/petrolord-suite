-- MB4 (Material Balance Studio): archive the Aquifer Influx Calculator tile.
--
-- Owner decision 2026-07-18 (MB program): the standalone calculator is
-- absorbed into the Material Balance Studio's Aquifer tab as the Screening
-- segment (same client engine, now Dake-9.2-gated with finite-reD support,
-- plus case-history seeding and Use-in-model). The old route becomes a
-- redirect to the studio's Aquifer tab, so one aquifer home remains
-- (W3/W6 absorption precedent).
--
-- DEPLOY RULE (honest catalog): apply this migration WITH the production
-- upload that carries the redirect, never before. An Active tile must not
-- open a redirect on old code, and an archived tile must not strand users
-- before the redirect exists.
--
-- Row preserved; idempotent.

update public.master_apps
   set status = 'Archived',
       is_functional = false,
       is_built = false,
       description = 'Absorbed into the Material Balance Studio: the Aquifer tab''s Screening segment computes We by van Everdingen-Hurst, Carter-Tracy and Fetkovich and can write the screened parameters into the case model.'
 where slug = 'aquifer-influx-calculator'
   and lower(module) = 'reservoir'
   and status <> 'Archived';
