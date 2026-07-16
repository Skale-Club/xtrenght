"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSetting, type SettingRow } from "@/features/admin/api/settings-actions";
import { Button } from "@/shared/ui/button";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

function SettingField({ setting, onSaved }: { setting: SettingRow; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition();
  // A secret starts empty even when set: its value was never sent here, so
  // there is nothing to prefill. Typing replaces it; leaving it blank keeps it.
  const [value, setValue] = useState(setting.is_secret ? "" : (setting.value ?? ""));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiline = setting.key.endsWith("_prompt");

  function save() {
    if (setting.is_secret && !value.trim()) {
      setError("Nothing to save — type a new value to replace it.");
      return;
    }

    startTransition(async () => {
      const result = await saveSetting(setting.key, value, setting.is_secret);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      if (setting.is_secret) setValue("");
      onSaved();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={setting.key} className="numeric text-sm font-semibold">
          {setting.key}
        </label>
        {setting.is_secret ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase ${
              setting.is_set ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {setting.is_set ? "set" : "not set"}
          </span>
        ) : null}
      </div>

      {setting.description ? (
        <p className="mb-3 text-xs text-muted">{setting.description}</p>
      ) : null}

      <div className="flex gap-2">
        {multiline ? (
          <textarea
            id={setting.key}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            placeholder="Leave blank to use the built-in prompt"
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        ) : (
          <input
            id={setting.key}
            type={setting.is_secret ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={setting.is_secret && setting.is_set ? "•••••••• (type to replace)" : ""}
            autoComplete="off"
            className={inputClass}
          />
        )}
        <Button onClick={save} disabled={isPending} variant="secondary" className="self-start">
          {isPending ? "…" : "Save"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {saved && !error && !isPending ? (
        <p role="status" className="mt-2 text-xs text-muted">
          Saved.
        </p>
      ) : null}
    </div>
  );
}

export function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {settings.map((setting) => (
        <SettingField key={setting.key} setting={setting} onSaved={() => router.refresh()} />
      ))}
    </div>
  );
}
