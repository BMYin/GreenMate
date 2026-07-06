alter table public.plant_events
  add column if not exists status text,
  add column if not exists priority text,
  add column if not exists due_date date,
  add column if not exists suggested_value numeric,
  add column if not exists actual_value numeric,
  add column if not exists unit text,
  add column if not exists ai_reason text,
  add column if not exists completed_at timestamptz;

-- Existing events are historical records, so preserve them as completed care.
update public.plant_events
set
  status = 'completed',
  priority = coalesce(priority, 'normal'),
  due_date = coalesce(due_date, event_date, created_at::date, current_date),
  completed_at = coalesce(completed_at, created_at)
where status is null;

alter table public.plant_events
  alter column status set default 'pending',
  alter column status set not null,
  alter column priority set default 'normal',
  alter column priority set not null,
  alter column due_date set default current_date,
  alter column due_date set not null;

create index if not exists plant_events_pending_due_date_idx
  on public.plant_events (due_date)
  where status = 'pending';
