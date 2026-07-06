alter table public.plant_photos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'plant_photos'
      and policyname = 'Plant photos are publicly readable during MVP'
  ) then
    create policy "Plant photos are publicly readable during MVP"
    on public.plant_photos for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'plant_photos'
      and policyname = 'Plant photos can be created during MVP'
  ) then
    create policy "Plant photos can be created during MVP"
    on public.plant_photos for insert
    to anon, authenticated
    with check (plant_id is not null);
  end if;
end;
$$;
