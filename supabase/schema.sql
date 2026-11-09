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

-- 2b. training_documents table (source of truth for what a bot was trained on)
-- The derived, regenerable index lives in knowledge_chunks; this table is the
-- lineage: pasted text or an uploaded file, plus a hash so identical sources
-- are never processed (or paid for) twice.
create table if not exists training_documents (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  source_type text not null check (source_type in ('text', 'file')),
  title text not null,
  storage_path text,            -- files: path in Supabase Storage
  raw_text text,                -- pasted text: cleaned raw content
  status text not null default 'ready' check (status in ('ready', 'failed')),
  content_hash text,            -- sha256 of the full text; skips reprocessing
  chunk_count int not null default 0,
  char_count int not null default 0,
  created_at timestamptz default now()
);

create index if not exists training_documents_chatbot_idx
  on training_documents(chatbot_id);

-- Same content uploaded twice to the same bot = one document, not two.
create unique index if not exists training_documents_unique_hash
  on training_documents (chatbot_id, content_hash)
  where content_hash is not null;

-- 3. knowledge_chunks table
create extension if not exists vector;

create table if not exists knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  title text,
  content text not null,
  -- ⚠️ 1536 dims matches text-embedding-3-small, the one and only model
  -- allowed here. Every trainer inserts chunks and querying (chat)
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

-- ── Chunk upgrades: lineage, dedupe hash, full-text column ────────────────
-- All three columns are nullable so legacy rows (written before documents
-- existed) keep working while data is migrated.
alter table knowledge_chunks add column if not exists
  document_id uuid references training_documents(id) on delete cascade;
alter table knowledge_chunks add column if not exists content_hash text;

-- Generated FTS column: keeps keyword search in sync automatically, so no
-- writer can forget to update it. 'simple' is intentional — the app is
-- bilingual and stemming is left to embeddings; this is the safe backbone.
alter table knowledge_chunks add column if not exists
  tsv tsvector generated always as
    (to_tsvector('simple', coalesce(title, '') || ' ' || content)) stored;

create index if not exists knowledge_chunks_tsv_idx
  on knowledge_chunks using gin(tsv);

create index if not exists knowledge_chunks_document_idx
  on knowledge_chunks(document_id);

-- Database-level dedupe: re-ingesting the same content is a no-op, not a
-- duplicate row. The failure is a unique violation on this index, which the
-- ingestion pipeline catches as "already indexed".
create unique index if not exists knowledge_chunks_unique_hash
  on knowledge_chunks (chatbot_id, content_hash)
  where content_hash is not null;

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

-- 6. leads table (PLAN-12 Phase 2)
-- One lead per conversation thread; status tracks the sales pipeline.
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  chatbot_id uuid references chatbots(id) on delete cascade not null,
  conversation_id uuid references conversations(id) on delete cascade not null unique,
  name text not null,
  email text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz default now()
);

create index if not exists leads_chatbot_idx
  on leads(chatbot_id);

create index if not exists leads_conversation_idx
  on leads(conversation_id);

-- ── PLAN-12 Phase 1 indexes: stop seq-scans on thread & analytics reads ──
create index if not exists conversations_chatbot_idx
  on conversations(chatbot_id);

create index if not exists messages_conversation_idx
  on messages(conversation_id);

create index if not exists messages_created_at_idx
  on messages(created_at);

-- ── PLAN-12 Phase 1: updated_at trigger on conversations ───────────────
-- Bumped on every message insert so conversation lists sort by "most recent
-- activity" instead of creation time.
create or replace function public.touch_conversation_updated_at()
returns trigger as $$
begin
  update conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_conversation_updated_at on messages;
create trigger trg_touch_conversation_updated_at
  after insert on messages
  for each row execute function public.touch_conversation_updated_at();

-- RLS Policies
alter table profiles enable row level security;
alter table chatbots enable row level security;
alter table training_documents enable row level security;
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

-- training_documents
-- Same owner pattern as knowledge_chunks: reachable only through a bot you own.
-- Edge Functions use the service-role key and bypass this by design.
drop policy if exists "Users can CRUD documents of own bots" on training_documents;
create policy "Users can CRUD documents of own bots"
  on training_documents for all
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ))
  with check (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

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

-- leads
-- RLS must be explicitly enabled: Supabase defaults new tables to it being
-- OFF, and an enabled-but-policy-less state is the only safe default here.
alter table leads enable row level security;

-- Owners can view leads of their own bots.
drop policy if exists "Users can view own bot leads" on leads;
create policy "Users can view own bot leads"
  on leads for select
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- Widget can create leads for active bots (same gate as conversations).
drop policy if exists "Anyone can create leads (widget)" on leads;
create policy "Anyone can create leads (widget)"
  on leads for insert
  with check (exists (
    select 1 from chatbots b
    where b.id = chatbot_id and b.is_active
  ));

-- Owners move leads through the pipeline (new -> contacted -> won/lost).
drop policy if exists "Users can update own bot leads" on leads;
create policy "Users can update own bot leads"
  on leads for update
  using (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ))
  with check (chatbot_id in (
    select id from chatbots where user_id = auth.uid()
  ));

