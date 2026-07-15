"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";

/**
 * Mints MCP credentials for the signed-in user.
 *
 * The page is already behind auth, but the user re-enters their password to
 * generate API credentials -- the same confirmation a token page normally asks
 * for, and what the password grant at /api/mcp/token needs. It hands back a
 * short-lived access token and a durable refresh token, which the panel drops
 * straight into a ready-to-paste client config.
 */

type Tokens = { access_token: string; refresh_token: string; expires_in: number };

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted focus:border-accent focus:outline-none";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="flex items-start gap-2">
        <code
          className={`min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2.5 text-xs ${
            mono ? "font-mono" : ""
          } whitespace-pre-wrap break-all`}
        >
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function McpCredentials({ email, mcpUrl }: { email: string; mcpUrl: string }) {
  const [password, setPassword] = useState("");
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/mcp/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "password", username: email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error_description ?? "Could not generate a token.");
        return;
      }
      setTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
      setPassword("");
    } catch {
      setError("Network error while contacting the token endpoint.");
    } finally {
      setPending(false);
    }
  }

  const config = tokens
    ? JSON.stringify(
        {
          mcpServers: {
            xtrenght: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${tokens.access_token}` } },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={generate} className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-5">
        <div>
          <label htmlFor="mcp-password" className="mb-1.5 block text-sm font-medium">
            Confirm your password to generate credentials
          </label>
          <input
            id="mcp-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !password} className="self-start">
          {pending ? "Generating…" : tokens ? "Regenerate" : "Generate credentials"}
        </Button>
      </form>

      {tokens ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-5">
          <p className="text-sm text-muted">
            The access token expires in about {Math.round(tokens.expires_in / 60)} minutes. A client that supports
            OAuth refresh can use the refresh token to stay connected; otherwise regenerate here when it expires.
          </p>
          <Field label="MCP endpoint" value={mcpUrl} />
          <Field label="Access token (Bearer)" value={tokens.access_token} />
          <Field label="Refresh token" value={tokens.refresh_token} />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">Client config</span>
              <CopyButton value={config} />
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface px-3 py-3 text-xs">
              <code className="font-mono">{config}</code>
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
