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
  Because the update one has no `WITH CHECK` of its own, a signed-in user can
  move an object they own into any bucket under any path. That matters for the
  claim "an owner writes only their own prefix", so this migration closes it
  for the new bucket (section 3). The same gap in the existing buckets is
  listed as an owner item; it is not changed here.
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
| `digitizer_images_own_prefix_only` | update, **restrictive** | everyone | a row in this bucket, before or after the update, sits under the caller's own folder |

There is no policy for `anon`, so anon reads and writes nothing in the bucket
(table grants on `storage.objects` are Supabase's and are shared by every
bucket; they are not changed). The restrictive policy is the one that stops an
object being moved into this bucket under someone else's folder through the
bucket-less update policy named in section 1. It is true for every row outside
this bucket, so no other bucket's behaviour changes.

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
  storage tables, `storage.foldername` and the live bucket-less policies.
  Applies the migration twice, checks the bucket row and the five policies,
  runs `pentest.sql`, and runs it again with the restrictive policy dropped
  to show that the "moved into another user's folder" check then fails
  (negative control).
- `tools/validation/digitizer-images/pentest.sql`: one `DO` block that always
  ends by raising its result, so it cannot commit anywhere it is run.
- `src/lib/digitizer/__tests__/imageStore.test.js`: a storage fake that mirrors
  the policies and the bucket limits.
- `e2e/contour-map-digitizer.spec.js`: the image is saved with the project and
  restored on load in the harness.

## 7. Status

See the end of this file (filled in as the work lands).
