import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages } from "@openrouter/sdk/models";
import { NextResponse, type NextRequest } from "next/server";

import { getTrainingProfile } from "@/entities/profile/api/profile-queries";
import { COACH_MAX_TOKENS, COACH_SYSTEM_PROMPT } from "@/features/ai-coach/api/coach-config";
import { COACH_TOOLS, runCoachTool } from "@/features/ai-coach/api/coach-tools";
import { describeProfile } from "@/features/ai-coach/api/describe-profile";
import {
  COACH_WRITE_TOOLS,
  WRITE_TOOL_NAMES,
  describeWrite,
  runCoachWrite,
} from "@/features/ai-coach/api/coach-write-tools";
import { getCoachConfig } from "@/shared/lib/supabase/config-reader";
import { createClient } from "@/shared/lib/supabase/server";

/**
 * The AI coach.
 *
 * Every database read this route performs -- and, once tools land, every read
 * the *model* performs -- goes through `createClient()`, the request-scoped
 * Supabase client carrying the signed-in user's JWT. RLS therefore applies to
 * the model exactly as it applies to the browser: it cannot reach another
 * user's data, whatever the conversation talks it into.
 *
 * The one exception is getCoachConfig(), which reads the OpenRouter key from
 * app_settings with an elevated client. That is confined to config-reader.ts,
 * never touches user data, and is never handed to the model -- see the comment
 * there. Do not widen it.
 */

