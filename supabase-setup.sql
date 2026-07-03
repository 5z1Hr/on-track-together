-- Run once in Supabase → SQL Editor.
-- Only the server-side service key can access this table.
create table if not exists public.ontrack_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ontrack_state enable row level security;
revoke all on table public.ontrack_state from anon, authenticated;
grant select, insert, update on table public.ontrack_state to service_role;

insert into public.ontrack_state (id, payload)
values ('accounts', '{}'::jsonb), ('rooms', '{}'::jsonb)
on conflict (id) do nothing;
