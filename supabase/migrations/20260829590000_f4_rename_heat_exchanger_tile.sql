-- Facilities F4 — Heat Exchanger Sizer becomes the Heat Exchanger &
-- Cooling Studio (HELD). Rename, not reseed: the slug carries
-- entitlements (the P9/F1/F2/F3 precedent). Idempotent. DEPLOY GATE:
-- apply only with the prod upload that ships the F4 build.

update master_apps
   set app_name = 'Heat Exchanger & Cooling Studio',
       description = 'Shell-and-tube thermal design with the LMTD correction factor computed from its published closed form rather than typed, the overall coefficient assembled from its named resistances with the controlling one identified, tube-side film by Dittus-Boelter, TEMA-style bundle geometry, effectiveness-NTU rating with each arrangement''s ceiling named, and air-cooler sizing with the hot-day capacity derate.'
 where slug = 'heat-exchanger-sizer'
   and lower(module) = 'facilities';