export async function POST(request: NextRequest) {
  // Configured from /admin, not the environment, so the model and key can
  // change without a redeploy. Null means an admin hasn't set a key yet.
  const config = await getCoachConfig();

  if (!config) {
    return NextResponse.json(
      { error: "The coach isn't configured yet. An admin needs to add an API key." },
      { status: 503 },
    );
  }

  const openrouter = new OpenRouter({
    apiKey: config.apiKey,
    // Shown on OpenRouter's dashboard; useful for attributing spend once more
    // than one thing here talks to a model.
    appTitle: "Xtrenght",
  });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    conversationId?: string;
    message?: string;
    /** An approved write, sent back after the user taps confirm. */
    approve?: { toolCallId: string; name: string; args: string };
    /** A refused write -- the model is told, so it can offer something else. */
    reject?: { toolCallId: string; name: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  const decision = body.approve ?? body.reject ?? null;

  // A confirmation carries no message -- the user tapped a button, they did not
  // type. Requiring one here would make the whole approval flow impossible.
  if (!message && !decision) {
    return NextResponse.json({ error: "Say something." }, { status: 400 });
  }
  if (decision && !body.conversationId) {
    return NextResponse.json({ error: "Nothing to confirm." }, { status: 400 });
  }

  // ---------------------------------------------------------- conversation --

  let conversationId = body.conversationId;

  if (conversationId) {
    // Not a permission check -- RLS already did that. This turns "someone
    // else's id" into a clean 404 instead of a foreign-key error.
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
  } else {
    const { data: created, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        // Provisional. A real title needs the exchange to have happened.
        title: message.length > 60 ? `${message.slice(0, 57)}…` : message,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    conversationId = created.id;
  }

  // ------------------------------------------------------------- history --

  const { data: history, error: historyError } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at");

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  const { data: notes } = await supabase
    .from("ai_coach_notes")
    .select("note")
    .order("created_at", { ascending: false })
    .limit(40);

  // Persist the user's turn before calling the model: if the request dies
  // mid-stream, what they said is still in the transcript. A confirmation has
  // no turn to persist -- the pending call is already in the history.
  let userMessageId: string | null = null;

  if (message) {
    const { data: inserted, error: insertError } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role: "user",
        content: [{ type: "text", text: message }],
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    userMessageId = inserted.id;
  }

  // OpenRouter speaks the OpenAI shape: the system prompt is a message with
  // role "system", not a separate parameter as on the Anthropic API.
  //
  // The prompt is deliberately first and stable -- it is the cache prefix.
  // `cacheControl` below tells OpenRouter to place the breakpoint on the last
  // cacheable block and advance it as the conversation grows, so the system
  // prompt and the settled history are read from cache at ~0.1x instead of
  // being re-billed in full on every turn.
  // An admin can replace the whole prompt from /admin; blank falls back to the
  // built-in one, so a bad edit is recoverable by clearing the field.
  const basePrompt = config.systemPromptOverride ?? COACH_SYSTEM_PROMPT;

  // The profile they filled in, and the notes the coach wrote itself. Two
  // different kinds of knowledge and the prompt says so: one they typed and can
  // edit at /profile, one the model inferred and can retract at /coach/memory.
  const profile = await getTrainingProfile();

  const systemText = [
    basePrompt,
    describeProfile(profile),
    notes?.length
      ? `## What you've worked out about them\n\nYour own notes from past conversations. They can delete any of these.\n\n${notes
          .map((n) => `- ${n.note}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Typed as the SDK's union, not inferred from this literal -- otherwise the
  // array narrows to system/user/assistant and the tool turns pushed inside the
  // loop below don't fit.
  const messages: ChatMessages[] = [
    { role: "system" as const, content: systemText },
    ...history.flatMap(replayTurn),
  ];

  if (message) {
    messages.push({ role: "user" as const, content: message });
  }

  // --------------------------------------------------------------- stream --

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "conversation", conversationId, userMessageId });

      let answer = "";

      try {
        // A confirmation resumes a turn that stopped mid-flight: the pending
        // call is already the last thing in the replayed history, so all that's
        // missing is its result. Run it (or report the refusal) and let the
        // loop below carry on from there.
        if (decision) {
          if (body.approve) {
            send({ type: "tool", name: body.approve.name });
            const outcome = await runCoachWrite(body.approve.name, body.approve.args);
            send({
              type: "wrote",
              name: body.approve.name,
              ok: outcome.ok,
              // A url means "go look at it" -- surfaced so the UI can link.
              url: outcome.ok ? (outcome.data as { url?: string }).url ?? null : null,
            });
            messages.push({
              role: "tool" as const,
              toolCallId: body.approve.toolCallId,
              content: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }),
            });
          } else if (body.reject) {
            messages.push({
              role: "tool" as const,
              toolCallId: body.reject.toolCallId,
              // Phrased as an outcome, not an error: the user declining is a
              // normal answer, and the model should offer an alternative rather
              // than apologise for a failure.
              content: JSON.stringify({
                declined: true,
                note: "The user declined this action. Do not retry it. Acknowledge briefly and offer an alternative if there is one.",
              }),
            });
          }
        }

        // The agentic loop. OpenRouter has no tool runner, so it is written out:
        // ask, run whatever tools came back, feed the results in, ask again --
        // until the model answers with text instead of another tool call.
        //
        // Bounded, because an unbounded loop against a paid API is a way to
        // spend real money on a bug. Eight is far past what any real question
        // needs; hitting it means something is wrong, not that the user asked
        // something hard.
        const MAX_TURNS = 8;
        let turn = 0;

        while (turn < MAX_TURNS) {
          turn += 1;

          // Streaming is required, not stylistic: a coaching answer plus
          // reasoning runs past the point where a single response risks an
          // HTTP timeout.
          const result = await openrouter.chat.send({
            chatRequest: {
              model: config.model,
              messages,
              stream: true,
              maxTokens: COACH_MAX_TOKENS,
              cacheControl: { type: "ephemeral" },
              tools: [...COACH_TOOLS, ...COACH_WRITE_TOOLS],
              reasoning: { effort: config.effort as "low" | "medium" | "high" | "xhigh" | "max" },
            },
          });

          let text = "";
          // Tool calls stream in fragments: the name arrives once, the JSON
          // arguments arrive a few characters at a time, keyed by index.
          // Accumulate rather than expecting each chunk to be whole.
          const pending = new Map<number, { id: string; name: string; args: string }>();

          for await (const chunk of result) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (typeof delta.content === "string" && delta.content) {
              text += delta.content;
              answer += delta.content;
              send({ type: "text", text: delta.content });
            }

            // Reasoning arrives on its own field, not in content.
            const reasoning = (delta as { reasoning?: string | null }).reasoning;
            if (typeof reasoning === "string" && reasoning) {
              send({ type: "thinking", text: reasoning });
            }

            for (const call of (delta as { toolCalls?: RawToolCall[] }).toolCalls ?? []) {
              const index = call.index ?? 0;
              const entry = pending.get(index) ?? { id: "", name: "", args: "" };
              if (call.id) entry.id = call.id;
              if (call.function?.name) entry.name = call.function.name;
              if (call.function?.arguments) entry.args += call.function.arguments;
              pending.set(index, entry);
            }
          }

          if (pending.size === 0) break; // answered with prose: done

          const calls = [...pending.values()].filter((c) => c.name);

          // camelCase, not snake_case: the SDK validates its *input* shape with
          // Zod and serialises to the wire's tool_calls / tool_call_id itself.
          // Writing the wire names here fails validation before the request is
          // ever sent.
          messages.push({
            role: "assistant" as const,
            content: text,
            toolCalls: calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });

          // A write stops the turn. RLS and the constraints keep the model from
          // writing anything *invalid*; they say nothing about writing
          // something valid the user never asked for. Starting a workout
          // uninvited breaks no constraint at all -- so the gate is consent,
          // and it lives here.
          const writes = calls.filter((c) => WRITE_TOOL_NAMES.has(c.name));

          if (writes.length > 0) {
            // Persist the pending call so a confirmation can resume it. This is
            // why content is jsonb: the tool_use block has to survive the round
            // trip intact.
            await supabase.from("ai_messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: [
                ...(text ? [{ type: "text", text }] : []),
                ...calls.map((c) => ({
                  type: "tool_use",
                  id: c.id,
                  name: c.name,
                  input: c.args || "{}",
                })),
              ] as never,
            });

            for (const write of writes) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(write.args || "{}");
              } catch {
                // describeWrite copes with an empty object.
              }
              send({
                type: "confirm",
                toolCallId: write.id,
                name: write.name,
                args: write.args || "{}",
                summary: describeWrite(write.name, args),
              });
            }

            send({ type: "done", pending: true });
            return;
          }

          // Independent reads -- run them together rather than serially.
          const results = await Promise.all(
            calls.map(async (call) => {
              send({ type: "tool", name: call.name });
              const outcome = await runCoachTool(call.name, call.args);
              return { call, outcome };
            }),
          );

          for (const { call, outcome } of results) {
            messages.push({
              role: "tool" as const,
              toolCallId: call.id,
              // Errors go back as content, not as a thrown turn: the model can
              // read "no exercise with that slug" and search again.
              content: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }),
            });
          }
        }

        if (turn >= MAX_TURNS && !answer) {
          send({ type: "error", error: "The coach got stuck looking things up. Try again?" });
          return;
        }

        if (!answer) {
          send({ type: "error", error: "The coach didn't answer. Try again?" });
          return;
        }

        const { error: saveError } = await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: [{ type: "text", text: answer }],
        });

        if (saveError) {
          // The answer already streamed; the user has it. Losing it from the
          // transcript is a real bug, but not a reason to blank the screen.
          console.error(`Failed to persist assistant turn: ${saveError.message}`);
        }

        await supabase
          .from("ai_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        send({ type: "done" });
      } catch (cause) {
        console.error("Coach request failed:", cause);
        send({
          type: "error",
          error: cause instanceof Error ? cause.message : "Something went wrong.",
        });
      } finally {
        // The one close. Every path above returns into this, so closing at the
        // return sites too would throw ERR_INVALID_STATE on the second call and
        // take the whole response down with it.
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    },
  });
}

