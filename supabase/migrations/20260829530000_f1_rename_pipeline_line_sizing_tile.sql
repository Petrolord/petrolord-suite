-- Facilities F1 — Facility Network Hydraulics becomes the Pipeline &
-- Line Sizing Studio (HELD).
--
-- Like Production P9's Advisor rename, this RENAMES rather than
-- seeding a fresh slug: facility-network-hydraulics is a live Active
-- tile that entitlements and pricing already reference, and seeding a
-- new slug while archiving the old would break access for anyone
-- holding it. The name and description follow the app: F1 rebuilt it
-- as the module flagship on validated engines (the vendored facilities
-- line-hydraulics domain + the Suite's golden-tested Beggs & Brill),
-- absorbing the scopes of the F0-retired Pipeline Sizer and Pipeline
-- Designer, whose routes redirect into this slug.
--
-- Idempotent. DEPLOY GATE: apply only with the prod upload that ships
-- the F1 build (the tile must not advertise a name production cannot
-- render yet).

update master_apps
   set app_name = 'Pipeline & Line Sizing Studio',
       description = 'Single-line sizing on validated engines: liquid lines with Colebrook-White friction, gas lines with the published Weymouth, Panhandle and General Flow equations, multiphase lines with Beggs and Brill, the API RP 14E erosional limit, elevation-profile hydraulic gradients, B31.4 and B31.8 wall thickness with MAOP, and pigging estimates fed by the computed holdup.'
 where slug = 'facility-network-hydraulics'
   and lower(module) = 'facilities';
