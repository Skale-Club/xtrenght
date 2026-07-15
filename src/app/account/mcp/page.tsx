import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/shared/lib/supabase/server";
import { McpCredentials } from "@/features/mcp/ui/mcp-credentials";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "MCP access" };

async function currentOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function McpAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already gates this route; this covers a direct hit and narrows the
  // type so `user.email` is safe below.
  if (!user) redirect("/login?redirectTo=/account/mcp");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  const mcpUrl = `${await currentOrigin()}/api/mcp`;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight">MCP access</h1>
        <p className="mt-2 text-muted">
          Connect an AI assistant to your Xtrenght account over the Model Context Protocol. The connection acts as
          you: it sees only your data, and it can do exactly what your account can — no more.
        </p>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Your credentials</h2>
          <p className="mt-2 mb-4 text-sm text-muted">
            Generate a token, then paste the config below into your MCP client (Claude Desktop, Cursor, and others
            read an <code className="font-mono">mcpServers</code> block like this).
          </p>
          <McpCredentials email={user.email ?? ""} mcpUrl={mcpUrl} />
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">What the assistant can do</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Browse the exercise catalogue and read training programs.</li>
            <li>• Build and log workouts: start a session, add exercises and sets, finish and rate it.</li>
            <li>• Track progress: personal records, exercise history, and dashboard totals.</li>
            <li>• Follow programs and start their sessions.</li>
            <li>
              • {isAdmin ? "Author programs" : "Program authoring"} — create and edit programs, weeks, sessions and
              suggested sets.{" "}
              {isAdmin ? "Available to you as an admin." : "Admin accounts only; the tools appear but the database refuses them for your account."}
            </li>
          </ul>
        </section>

        <section className="mt-10 rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          <h2 className="text-sm font-semibold text-foreground">For OAuth-capable clients</h2>
          <p className="mt-2">
            The endpoint advertises OAuth metadata at{" "}
            <code className="font-mono">/.well-known/oauth-protected-resource</code>. Clients that support it can
            fetch and refresh tokens automatically via the <code className="font-mono">password</code> and{" "}
            <code className="font-mono">refresh_token</code> grants at <code className="font-mono">/api/mcp/token</code>.
          </p>
        </section>
      </main>
    </>
  );
}
