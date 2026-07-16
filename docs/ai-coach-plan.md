# AI Coach — implementation plan

Xtrenght's chat interface: a coach that knows the exercise catalogue, reads your
training history, understands the program you're following, and adjusts it as
you actually perform.

Adapted from [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) for the
chat UX patterns only. Half that template is infrastructure we already solved
differently — Neon Postgres, Auth.js, and Vercel Blob are Supabase Postgres,
Supabase Auth, and Supabase Storage here, and the AI Gateway exists to route
between providers we aren't using.

---

## The decision everything else follows from

**The model reads the database through the signed-in user's JWT, never the
secret key.**

Every tool the model can call goes through `createClient()` from
`shared/lib/supabase/server` — the same request-scoped client the rest of the
app uses. RLS therefore applies to the model exactly as it applies to a browser:
it is *physically unable* to read another user's sessions, sets, or enrollments,
whatever the conversation talks it into.

The alternative — a chat route holding `SUPABASE_SECRET_KEY` — would make every
RLS policy in this codebase decorative. One prompt injection in an exercise
description, one confused tool call, and the model is reading everyone's data
with no boundary left to stop it. There is no amount of prompt engineering that
substitutes for the database refusing.

**Corollary: the model proposes, Postgres decides.** Write tools call the
existing server actions (`startWorkoutSession`, `addSet`, `enrollInProgram`, …),
never raw SQL. So a hallucinated "you benched 300 kg" still hits
`workout_sets_weight_needs_unit`, still hits the ownership policy, and still
fails. The model cannot write a row the app itself couldn't.

---

## Schema (migration 11)

```
ai_conversations   id, user_id, title, created_at, updated_at
ai_messages        id, conversation_id, role, content (jsonb), created_at
ai_coach_notes     id, user_id, note, source_message_id, created_at
```

`content` is `jsonb`, not `text`: a turn is an array of content blocks (text,
thinking, tool_use, tool_result), and flattening it to a string would lose the
tool calls we need to replay and render.

RLS is owner-scoped, same shape as `workout_sessions` — reuse the pattern and
the test harness proves it the same way.

**`ai_coach_notes` is the personalization surface.** Chat history alone doesn't
personalize: it either grows past the context window or gets compacted away.
Notes are what survive — "prefers 45-minute sessions", "right shoulder hurts on
flat bench", "responds to volume, not intensity". The model writes them via a
tool; they load into the system prompt on every conversation. This is the same
idea as the memory tool, scoped to one table and one user.

---

## Tools, in dependency order

Read tools first — they're safe, and they're most of the value.

| Tool | Wraps | Notes |
|---|---|---|
| `search_exercises` | `listExercises` | 876 rows, trigram-indexed |
| `get_exercise_history` | `getExerciseHistory` | PRs, per-session top sets |
| `get_recent_workouts` | `listRecentSessions` | |
| `get_training_summary` | `getSessionSummary` | volume, sets, sessions |
| `get_program_progress` | `getProgramBySlug` | which session is next, what's done |
| `save_coach_note` | new | how the model remembers you |
| `start_workout` | `startWorkoutSession` | **confirm** |
| `add_exercise_to_workout` | `addExerciseToSession` | **confirm** |
| `log_set` | `updateSet` | **confirm** |
| `enroll_in_program` | `enrollInProgram` | **confirm** |

Write tools gate on confirmation: the tool runner yields the assistant message
*before* the tool executes, so the UI renders "Start a chest workout with 4
exercises?" and the tool runs only after a tap. The hook exists for exactly this
— no custom loop needed.

---

## Model and API

**Routed through OpenRouter** (`@openrouter/sdk`), not the Anthropic API
directly. Model slug `anthropic/claude-opus-4.8` — dots and a vendor prefix,
where the direct API spells the same model `claude-opus-4-8`. Same sticker price
($5/$25 per MTok), and one key reaches ~340 models, so trading Opus for Sonnet
on a cost-sensitive route is a string change rather than a migration.

`reasoning: { effort: "high" }` as the default; sweep `medium` once there's an
eval set — a coach answering "what should I do today?" is intelligence-sensitive
and this is the wrong place to economise before measuring.

**What the gateway costs us:** it speaks the OpenAI shape, so the system prompt
is a `role: "system"` message rather than a first-class parameter, and
Claude-specific controls only exist where OpenRouter chose to pass them through.
Prompt caching does survive (verified before building on it) — a top-level
`cacheControl: { type: "ephemeral" }` makes OpenRouter place the breakpoint on
the last cacheable block and advance it as the conversation grows, at the same
1.25x-write / 0.1x-read economics. Tool calling in phase 3 will need the same
check rather than the same assumption.

**Caching is not optional here.** The system prompt carries the domain model,
the tool catalogue, and the user's coach notes — large, stable, and sent every
turn. Without it, every message re-pays for the whole thing.

Streaming is required, not a nicety: a coaching answer plus reasoning runs past
the point where a single response risks an HTTP timeout.

---

## Phases

1. **Schema + route.** Migrations 11–12, RLS, tests. `/api/chat` through
   OpenRouter, streaming, persistence. A chat that talks but knows nothing.
2. **Read tools.** The coach can answer "what's my bench PR?" and "what did I do
   last Tuesday?" from real data. This is where it stops being a generic
   chatbot.
3. **Write tools + confirmation UI.** The coach can drive the app.
4. **Coach notes.** It starts remembering you between conversations.
5. **Program adjustment.** It reads your actual performance against the
   prescription and proposes changes. This is the payoff — and it only works
   because the schema stores `reps`/`weight` as queryable columns rather than
   positional arrays.

Phases 1–2 are the ones worth building before judging the idea.

---

## Open risks

- **Cost.** Opus 4.8 is $5/$25 per MTok through OpenRouter, same as direct. A
  chatty user is real money, and there's no billing to recover it. Caching cuts
  the system-prompt half; the conversation half grows regardless. Worth
  measuring before opening to users — and the gateway makes stepping down to
  Sonnet 5 ($2/$10) a one-line experiment.
- **Prompt injection via the catalogue.** Exercise `description` is HTML from a
  third-party dataset and goes into tool results. It is untrusted input. RLS
  means an injection can't read other users' data, but it can still try to talk
  the model into a bad write — which is what the confirmation gate is for.
- **"Completely powered by AI" is a product decision, not an architecture.** The
  plan above makes the coach able to operate the app. Whether chat *replaces*
  the existing screens or sits alongside them is a separate call, and the
  screens work today.
