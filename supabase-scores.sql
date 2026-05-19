create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 12),
  score integer not null check (score >= 0 and score <= 10000000),
  max_tile integer not null check (max_tile >= 2 and max_tile <= 1048576),
  duration_ms integer not null check (duration_ms >= 0 and duration_ms <= 86400000),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

grant select, insert on table public.scores to anon;

drop policy if exists "Anyone can read scores" on public.scores;
create policy "Anyone can read scores"
on public.scores
for select
to anon
using (true);

drop policy if exists "Anyone can submit scores" on public.scores;
create policy "Anyone can submit scores"
on public.scores
for insert
to anon
with check (
  char_length(nickname) between 1 and 12
  and score >= 0
  and score <= 10000000
  and max_tile >= 2
  and max_tile <= 1048576
  and duration_ms >= 0
  and duration_ms <= 86400000
);
