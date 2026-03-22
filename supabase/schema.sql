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
  on profiles for update using (auth.uid() = id);

-- chatbots
drop policy if exists "Users can CRUD own chatbots" on chatbots;
create policy "Users can CRUD own chatbots"
  on chatbots for all using (auth.uid() = user_id);

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
  on conversations for insert with check (true);

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

drop policy if exists "Anyone can insert messages (widget + chat function)" on messages;
create policy "Anyone can insert messages (widget + chat function)"
  on messages for insert with check (true);

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