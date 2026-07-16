-- AI coach: conversations, messages, and what the coach remembers about you.

create type public.ai_message_role as enum ('user', 'assistant');

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Null until the first exchange names it. Generated from the opening
  -- message rather than asked for -- nobody titles a chat before having it.
  title text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create index ai_conversations_user_recent_idx
  on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.ai_conversations (id) on delete cascade,

  role public.ai_message_role not null,

  -- jsonb, not text: one turn is an array of content blocks (text, thinking,
  -- tool_use, tool_result). Flattening to a string would drop the tool calls --
  -- which are exactly what has to be replayed to the API on the next turn and
  -- rendered in the transcript.
  content jsonb not null,

  -- Per-turn token accounting. Needed to answer "what is this costing" without
  -- reconstructing it from provider invoices later.
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cache_read_tokens integer check (cache_read_tokens >= 0),

  created_at timestamptz not null default now()
);

-- Every read is "this conversation, in order".
create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- What the coach remembers about you between conversations.
--
-- Chat history alone does not personalise: it either outgrows the context
-- window or gets compacted away. These survive both -- they are small, durable
-- facts ("prefers 45-minute sessions", "right shoulder hurts on flat bench")
-- that load into the system prompt every time.
create table public.ai_coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  note text not null check (length(trim(note)) > 0),

  -- Where the note came from, so a wrong one can be traced back to the turn
  -- that wrote it. set null rather than cascade: deleting a conversation
  -- should not silently erase what the coach learned in it.
  source_message_id uuid references public.ai_messages (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_coach_notes_set_updated_at
  before update on public.ai_coach_notes
  for each row execute function public.set_updated_at();

create index ai_coach_notes_user_idx on public.ai_coach_notes (user_id, created_at desc);
