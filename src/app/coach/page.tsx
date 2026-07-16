import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getConversation, listConversations, textOf } from "@/entities/ai-coach/api/conversation-queries";
import { CoachChat } from "@/features/ai-coach/ui/coach-chat";
import { createClient } from "@/shared/lib/supabase/server";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts gates this route; this makes `user` non-null and covers a direct hit.
  if (!user) {
    redirect("/login?redirectTo=/coach");
  }

  // Resume the requested conversation, else the most recent one. RLS returns
  // nothing for someone else's id, so an unknown ?c= just starts a fresh chat
  // rather than erroring -- and reveals nothing about whether it exists.
  const conversationId = c ?? (await listConversations(1))[0]?.id;
  const resumed = conversationId ? await getConversation(conversationId) : null;

  const turns =
    resumed?.ai_messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: textOf(message.content),
    })) ?? [];

  return (
    <>
      <SiteHeader />
      <CoachChat initialConversationId={resumed?.id} initialTurns={turns} />
    </>
  );
}
