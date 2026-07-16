import type { Enums } from "@/shared/types/database.types";

type Equipment = Enums<"equipment">;

/**
 * The equipment we ask about, and nothing else.
 *
 * The `equipment` enum has 36 values, inherited from workout-cool's model. Only
 * 15 of them are attached to a single exercise in our catalogue -- the other 21
 * (SMITH_MACHINE, PULLUP_BAR, TRX, RACK, SLED...) came from the schema, not the
 * data. Offering those would be a lie: you would tick "pull-up bar" and unlock
 * nothing.
 *
 * Counts are from the live catalogue on 2026-07-16 and are here to keep this
 * list honest -- if a number drifts to zero, the option should go.
 */
export const EQUIPMENT_OPTIONS: {
  value: Equipment;
  label: string;
  hint: string;
  count: number;
}[] = [
  { value: "BODY_ONLY", label: "Just my body", hint: "Push-ups, squats, planks", count: 111 },
  { value: "DUMBBELL", label: "Dumbbells", hint: "Any pair, any weight", count: 123 },
  { value: "BARBELL", label: "Barbell", hint: "Bar and plates", count: 171 },
  { value: "BANDS", label: "Resistance bands", hint: "Loops or tubes", count: 20 },
  { value: "KETTLEBELLS", label: "Kettlebells", hint: "", count: 53 },
  { value: "BENCH", label: "Bench", hint: "Flat or adjustable", count: 1 },
  { value: "EZ_BAR", label: "EZ bar", hint: "Curl bar", count: 9 },
  { value: "MACHINE", label: "Machines", hint: "Leg press, pec deck, etc.", count: 67 },
  { value: "CABLE", label: "Cable machine", hint: "Pulleys, crossover", count: 82 },
  { value: "MEDICINE_BALL", label: "Medicine ball", hint: "", count: 17 },
  { value: "SWISS_BALL", label: "Swiss ball", hint: "Stability ball", count: 12 },
  { value: "FOAM_ROLL", label: "Foam roller", hint: "", count: 11 },
];

/**
 * Never offered, always allowed.
 *
 * OTHER is a 122-exercise grab bag from the dataset -- Quad Stretch sits beside
 * Log Lift. It cannot be filtered honestly in either direction, so it passes for
 * everyone and the coach, which can read your equipment list, applies judgment.
 * Everything we add from here on gets tagged properly, so this stays a fixed
 * legacy wart rather than a growing one.
 *
 * ROPE and BAR are one exercise each -- import oddities not worth a checkbox.
 * They are here rather than absent because an option nobody can tick would
 * delete those two from the app for everyone, silently. Passing them through is
 * the lesser error: worst case you see one exercise you can't do.
 */
export const ALWAYS_AVAILABLE: Equipment[] = ["OTHER", "ROPE", "BAR"];

/** What to actually filter with: what they own, plus the bucket we can't judge. */
export function effectiveEquipment(owned: Equipment[] | null): Equipment[] | null {
  if (owned === null) return null; // never answered -- no filter at all
  return [...new Set([...owned, ...ALWAYS_AVAILABLE])];
}

export const EQUIPMENT_LABEL: Record<string, string> = Object.fromEntries(
  EQUIPMENT_OPTIONS.map((o) => [o.value, o.label]),
);
