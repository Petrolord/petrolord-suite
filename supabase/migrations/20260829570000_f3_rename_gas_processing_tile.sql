-- Facilities F3 — Gas Treating & Dehydration becomes the Gas
-- Processing Studio (HELD). Rename, not reseed: the slug carries
-- entitlements (the P9/F1/F2 precedent). Idempotent. DEPLOY GATE:
-- apply only with the prod upload that ships the F3 build.

update master_apps
   set app_name = 'Gas Processing Studio',
       description = 'Glycol dehydration with the water balance and reboiler duty split into named parts, amine sweetening from the acid-gas mole balance with customary limits offered, Kremser staged absorption, Souders-Brown contactor sizing, and Joule-Thomson dew point screening derived from the validated z-factor. Every design choice is a visible input, never a hidden constant.'
 where slug = 'gas-treating-dehydration'
   and lower(module) = 'facilities';
