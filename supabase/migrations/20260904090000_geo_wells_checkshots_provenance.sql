-- Petrophysics PT1 (2026-09-03): how a well's checkshot table was entered.
--
-- Shared table (geo_wells): additive nullable column, no rewrite, no RLS or
-- index change; still needs the second-engineer review the database
-- conventions require before apply.
--
-- geo_wells.checkshots keeps its stored core [{tvdss_m, twt_ms}] (every
-- time-depth reader depends on it) and may now carry md_m per row. This
-- column records the convention the user entered the table in and the KB
-- and survey the stored TVDSS was derived against, so the table displays
-- as entered and re-derives after KB or survey edits:
--   { "units_in": {"depth_ref": "md"|"tvd"|"tvdss", "time": "owt"|"twt",
--                  "depth_unit": "m"|"ft"},
--     "source": "well-import"|"wdm-edit"|"well-planning-borrow"|"pld-import"|"legacy",
--     "kb_m_used": number, "deviation_stations_used": integer,
--     "edited_at": iso timestamp, "note": text (optional) }
-- NULL means a pre-PT1 table: read as TVDSS / TWT / metres and labelled so.
-- Writers: src/lib/wellsRegistry.js saveWell / updateWellData (both retry
-- without the column while it is absent, so nothing breaks before apply).

alter table public.geo_wells add column if not exists checkshots_provenance jsonb;

comment on column public.geo_wells.checkshots_provenance is
  'PT1: convention the checkshot table was entered in (units_in.depth_ref md|tvd|tvdss, units_in.time owt|twt, units_in.depth_unit m|ft), source, kb_m_used, deviation_stations_used, edited_at; NULL = legacy TVDSS/TWT/m';
