-- Supabase Schema for Apex Chatbot Application
-- Idempotent version: safe to run multiple times

-- 1. profiles table
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  plan text not null default 'starter',
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. chatbots table
create table if not exists chatbots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. knowledge_chunks table
create extension if not exists vector;

create table if not exists knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  title text,
  content text not null,
  -- ⚠️ 1536 dims matches text-embedding-3-small, the one and only model
  -- allowed here. Training (import_website_training) and querying (chat)
  -- MUST use the same embedding model — see supabase/functions/_shared/embeddings.ts
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Index for vector search (drop first to avoid duplicate)
drop index if exists knowledge_chunks_embedding_idx;
create index knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. conversations table
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  visitor_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. messages table
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- RLS Policies
alter table profiles enable row level security;
alter table chatbots enable row level security;
alter table knowledge_chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

-- profiles
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- INSERT is allowed for the db trigger on signup (security definer) and is
-- required so Settings.vue's upsert() works. with check keeps users from
-- creating write-overs for someone else's id.
drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- chatbots
drop policy if exists "Users can CRUD own chatbots" on chatbots;
create policy "Users can CRUD own chatbots"
  on chatbots for all using (auth.uid() = user_id);

-- Widget needs to read bot config as an anonymous visitor.
-- Exposure is intentionally narrowed: only ACTIVE bots, and the widget
-- queries select specific columns (id, name, is_active, settings) — never *.
drop policy if exists "Public can view active bots (widget)" on chatbots;
create policy "Public can view active bots (widget)"
  on chatbots for select
  using (is_active = true);

-- knowledge_chunks
drop policy if exists "Users can CRUD chunks of own bots" on knowledge_chunks;
create policy "Users can CRUD chunks of own bots"
  on knowledge_chunks for all
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- conversations
drop policy if exists "Users can view own bot conversations" on conversations;
create policy "Users can view own bot conversations"
  on conversations for select
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

drop policy if exists "Anyone can create conversations (widget)" on conversations;
create policy "Anyone can create conversations (widget)"
  on conversations for insert
  with check (exists (
    select 1 from chatbots b
    where b.id = chatbot_id and b.is_active
  ));

drop policy if exists "Users can delete own conversations" on conversations;
create policy "Users can delete own conversations"
  on conversations for delete
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- messages
drop policy if exists "Users can view messages of own bots" on messages;
create policy "Users can view messages of own bots"
  on messages for select
  using (conversation_id in (
    select c.id from conversations c
    join chatbots b on b.id = c.chatbot_id
    where b.user_id = auth.uid()
  ));

-- messages are only written by the chat Edge Function using the service-role
-- client, which bypasses RLS. The old "Anyone can insert messages" policy is
-- deliberately NOT re-created (it let any visitor spam rows into any
-- conversation). Kept as an explicit drop so rerunning this file removes it
-- from databases that created it with an older version of the schema.
drop policy if exists "Anyone can insert messages (widget + chat function)" on messages;

-- match_knowledge_chunks function
drop function if exists match_knowledge_chunks(vector, float, int, uuid);
create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_chatbot_id uuid
)
returns table(
  id uuid,
  content text,
  title text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    title,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where chatbot_id = p_chatbot_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Add is_active column to chatbots table
alter table chatbots add column if not exists is_active boolean not null default true;

-- Function to enforce plan bot limits
create or replace function enforce_plan_bot_limits(
  p_user_id uuid,
  p_plan text
)
returns void as $$
declare
  v_limit integer;
begin
  -- Set limit based on plan
  v_limit := case p_plan
    when 'starter'    then 1
    when 'pro'        then 5
    when 'enterprise' then 1000
    else 1
  end;

  -- Disable excess bots (newest first)
  update chatbots
  set is_active = false
  where user_id = p_user_id
    and id not in (
      select id from chatbots
      where user_id = p_user_id
      order by created_at asc  -- Oldest stays active
      limit v_limit
    );

  -- Enable bots within limit
  update chatbots
  set is_active = true
  where user_id = p_user_id
    and id in (
      select id from chatbots
      where user_id = p_user_id
      order by created_at asc
      limit v_limit
    );
end;
$$ language plpgsql security definer;

-- [H4] Wire enforce_plan_bot_limits() so the plan cap is enforced by the
-- database, not just the frontend. Runs when a chatbot is created and when
-- a plan changes (manual upgrade or Stripe webhook downgrade).
create or replace function public.apply_plan_bot_limits()
returns trigger as $$
declare
  v_plan text;
begin
  select plan into v_plan from profiles where id = NEW.user_id;
  perform enforce_plan_bot_limits(NEW.user_id, coalesce(v_plan, 'starter'));
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_apply_plan_bot_limits_on_insert on chatbots;
create trigger trg_apply_plan_bot_limits_on_insert
  after insert on chatbots
  for each row execute function public.apply_plan_bot_limits();

drop trigger if exists trg_apply_plan_bot_limits_on_plan_change on profiles;
create trigger trg_apply_plan_bot_limits_on_plan_change
  after update of plan on profiles
  for each row execute function public.apply_plan_bot_limits();

-- 6. message_usage table
create table if not exists message_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  month text not null, -- Format "YYYY-MM" e.g. "2024-03"
  message_count integer not null default 0,
  updated_at timestamptz default now(),
  unique(user_id, month)
);

alter table message_usage enable row level security;

drop policy if exists "Users can view own usage" on message_usage;
create policy "Users can view own usage"
  on message_usage for select using (auth.uid() = user_id);

-- Function to increment message count
create or replace function increment_message_usage(p_user_id uuid)
returns integer as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_count integer;
begin
  insert into message_usage (user_id, month, message_count)
  values (p_user_id, v_month, 1)
  on conflict (user_id, month)
  do update set
    message_count = message_usage.message_count + 1,
    updated_at = now()
  returning message_count into v_count;

  return v_count;
end;
$$ language plpgsql security definer;

-- Function to get current month usage
create or replace function get_current_usage(p_user_id uuid)
returns integer as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_count integer;
begin
  select message_count into v_count
  from message_usage
  where user_id = p_user_id and month = v_month;

  return coalesce(v_count, 0);
end;
$$ language plpgsql security definer;