-- No delete policy: deleting the conversation cascades the lead.

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

-- hybrid_search_knowledge: vector search + full-text search fused with
-- Reciprocal Rank Fusion (RRF, k = 60). This is the single retrieval entry
-- point for chat. Keyword search always runs; the vector half only runs when
-- an embedding is supplied, so the same code path works with or without
-- OPENAI_API_KEY.
--
-- Returns matched_via ('keyword' | 'semantic' | 'hybrid') so the Playground can
-- show *why* a chunk was picked. score is the actual fusion score.
create or replace function hybrid_search_knowledge(
  p_chatbot_id uuid,
  p_query text,
  p_query_embedding vector(1536) default null,
  p_match_count int default 5
)
returns table (
  id uuid,
  content text,
  title text,
  matched_via text,
  score float
)
language sql stable
set search_path = public, pg_temp
as $$
  with lex as (
    -- Match ANY lexeme of the question, then grade by how many matched.
    -- A strict websearch_to_tsquery (AND semantics) means "What is NexusCode?"
    -- requires the chunk to literally contain "what" AND "is" AND
    -- "nexuscode" — natural-language questions end up with zero hits even
    -- when the answer is right there. Tokens are lexemes (no stemming, both
    -- languages); the split already removed every non-alphanumeric char, so
    -- they are safe to recombine into an OR tsquery below.
    select array(
      select distinct lower(w)
      from unnest(
        regexp_split_to_array(coalesce(p_query, ''), '[^[:alnum:]]+')
      ) as w
      where char_length(w) >= 2
        -- Function words (both scripts) carry no retrieval value: as exact
        -- lexemes they miss everything, and as substrings they match nearly
        -- all prose. Dropping them also means pure small-talk ("من أنت؟")
        -- leaves the keyword arm empty instead of matching noise.
        and lower(w) <> all (array[
          'what', 'is', 'are', 'you', 'who', 'how', 'the', 'and', 'for',
          'with', 'please', 'can', 'does', 'do', 'me', 'my', 'i',
          'من', 'ما', 'هو', 'هي', 'هل', 'على', 'في', 'عن', 'مع', 'إلى', 'الى',
          'أنا', 'انا', 'انت', 'أنت', 'هذا', 'هذه', 'هذان', 'كنت', 'ليس'
        ])
    ) as words
  ),
  -- Keyword arm: graded by ts_rank_cd over the OR query — a chunk matching
  -- more of the question's words scores higher. Arabic and English get an
  -- extra substring fallback: the 'simple' config does NOT stem Arabic, so
  -- the exact lexeme of "أسعار" will never match the inflected "أسعارنا" or
  -- "للمشاريع" that the chunk actually contains — but user words virtually
  -- always appear as substrings of inflected words. The substring bonus is
  -- half the ts_rank weight so indexed matches still outrank apprx ones.
  -- The rank is what RRF consumes, so it must be meaningful.
  fts as (
    select k.id,
           row_number() over (
             order by
               ts_rank_cd(k.tsv, tsq)
               + 0.5 * (
                 select count(*) from unnest(l.words) t
                 where position(t in lower(k.title || ' ' || k.content)) > 0
               ),
               k.id
           ) as rrf_rank
    from knowledge_chunks k, lex l
    cross join lateral (select to_tsquery('simple', array_to_string(l.words, ' | ')) as tsq) q
    where k.chatbot_id = p_chatbot_id
      and coalesce(cardinality(l.words), 0) > 0
      and (
        k.tsv @@ q.tsq
        or exists (
          select 1 from unnest(l.words) t
          where position(t in lower(k.content)) > 0
        )
      )
    limit p_match_count
  ),
  -- Semantic arm: empty when no embedding is supplied, which is what makes
  -- FTS-only operation safe rather than an error case.
  knn as (
    select k.id,
           row_number() over (
             order by k.embedding <=> p_query_embedding, k.id
           ) as rrf_rank
    from knowledge_chunks k
    where p_query_embedding is not null
      and k.chatbot_id = p_chatbot_id
      and k.embedding is not null
    order by k.embedding <=> p_query_embedding, k.id
    limit p_match_count
  ),
  fused as (
    select coalesce(f.id, n.id) as id,
           f.rrf_rank as fts_rank,
           n.rrf_rank as knn_rank
    from fts f
    full outer join knn n on n.id = f.id
  )
  select c.id,
         c.content,
         c.title,
         case
           when fused.fts_rank is not null and fused.knn_rank is not null then 'hybrid'
           when fused.knn_rank is not null then 'semantic'
           else 'keyword'
         end as matched_via,
         (1.0 / (60 + coalesce(fused.fts_rank, 61)))
           + (1.0 / (60 + coalesce(fused.knn_rank, 61))) as score
  from fused
  join knowledge_chunks c on c.id = fused.id
  order by score desc, c.id
  limit p_match_count;
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

