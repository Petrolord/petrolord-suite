# Contour Map Digitizer: the image kept with the project (Mapping U2-020)

Owner released 2026-10-01 ("The Mapping Digitizer image storage policy should
be applied"). Branch `feat/datum-digitizer`.

## 1. Live state read on 2026-10-02 (read-only)

- `public.contour_projects`: 0 rows. Columns include `map_image_url text` (never
  written by the current code), `geo_points jsonb`, `contours jsonb` (lines,
  faults and, since MAP-U1-006, `settings` with the image's name, width and
  height). RLS on; policies "Users can manage their own data"
  (`auth.uid() = user_id`) and the dormant "Allow admin full access". No schema
  change is needed or made.
- Storage: 18 buckets, none for the Digitizer. Private buckets with the
  owner-prefix model already exist (`wells`, `surfaces`, `culture`, `sim`,
  `seismic`). `storage.objects` has RLS on and 45 policies.
- Two of those policies are not tied to a bucket: "Allow user to update own
  files" and "Allow user to delete own files" (`auth.uid() = owner_id::uuid`).
  The update one has no `WITH CHECK` of its own, so on paper an owner could
  move one of their objects under another user's folder. The pentest shows
  this does not work against an owner-only bucket: Postgres also requires the
  moved row to be readable by the caller, and the read policy admits only the
  caller's own folder. It does work as soon as a bucket's read policy admits
  other people (pentest negative control, section 6). See section 3 for what
  that means for the organisation sharing wave and for the existing buckets
  that already let organisation members read.
- Today the Digitizer keeps the image name and size with the project and asks
  for the image again on load (MAP-U1-006).

## 2. Design

- **Bucket** `digitizer-images`: private (`public = false`, so there is no
  public URL), 25 MB per file (`file_size_limit = 26214400`), images only
  (`allowed_mime_types = image/png, image/jpeg, image/webp`). TIFF is refused
  with the reason: a browser cannot draw it on the digitizing canvas.
- **Path** `<owner user id>/<project id>/map.<ext>`: one object per project.
- **Display**: a signed URL (10 minutes) fetched into the page; nothing is
  ever linked publicly.
- **Reference**: the path is stored inside the project's own row, in
  `contours.settings.image` (`{ name, width, height, path, bucket, size, type,
  saved_at }`). No column is added.
- **Replace**: saving a project with a new image uploads it to the project's
  path (overwriting the same name; when the extension changes the new object
  is written first, then the old one is removed).
- **Delete**: deleting a project removes every object under
  `<uid>/<project id>/` first, then the row.
- **Refusals at the door** (before any upload, each with its reason): a file
  that is not PNG, JPEG or WebP by its content (the first bytes are read, the
  extension is not trusted), a file over 25 MB, a file of zero bytes.

Not in this change: organisation members reading the image of a shared
project. Digitizer projects are personal today (`contour_projects` has no
organisation column). The organisation sharing wave may extend the read
policy when it shares these projects.

## 3. Policies (migration `20261002091000_digitizer_images_bucket.sql`)

All on `storage.objects`, all for `bucket_id = 'digitizer-images'`:

| Policy | Command | Role | Rule |
|---|---|---|---|
| `digitizer_images_select_own` | select | authenticated | first folder = `auth.uid()` |
| `digitizer_images_insert_own` | insert | authenticated | first folder = `auth.uid()` |
| `digitizer_images_update_own` | update | authenticated | first folder = `auth.uid()`, before and after |
| `digitizer_images_delete_own` | delete | authenticated | first folder = `auth.uid()` |

There is no policy for `anon`, so anon reads and writes nothing in the bucket
(table grants on `storage.objects` are Supabase's and are shared by every
bucket; they are not changed). No policy of any other bucket is touched.

**For the organisation sharing wave.** If the read policy of this bucket is
ever widened so that organisation members read a shared project's image, the
bucket-less update policy of section 1 starts to let any of those members move
an object of their own under the project owner's folder. Widen the read
policy together with a restrictive update policy for the bucket:

```sql
create policy "digitizer_images_own_prefix_only"
  on storage.objects as restrictive for update to public
  using (bucket_id is distinct from 'digitizer-images'
         or coalesce((storage.foldername(name))[1] = auth.uid()::text, false))
  with check (bucket_id is distinct from 'digitizer-images'
         or coalesce((storage.foldername(name))[1] = auth.uid()::text, false));
```

**Owner item (not changed here).** The `wells`, `surfaces`, `culture` and
`seismic` buckets already have organisation-wide read policies, so the same
move is open there today: an organisation member can place a file of their
own under a colleague's shared well, surface, culture or volume folder. It
plants a file; it does not read, change or delete the colleague's objects.
The remedy is the restrictive policy above per bucket, or a `WITH CHECK` on
the two bucket-less policies. It needs its own review.

The size and MIME limits are enforced by the Storage service from the bucket
row, not by Postgres; the app checks them first so the user gets the reason.

Idempotent; one `DO` statement (one transaction however it is sent); no
`begin` or `commit` line. Owner command, from the Suite primary checkout:

```
supabase db query --linked -f supabase/migrations/20261002091000_digitizer_images_bucket.sql
```

## 4. Before and after the migration

| | Before apply (bucket missing) | After apply |
|---|---|---|
| Save | The project is saved as today (image name and size). The save says the image is not kept on this server yet | The image is uploaded with the project |
| Load | Asks for the image (today's behaviour) | The image is restored under the lines |
| Delete project | The row is deleted | The image, then the row |

The app learns the bucket is missing from the Storage service's own answer
("Bucket not found") on the first upload and stops trying for the session.

## 5. Orphans

An orphan is an object with no project row pointing at it.

- **Replace**: the new object is written before the old one is removed, and
  each save sweeps `<uid>/<project id>/` for anything that is not the current
  image, so a removal that failed once is retried on the next save.
- **Delete project**: storage first, then the row; a failed storage pass
  stops the delete, so the row stays and can be deleted again.
- **A save that uploads but then fails to record the path**: the next save
  uploads to the same name and records it.
- **Account deletion**: `contour_projects` rows cascade with the user; their
  objects do not (Supabase storage has no such cascade). They stay private
  (no policy reaches them once the user is gone). The owner can list them
  with the query below and remove them through the Storage API or dashboard.

```sql
select o.name, o.created_at, (o.metadata ->> 'size')::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'digitizer-images'
   and not exists (select 1 from public.contour_projects p
                    where p.id::text = (storage.foldername(o.name))[2]);
```

## 6. Validation

- `tools/validation/digitizer-images/run.sh`: scratch Postgres with the
  storage tables, `storage.foldername`, the live bucket-less policies and the
  live guard against direct SQL deletes. 25 checks: a wrapped begin/rollback
  leaves nothing; the single-statement dry run keeps nothing; applies twice;
  the bucket row (and a bucket made public by hand is forced back to
  private); four policies, one per command, to authenticated only; other
  buckets' policies byte-identical; the pentest green; and negative controls
  in which the pentest fails as it should (read policy widened, insert policy
  widened, read and delete widened, read policy dropped).
- `tools/validation/digitizer-images/dry-run-sql.sh`: prints the migration
  body and the pentest as ONE `DO` statement that always raises, for a dry run
  on the linked database that cannot commit however it is sent.
- `tools/validation/digitizer-images/pentest.sql`: 19 checks in one `DO` block
  that always ends by raising its result, so it cannot commit anywhere it is
  run. The owner writes, reads, replaces and deletes under their own folder;
  cannot write under another folder or at the bucket root; cannot rename or
  move an object into another user's folder; another user and anon read,
  write, change and delete nothing; a neighbouring bucket keeps working.
- `src/lib/digitizer/__tests__/imageStore.test.js`: a storage fake that mirrors
  the policies and the bucket limits.
- `e2e/contour-map-digitizer.spec.js`: the image is saved with the project and
  restored on load in the harness.

## 7. Status (2026-10-02)

- Migration file written, logged in MIGRATIONS.md as NOT APPLIED. The owner
  applies it.
- Scratch dry run and pentest: 25 of 25, pentest 19 of 19.
- Live rolled-back dry run and pentest (one statement that always raises):
  `DIGITIZER PENTEST: 19 passed, 0 failed` against the live `storage.objects`.
  Checked afterwards: 18 buckets, 45 storage policies, no `digitizer-images`
  bucket, no object. One thing the live run taught: the storage tables refuse
  a direct SQL delete unless `storage.allow_delete_query` is on, so the
  pentest turns it on for its own (always rolled back) transaction, as the
  Storage service does for its deletes.
- App: built and tested on both sides of the apply (jest
  `src/lib/digitizer/__tests__/imageStore.test.js`, 19 tests; e2e
  `e2e/contour-map-digitizer.spec.js`, including the harness with
  `?bucket=missing`).
- After the owner applies: load a real project on staging, check the image
  comes back, and flip the MIGRATIONS.md row.

Open: organisation read of a shared project's image (with the organisation
sharing wave, together with the restrictive update policy of section 3); the
bucket-less update policy on the existing organisation-readable buckets
(owner item, section 3); TIFF scans (would need conversion in the browser).
