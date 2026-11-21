-- Conversation Ownership & Participant Architecture for FlowGuard Customer & Technician Apps

create table if not exists public.conversations (
  id text primary key,
  request_id text not null,
  ticket_number text not null,
  conversation_type text not null check (conversation_type in ('customer_plumber', 'customer_support', 'plumber_support')),
  customer_id text,
  assigned_plumber_id text,
  owner_role text not null check (owner_role in ('admin', 'plumber')),
  owner_id text not null,
  owner_name text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_text text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_number, conversation_type)
);

create index if not exists idx_conversations_customer
  on public.conversations (customer_id, last_message_at desc);

create index if not exists idx_conversations_plumber
  on public.conversations (assigned_plumber_id, last_message_at desc);

create table if not exists public.conversation_participants (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  participant_role text not null check (participant_role in ('customer', 'plumber', 'admin')),
  participant_id text not null,
  participant_name text not null,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (conversation_id, participant_role, participant_id)
);

alter table public.messages
  add column if not exists conversation_id text;

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;

drop policy if exists "Admins manage conversations" on public.conversations;
create policy "Admins manage conversations"
  on public.conversations for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Participants read own conversations" on public.conversations;
create policy "Participants read own conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.participant_id in (
          select id::text from public.customers where auth_user_id = auth.uid()
          union
          select id::text from public.plumbers where auth_user_id = auth.uid()
        )
    )
  );

drop policy if exists "Admins manage conversation_participants" on public.conversation_participants;
create policy "Admins manage conversation_participants"
  on public.conversation_participants for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Participants read own participant rows" on public.conversation_participants;
create policy "Participants read own participant rows"
  on public.conversation_participants for select
  using (
    participant_id in (
      select id::text from public.customers where auth_user_id = auth.uid()
      union
      select id::text from public.plumbers where auth_user_id = auth.uid()
    )
  );
