insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plant-photos',
  'plant-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Plant photos are publicly readable'
  ) then
    create policy "Plant photos are publicly readable"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'plant-photos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Plant photos can be uploaded during MVP'
  ) then
    create policy "Plant photos can be uploaded during MVP"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'plant-photos');
  end if;
end;
$$;
