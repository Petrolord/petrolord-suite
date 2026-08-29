-- Facilities F7 — Produced Water Treatment becomes the Produced Water
-- Treatment Studio and goes ACTIVE (HELD).
--
-- Unlike F1-F6 this tile is currently 'Coming Soon': the F0 honest
-- catalog left it there deliberately, because the app existed but its
-- engine was a table of invented removal efficiencies. F7 replaced
-- that with real droplet physics, so the tile can now say what it
-- does. Rename plus activation, not a reseed: the slug carries
-- entitlements. Idempotent.
--
-- DEPLOY GATE: apply only with the prod upload that ships the F7
-- build, per the master_apps deploy lesson (a tile must never go
-- Active before its route is on the deploy target).

update master_apps
   set app_name = 'Produced Water Treatment Studio',
       description = 'Produced water treatment on real droplet physics: a log-normal droplet distribution weighed against each device''s grade efficiency and cut size, with API 421 basins, plate packs, hydrocyclones, flotation cells and media filters sized from their own physics, and the outlet distribution carried forward so every stage faces the harder water the last one left behind.',
       status = 'Active',
       is_built = true,
       is_functional = true
 where slug = 'produced-water-treatment'
   and lower(module) = 'facilities';
