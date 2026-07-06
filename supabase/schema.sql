create extension if not exists pgcrypto;

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  species text,
  location text,
  growing_setup text,
  pot_size_cm numeric,
  soil_type text,
  sunlight_exposure text,
  environment text,
  growth_stage text,
  status text default 'healthy',
  notes text,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.plant_photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  image_url text not null,
  taken_at timestamptz default now(),
  ai_health_score integer,
  ai_status text,
  ai_summary text,
  ai_suggestions text,
  created_at timestamptz default now()
);

create table public.plant_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  photo_id uuid references public.plant_photos(id) on delete set null,
  event_type text not null,
  title text not null,
  notes text,
  event_date date default current_date,
  status text not null default 'pending',
  priority text not null default 'normal',
  due_date date not null default current_date,
  suggested_value numeric,
  actual_value numeric,
  unit text,
  ai_reason text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plants_set_updated_at
before update on public.plants
for each row
execute function public.set_updated_at();

create index plant_photos_plant_id_idx on public.plant_photos(plant_id);
create index plant_events_plant_id_idx on public.plant_events(plant_id);
create index plant_events_event_date_idx on public.plant_events(event_date);
create index plant_events_pending_due_date_idx
  on public.plant_events(due_date)
  where status = 'pending';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plant-photos',
  'plant-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
);

create policy "Plant photos are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'plant-photos');

create policy "Plant photos can be uploaded during MVP"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'plant-photos');

alter table public.plant_photos enable row level security;

create policy "Plant photos are publicly readable during MVP"
on public.plant_photos for select
to anon, authenticated
using (true);

create policy "Plant photos can be created during MVP"
on public.plant_photos for insert
to anon, authenticated
with check (plant_id is not null);