/** One streamed fragment of a tool call. Assembled across chunks by index. */
type RawToolCall = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

/**
 * Turns a stored turn back into what the API expects.
 *
 * Most turns are just text. The interesting case is an assistant turn holding a
 * tool_use block: that is a write the user was asked to confirm and hasn't yet.
 * Replaying it puts the model back exactly where it stopped, so approving it
 * later resumes the same turn instead of starting a new one that has to
 * re-derive the decision.
 */
function replayTurn(row: { role: "user" | "assistant"; content: unknown }): ChatMessages[] {
  const blocks = Array.isArray(row.content) ? row.content : [];

  const toolUses = blocks.filter(
    (b): b is { type: "tool_use"; id: string; name: string; input: string } =>
      typeof b === "object" && b !== null && (b as { type?: unknown }).type === "tool_use",
  );

  const text = textOfStored(row.content);

  if (row.role === "assistant" && toolUses.length > 0) {
    return [
      {
        role: "assistant" as const,
        content: text,
        toolCalls: toolUses.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.input || "{}" },
        })),
      },
    ];
  }

  // A turn with no text and no tool calls would be an empty message, which the
  // API rejects. Drop it rather than send it.
  if (!text) return [];

  return [{ role: row.role, content: text }];
}

/** Stored turns are block arrays; OpenRouter's shape wants a plain string. */
function textOfStored(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("");
}
