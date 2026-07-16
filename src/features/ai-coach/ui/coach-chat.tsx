"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";

type Pending = { toolCallId: string; name: string; args: string; summary: string };

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  /** Tools the coach looked things up with, in call order. */
  tools?: string[];
  /** A write the coach wants to make. Nothing happens until it's approved. */
  pending?: Pending;
  /** What actually got written, once approved. */
  wrote?: { name: string; ok: boolean; url: string | null };
};

/** Tool names are for the model; these are for a person mid-workout. */
const TOOL_LABEL: Record<string, string> = {
  search_exercises: "Searching the catalogue",
  get_exercise_details: "Reading the exercise",
  get_exercise_history: "Checking your history",
  get_recent_workouts: "Looking at your recent workouts",
  get_training_summary: "Checking your totals",
  list_programs: "Listing programs",
  get_program_progress: "Checking your program",
  // Writes land here too, once approved -- the run is what's being narrated,
  // and "start_workout" is not something to show a person mid-set.
  start_workout: "Starting your workout",
  add_exercise_to_workout: "Adding the exercise",
  set_prescription: "Planning your sets",
  follow_program: "Enrolling you in the program",
  save_coach_note: "Making a note",
};

const SUGGESTIONS = [
  "What should I train today?",
  "What's my bench press PR?",
  "Have I been training enough lately?",
];

export function CoachChat({
  initialConversationId,
  initialTurns,
}: {
  initialConversationId?: string;
  initialTurns: Turn[];
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Keys for turns that exist only locally until the server names them. A
  // counter, not Date.now(): two turns in the same millisecond would collide,
  // and the compiler is right that reading the clock in render scope is impure.
  const localTurns = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, streaming]);

  /** One request to the coach: a message, or a decision about a pending write. */
  async function run(payload: Record<string, unknown>, optimisticText?: string) {
    if (streaming) return;

    setError(null);
    setStreaming(true);

    const localId = `local-${localTurns.current++}`;
    setTurns((prev) => [
      ...prev,
      // A decision has no user turn -- they tapped a button, they didn't speak.
      ...(optimisticText
        ? [{ id: localId, role: "user" as const, text: optimisticText }]
        : []),
      { id: `${localId}-reply`, role: "assistant" as const, text: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, ...payload }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({ error: "Request failed." }));
        throw new Error(detail.error ?? "Request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. A chunk can split one in
        // half, so keep the remainder in the buffer rather than parsing it.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          const event = JSON.parse(line.slice(6));

          if (event.type === "conversation") {
            setConversationId(event.conversationId);
          } else if (event.type === "text") {
            setTurns((prev) =>
              prev.map((turn, i) =>
                i === prev.length - 1 ? { ...turn, text: turn.text + event.text } : turn,
              ),
            );
          } else if (event.type === "thinking") {
            setTurns((prev) =>
              prev.map((turn, i) =>
                i === prev.length - 1
                  ? { ...turn, thinking: (turn.thinking ?? "") + event.text }
                  : turn,
              ),
            );
          } else if (event.type === "tool") {
            setTurns((prev) =>
              prev.map((turn, i) =>
                i === prev.length - 1
                  ? { ...turn, tools: [...(turn.tools ?? []), event.name] }
                  : turn,
              ),
            );
          } else if (event.type === "confirm") {
            setTurns((prev) =>
              prev.map((turn, i) =>
                i === prev.length - 1
                  ? {
                      ...turn,
                      pending: {
                        toolCallId: event.toolCallId,
                        name: event.name,
                        args: event.args,
                        summary: event.summary,
                      },
                    }
                  : turn,
              ),
            );
          } else if (event.type === "wrote") {
            setTurns((prev) =>
              prev.map((turn, i) =>
                i === prev.length - 1
                  ? { ...turn, wrote: { name: event.name, ok: event.ok, url: event.url } }
                  : turn,
              ),
            );
          } else if (event.type === "error") {
            setError(event.error);
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    void run({ message: trimmed }, trimmed);
  };

  /** Approve or refuse a proposed write. Nothing was written before this. */
  const decide = (pending: Pending, approved: boolean) => {
    // Clear the prompt first so it can't be double-tapped into two writes.
    setTurns((prev) => prev.map((t) => (t.pending === pending ? { ...t, pending: undefined } : t)));
    void run(
      approved
        ? { approve: { toolCallId: pending.toolCallId, name: pending.name, args: pending.args } }
        : { reject: { toolCallId: pending.toolCallId, name: pending.name } },
    );
  };

  const empty = turns.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <div>
              <p className="text-xs font-semibold tracking-widest text-accent uppercase">Coach</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">What are we doing today?</h1>
              <p className="mt-2 text-sm text-muted">
                I can see your workouts, your records, and the program you&apos;re on.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-8">
            {turns.map((turn, index) => {
              const isThinking = streaming && index === turns.length - 1 && !turn.text;

              return (
                <li
                  key={turn.id}
                  className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      turn.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-surface-raised px-4 py-2.5 text-sm"
                        : "max-w-[90%] text-sm leading-relaxed"
                    }
                  >
                    {turn.role === "assistant" && turn.tools?.length ? (
                      // Shown even after the answer lands: "checked your
                      // history" is why the number is trustworthy.
                      <p className="mb-1.5 text-xs text-muted">
                        {[...new Set(turn.tools)]
                          .map((t) => TOOL_LABEL[t] ?? t)
                          .join(" · ")}
                      </p>
                    ) : null}

                    {turn.role === "assistant" && turn.thinking && !turn.text ? (
                      <p className="text-xs italic text-muted">{turn.thinking}</p>
                    ) : null}

                    {isThinking && !turn.thinking && !turn.tools?.length ? (
                      <span className="text-muted" aria-live="polite">
                        Thinking…
                      </span>
                    ) : (
                      // Whitespace is meaningful: the model writes paragraphs.
                      <span className="whitespace-pre-wrap">{turn.text}</span>
                    )}

                    {turn.pending ? (
                      <div className="mt-3 rounded-xl border border-accent/40 bg-surface p-3">
                        <p className="text-sm font-medium">{turn.pending.summary}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Nothing has changed yet.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button onClick={() => decide(turn.pending!, true)} disabled={streaming}>
                            Do it
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => decide(turn.pending!, false)}
                            disabled={streaming}
                          >
                            No
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {turn.wrote?.ok && turn.wrote.url ? (
                      <Link
                        href={turn.wrote.url}
                        className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
                      >
                        Open it →
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-2xl px-6 py-4">
          {error ? (
            <p role="alert" className="mb-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask your coach…"
              aria-label="Message your coach"
              disabled={streaming}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
            />
            <Button type="submit" disabled={streaming || !input.trim()}>
              {streaming ? "…" : "Send"}
            </Button>
          </form>

          <p className="mt-2 text-center text-[0.65rem] text-muted">
            Coaching advice, not medical advice.{" "}
            <Link href="/coach/memory" className="underline hover:text-foreground">
              What it remembers
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
