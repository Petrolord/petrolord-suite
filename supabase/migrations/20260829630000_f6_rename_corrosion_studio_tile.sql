-- Facilities F6 — Corrosion Rate Predictor becomes the Corrosion &
-- Integrity Studio (HELD). Rename, not reseed: the slug carries
-- entitlements (the P9/F1-F5 precedent). Idempotent. DEPLOY GATE:
-- apply only with the prod upload that ships the F6 build.

update master_apps
   set app_name = 'Corrosion & Integrity Studio',
       description = 'CO2 corrosion screening on de Waard-Milliams 1995 in resistance-in-series form, so velocity and line size actually change the answer, with the protective-scale correction above 60 C, wall shear against inhibitor film survival, inhibitor efficiency separated from availability, MR0175 sour-service regions from H2S partial pressure and pH, and remaining life against a corrosion allowance.'
 where slug = 'corrosion-rate-predictor'
   and lower(module) = 'facilities';