-- 7. Storage for original training files
-- Keeping the original means knowledge can be re-derived (new chunking, new
-- embedding model) without asking the user to upload anything again.
-- Path convention: {user_id}/{chatbot_id}/{timestamp}-{filename}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-files',
  'training-files',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'text/plain']
)
on conflict (id) do nothing;

drop policy if exists "Users can upload training files" on storage.objects;
create policy "Users can upload training files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own training files" on storage.objects;
create policy "Users can read own training files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'training-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own training files" on storage.objects;
create policy "Users can delete own training files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'training-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Plan quotas enforced at the database level
-- Subscription limits live as triggers, not marketing copy: even a hand-crafted
-- SQL client or a UI bug cannot insert past the plan's chunk budget.
-- Starter 500 / Pro 5,000 / Enterprise 50,000.
create or replace function enforce_plan_chunk_quota() returns trigger as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  select p.plan into v_plan
  from profiles p
  join chatbots c on c.user_id = p.id
  where c.id = NEW.chatbot_id;

  v_limit := case v_plan
    when 'starter' then 500
    when 'pro' then 5000
    else 50000
  end;

  select count(*) into v_count from knowledge_chunks where chatbot_id = NEW.chatbot_id;

  if v_count >= v_limit then
    raise exception 'CHUNK_QUOTA_EXCEEDED: You reached your plan''s knowledge limit (%, % chunks). Upgrade to Pro to keep training.',
      coalesce(v_plan, 'starter'), v_limit
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_plan_chunk_quota on knowledge_chunks;
create trigger trg_plan_chunk_quota
  before insert on knowledge_chunks
  for each row execute function enforce_plan_chunk_quota();
-- 9. One concept: every chunk belongs to a source
-- Before training_documents existed, hand-written topics were inserted straight
-- into knowledge_chunks with document_id = null, so they had no lineage and
-- were invisible to the sources panel. Fold each bot's orphans into a single
-- "Legacy topics" source instead of leaving two parallel kinds of knowledge.
-- Safe to re-run: the source is created once, and already-linked chunks are
-- skipped. These chunks keep whatever embeddings they had (hand-written ones
-- had none), so the keyword arm of hybrid search still finds them.
insert into training_documents (chatbot_id, source_type, title, status, char_count)
select c.chatbot_id, 'text', 'Legacy topics', 'ready', sum(char_length(c.content))
from knowledge_chunks c
where c.document_id is null
  and not exists (
    select 1 from training_documents d
    where d.chatbot_id = c.chatbot_id
      and d.title = 'Legacy topics'
      and d.content_hash is null
  )
group by c.chatbot_id;

update knowledge_chunks c
set document_id = d.id
from training_documents d
where c.document_id is null
  and d.chatbot_id = c.chatbot_id
  and d.title = 'Legacy topics'
  -- content_hash is null only for this backfilled row: ingest always sets it.
  and d.content_hash is null
  and d.storage_path is null;

update training_documents d
set chunk_count = (
  select count(*) from knowledge_chunks k where k.document_id = d.id
)
where d.title = 'Legacy topics'
  and d.content_hash is null
  and d.storage_path is null;

-- ── PLAN-12 Phase 2 legacy migration: backfill leads from existing conversations ──
-- Parse "Name (email)" out of conversations.visitor_id and insert as leads.
-- Regex is used instead of split_part: greedy first group survives names that
-- themselves contain " (" e.g. "My Company (LLC) (a@b.com)".
-- Idempotent (no lead yet) and safe per-row (empty/malformed emails are
-- skipped instead of aborting the batch on the not-null constraint).
insert into leads (chatbot_id, conversation_id, name, email, status, created_at)
select
  c.chatbot_id,
  c.id,
  m[1],
  m[2],
  'new',
  c.created_at
from conversations c
cross join lateral regexp_match(c.visitor_id, '^(.*) \(([^()]+)\)$') as m
where c.visitor_id is not null
  and m[1] is not null
  and m[1] <> ''
  and m[2] ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and not exists (
    select 1 from leads l where l.conversation_id = c.id
  );
