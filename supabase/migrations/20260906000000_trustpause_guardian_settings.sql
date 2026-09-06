-- Adds the guardian-level toggles surfaced in Settings to the user_settings table.
alter table public.user_settings
  add column if not exists payment_pause boolean not null default true,
  add column if not exists call_screening boolean not null default true,
  add column if not exists media_checks boolean not null default true,
  add column if not exists hold_to_continue boolean not null default true;