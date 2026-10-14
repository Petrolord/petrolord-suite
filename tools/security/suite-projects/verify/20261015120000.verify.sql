-- Verify 20261015120000_geo_wells_name_unique_per_project.sql (read-only).
-- Expect: per_project_index=true, old_index_gone=true, index_valid=true
select
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'geo_wells_owner_project_name_uniq') as per_project_index,
  not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'geo_wells_owner_name_uniq') as old_index_gone,
  coalesce((select i.indisvalid and i.indisunique from pg_index i where i.indexrelid = to_regclass('public.geo_wells_owner_project_name_uniq')), false) as index_valid;
