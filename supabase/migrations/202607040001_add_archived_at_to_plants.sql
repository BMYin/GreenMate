alter table public.plants
add column if not exists archived_at timestamptz;
