-- W3 (Waterflood Design Studio): tile copy for the upgraded app.
--
-- The fractional-flow-calculator tile keeps its slug (it is the tile link
-- and an entitlement key) but is renamed to match the app it now opens: the
-- single-page Buckley-Leverett calculator became a full design workstation
-- (displacement + layered sweep + pattern forecast + scenarios, saved
-- projects). The relative-permeability-designer alias description follows.
--
-- DEPLOY RULE (honest catalog, R0/G0 precedent): apply this migration WITH
-- the production upload that carries the studio, never before. A tile named
-- "Studio" must not open the old calculator.
--
-- Rows preserved; idempotent.

update public.master_apps
   set app_name = 'Waterflood Design Studio',
       description = 'Buckley-Leverett displacement design, Dykstra-Parsons and Stiles layered sweep, five-spot pattern forecasting, and scenario comparison. Projects save to your account.'
 where slug = 'fractional-flow-calculator'
   and lower(module) = 'reservoir'
   and app_name <> 'Waterflood Design Studio';

update public.master_apps
   set description = 'Corey relative permeability curve design driving Buckley-Leverett fractional flow analysis. Opens the Waterflood Design Studio.'
 where slug = 'relative-permeability-designer'
   and lower(module) = 'reservoir';
