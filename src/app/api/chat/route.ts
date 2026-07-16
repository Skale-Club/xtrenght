import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages } from "@openrouter/sdk/models";
import { NextResponse, type NextRequest } from "next/server";

import { COACH_MAX_TOKENS, COACH_SYSTEM_PROMPT } from "@/features/ai-coach/api/coach-config";
import { COACH_TOOLS, runCoachTool } from "@/features/ai-coach/api/coach-tools";
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

  let body: { conversationId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Say something." }, { status: 400 });
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
  // mid-stream, what they said is still in the transcript.
  const { data: userMessage, error: insertError } = await supabase
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

  const systemText = notes?.length
    ? `${basePrompt}\n\n## What you know about this user\n\n${notes
        .map((n) => `- ${n.note}`)
        .join("\n")}`
    : basePrompt;

  // Typed as the SDK's union, not inferred from this literal -- otherwise the
  // array narrows to system/user/assistant and the tool turns pushed inside the
  // loop below don't fit.
  const messages: ChatMessages[] = [
    { role: "system" as const, content: systemText },
    ...history.map((row) => ({
      role: row.role,
      content: textOfStored(row.content),
    })),
    { role: "user" as const, content: message },
  ];

  // --------------------------------------------------------------- stream --

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "conversation", conversationId, userMessageId: userMessage.id });

      let answer = "";

      try {
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
              tools: COACH_TOOLS,
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
          controller.close();
          return;
        }

        if (!answer) {
          send({ type: "error", error: "The coach didn't answer. Try again?" });
          controller.close();
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
