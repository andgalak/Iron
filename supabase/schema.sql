-- IRON database schema for Supabase.
-- Paste this entire file into Supabase Dashboard → SQL Editor → New query → Run.
-- Re-running is safe: every statement uses IF NOT EXISTS or CREATE OR REPLACE.

-- ────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  date timestamptz not null,
  elapsed integer not null default 0,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);

create table if not exists public.diet_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('green','yellow','red')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.activity_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('green','yellow','red')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  mins integer not null,
  label text not null default 'Deep work',
  created_at timestamptz not null default now()
);
create index if not exists focus_sessions_user_date_idx on public.focus_sessions (user_id, date desc);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  cols jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_exercises (
  id text primary key,                              -- e.g. cx_abc123
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle text not null,
  cat text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Each table only lets a user read/write rows where user_id = auth.uid().
-- ────────────────────────────────────────────────────────────────────────────

alter table public.workouts         enable row level security;
alter table public.diet_log         enable row level security;
alter table public.activity_log     enable row level security;
alter table public.focus_sessions   enable row level security;
alter table public.boards           enable row level security;
alter table public.custom_exercises enable row level security;

-- Drop existing policies (so this script is re-runnable) then recreate
drop policy if exists "own rows: workouts"         on public.workouts;
drop policy if exists "own rows: diet_log"         on public.diet_log;
drop policy if exists "own rows: activity_log"     on public.activity_log;
drop policy if exists "own rows: focus_sessions"   on public.focus_sessions;
drop policy if exists "own rows: boards"           on public.boards;
drop policy if exists "own rows: custom_exercises" on public.custom_exercises;

create policy "own rows: workouts"
  on public.workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows: diet_log"
  on public.diet_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows: activity_log"
  on public.activity_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows: focus_sessions"
  on public.focus_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows: boards"
  on public.boards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows: custom_exercises"
  on public.custom_exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- ONBOARDING: when a new user signs up, give them the default kanban boards
-- so the Focus tab isn't empty.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.boards (user_id, name, color, cols, position)
  values
    (new.id, 'Job Search', '#a78bfa', '[
      {"id":"c1","name":"Backlog","cards":[]},
      {"id":"c2","name":"In Progress","cards":[]},
      {"id":"c3","name":"Done","cards":[]}
    ]'::jsonb, 0),
    (new.id, 'Personal', '#38bdf8', '[
      {"id":"c1","name":"Todo","cards":[]},
      {"id":"c2","name":"In Progress","cards":[]},
      {"id":"c3","name":"Done","cards":[]}
    ]'::jsonb, 1);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
