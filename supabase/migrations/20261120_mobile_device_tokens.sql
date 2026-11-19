-- Mobile FCM device token registration for Customer & Technician apps
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_role text not null check (actor_role in ('customer', 'plumber', 'admin')),
  app_flavor text not null check (app_flavor in ('customer', 'technician')),
  fcm_token text not null unique,
  platform text not null default 'android',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_actor
  on public.device_tokens (actor_role, actor_id)
  where is_active = true;
