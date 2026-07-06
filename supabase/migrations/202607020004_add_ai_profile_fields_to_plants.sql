alter table public.plants
  add column if not exists pot_size_cm numeric,
  add column if not exists soil_type text,
  add column if not exists sunlight_exposure text,
  add column if not exists environment text,
  add column if not exists growth_stage text;
