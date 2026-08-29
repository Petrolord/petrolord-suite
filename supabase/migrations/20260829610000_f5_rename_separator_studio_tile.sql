-- Facilities F5 — Separator & Slug Catcher Designer becomes the
-- Separator & Slug Catcher Studio (HELD). Rename, not reseed: the slug
-- carries entitlements (the P9/F1-F4 precedent). Idempotent. DEPLOY
-- GATE: apply only with the prod upload that ships the F5 build.

update master_apps
   set app_name = 'Separator & Slug Catcher Studio',
       description = 'API 12J and GPSA vessel sizing: Souders-Brown gas capacity with the K derated for pressure and the z-factor from the validated correlation, exact circular-segment geometry at the actual liquid level, three-phase sizing that solves the oil and water retention times against one vessel and checks whether the droplets can actually cross their layers, the L/D family as a table, and vessel or finger slug catchers.'
 where slug = 'separator-slug-catcher-designer'
   and lower(module) = 'facilities';
