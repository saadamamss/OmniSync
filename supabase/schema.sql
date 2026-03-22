-- Supabase Schema for Apex Chatbot Application
-- This file creates all necessary tables, RLS policies, and functions

-- 1. profiles table
-- Used in: Dashboard.vue, BotDetails.vue, CreateBot.vue, Bots.vue
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  plan text not null default 'starter', -- 'starter' | 'pro' | 'enterprise'
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. chatbots table
-- Used in: Bots.vue, BotDetails.vue, CreateBot.vue, Dashboard.vue
create table chatbots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- settings structure:
-- {
--   "source_type": "website" | "pdf" | "text",
--   "source_value": "https://...",
--   "appearance": {
--     "primaryColor": "#f97316",
--     "botName": "...",
--     "welcomeMessage": "...",
--     "userPlaceholder": "...",
--     "systemPrompt": "...",
--     "collectLeads": false,
--     "suggestedQuestions": [],
--     "widgetPosition": "right"
--   }
-- }

-- 3. knowledge_chunks table
-- Used in: BotTraining.vue, BotDetails.vue, chat/index.ts, import_website_training/index.ts
-- Need extension for vector search
create extension if not exists vector;

create table knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  title text,
  content text not null,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
  created_at timestamptz default now()
);

-- Index for vector search
create index knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. conversations table
-- Used in: Conversations.vue, BotConversations.vue, Leads.vue, Widget.vue
create table conversations (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  visitor_id text, -- name + email in format "Name (email@example.com)" for leads
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. messages table
-- Used in: BotConversations.vue, Conversations.vue, Analytics.vue, chat/index.ts
create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- RLS Policies (Row Level Security)

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table chatbots enable row level security;
alter table knowledge_chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

-- profiles: Users can only see their own profile
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- chatbots: Users can only see their bots
create policy "Users can CRUD own chatbots"
  on chatbots for all using (auth.uid() = user_id);

-- knowledge_chunks: Related to bot
create policy "Users can CRUD chunks of own bots"
  on knowledge_chunks for all
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- conversations: Related to bot (reading for owner + writing for all for widget)
create policy "Users can view own bot conversations"
  on conversations for select
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));
create policy "Anyone can create conversations (widget)"
  on conversations for insert with check (true);
create policy "Users can delete own conversations"
  on conversations for delete
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- messages: Same logic as conversations
create policy "Users can view messages of own bots"
  on messages for select
  using (conversation_id in (
    select c.id from conversations c
    join chatbots b on b.id = c.chatbot_id
    where b.user_id = auth.uid()
  ));
create policy "Anyone can insert messages (widget + chat function)"
  on messages for insert with check (true);

-- Required Function - match_knowledge_chunks
-- Used in: supabase/functions/chat/index.ts
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
