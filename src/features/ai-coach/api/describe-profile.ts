import "server-only";

import type { TrainingProfile } from "@/entities/profile/api/profile-queries";
import { EQUIPMENT_LABEL } from "@/entities/profile/model/equipment-options";

const GOAL_TEXT: Record<string, string> = {
  STRENGTH: "get stronger (heavier, lower reps)",
  HYPERTROPHY: "build muscle (volume, moderate reps)",
  ENDURANCE: "build endurance (higher reps, shorter rest)",
  WEIGHT_LOSS: "lose weight (work capacity)",
  GENERAL_FITNESS: "stay in shape generally",
};

/**
 * Turns the profile into the block the model reads before every reply.
 *
 * Silence is deliberate where they said nothing: an absent line means "you do
 * not know this", and the prompt's standing rule is to ask rather than assume.
 * Writing "equipment: unknown" would invite the model to treat the unknown as a
 * fact it had checked.
 */
export function describeProfile(profile: TrainingProfile | null): string {
  if (!profile) return "";

  const lines: string[] = [];

  if (profile.availableEquipment !== null) {
    lines.push(
      profile.availableEquipment.length === 0
        ? "- **Equipment: none.** They train with their body only. Do not offer anything that needs a load, and do not suggest they buy something."
        : `- **Equipment they have:** ${profile.availableEquipment
            .map((e) => EQUIPMENT_LABEL[e] ?? e)
            .join(", ")}. Exercise searches are already filtered to this, so anything you find is something they can do. If you catch yourself wanting something else, ask whether they have it rather than assuming.`,
    );
  }

  if (profile.trainingGoal) {
    lines.push(`- **Goal:** ${GOAL_TEXT[profile.trainingGoal] ?? profile.trainingGoal}. Rep ranges and progression should follow from this.`);
  }

  if (profile.sessionsPerWeek) {
    lines.push(
      `- **Trains ${profile.sessionsPerWeek}× a week** by their own account. Judge "enough" against that, not against a generic ideal — and if their logs disagree with it, the logs are what happened.`,
    );
  }

  if (profile.bodyWeight) {
    const when = new Date(profile.bodyWeight.measuredAt).toISOString().slice(0, 10);
    lines.push(
      `- **Bodyweight:** ${profile.bodyWeight.weight} ${profile.bodyWeight.unit}, as of ${when}. Use it to scale loads and to count bodyweight work as real volume. It may be out of date — it is what they last entered, not what they weigh today.`,
    );
  }

  if (profile.limitations) {
    lines.push(
      `- **They told you to work around this:** "${profile.limitations}" — treat it as standing instruction, not a one-off. If something you want to prescribe conflicts with it, say so and offer an alternative.`,
    );
  }

  if (lines.length === 0) return "";

  return `## What they told you about themselves\n\nThey filled this in themselves and can change it at /profile.\n\n${lines.join("\n")}`;
}
