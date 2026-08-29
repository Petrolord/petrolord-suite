-- Facilities F2 — Relief & Blowdown Sizer becomes the Relief & Flare
-- Studio (HELD). Rename, not reseed: the slug carries entitlements
-- (the P9/F1 precedent). Idempotent. DEPLOY GATE: apply only with the
-- prod upload that ships the F2 build.

update master_apps
   set app_name = 'Relief & Flare Studio',
       description = 'API 520 relief valve sizing for gas, liquid, steam and the API 521 fire case chained from vessel geometry to orifice, with knockout drum settling, flare radiation solved both ways, and an adiabatic blowdown march. Chart factors are typed with their references named, never read off a curve for you.'
 where slug = 'relief-blowdown-sizer'
   and lower(module) = 'facilities';
