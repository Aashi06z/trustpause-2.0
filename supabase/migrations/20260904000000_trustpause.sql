create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'TrustPause user',
  created_at timestamptz not null default now()
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guardian text not null,
  title text not null,
  detail text not null,
  risk text not null,
  status text not null check (status in ('Protected', 'Blocked', 'Reviewed')),
  tone text not null check (tone in ('green', 'red', 'amber')),
  occurred_at timestamptz not null default now()
);

create table if not exists public.trust_circle_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  initials text not null,
  relationship text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_analysis_consent boolean not null default true,
  trust_circle_requests boolean not null default true,
  browser_link_interception boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.risk_events enable row level security;
alter table public.trust_circle_members enable row level security;
alter table public.user_settings enable row level security;

create policy "Users manage their profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "Users manage their events" on public.risk_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage their circle" on public.trust_circle_members for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage their settings" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();