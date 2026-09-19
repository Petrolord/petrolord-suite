# Rolling back Migration B (20260919170000)

B is per-table, so roll back per table, not wholesale. If one app breaks
after B, for THAT table only (example: work_permits):

```sql
begin;
alter table public.work_permits disable row level security;
grant select, insert, update, delete on table public.work_permits to authenticated;
commit;
```

That returns the table to the post-A state (anon still has nothing;
every signed-in user of every org can read and write it again), which is
the state to report back to the author with the failing request. Do NOT
grant anything back to anon.

For manual_verify_quote, if a signed-in caller turns out to exist:
`grant execute on function public.manual_verify_quote(text, uuid) to authenticated;`
