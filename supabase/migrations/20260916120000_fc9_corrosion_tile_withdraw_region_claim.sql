-- FC9-0: correct the Corrosion & Integrity Studio tile description.
--
-- The live description advertises two things the studio no longer does
-- and one it never did correctly:
--
--   "the protective-scale correction above 60 C"
--     The scale factor does not turn on at 60 C. It turns on where
--     2400/T = 6.7 + 0.6 log10(fCO2), which at the studio's own shipped
--     conditions is 81 C, and it moves with CO2 fugacity. The engine now
--     computes the onset and the studio prints it.
--
--   "MR0175 sour-service regions from H2S partial pressure and pH"
--     WITHDRAWN. Those regions came from an expression written in the
--     engine, not read from the standard, and named material guidance was
--     served off them. The engine no longer classifies severity and no
--     longer recommends materials, so the tile must stop selling it.
--
-- Rename of the description only. The slug carries entitlements and is
-- untouched, and the app_name is unchanged. Idempotent.
--
-- No DEPLOY GATE in the usual direction: this description is LESS
-- specific than the code that ships with it, so applying it before the
-- upload understates a live app rather than advertising a route that
-- does not exist. Applying it after the FC9-0 upload is still preferred,
-- so the two land together.

update master_apps
   set description = 'CO2 corrosion screening on de Waard-Milliams 1995 in resistance-in-series form, so velocity and line size actually change the answer, with the protective-scale correction and the onset temperature computed from the correlation rather than assumed, wall shear that removes the inhibitor credit once the film is stripped, inhibitor efficiency separated from availability, an H2S screening threshold, and remaining life against a corrosion allowance. It does not classify sour-service severity, select materials, or set an inspection interval or a retirement thickness.'
 where slug = 'corrosion-rate-predictor'
   and lower(module) = 'facilities';
