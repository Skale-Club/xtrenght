import type { Enums } from "@/shared/types/database.types";

/**
 * Runtime copies of the database enums, for use as JSON Schema `enum` lists in
 * tool inputs. The `satisfies` clause ties each array to its enum type, so if a
 * migration adds a value the generated types gain it and TypeScript flags the
 * array here as incomplete -- the advertised choices cannot silently fall
 * behind the schema.
 */

export const MUSCLE_GROUPS = [
  "BICEPS", "SHOULDERS", "CHEST", "BACK", "GLUTES", "TRICEPS", "HAMSTRINGS",
  "QUADRICEPS", "FOREARMS", "CALVES", "TRAPS", "ABDOMINALS", "NECK", "LATS",
  "ADDUCTORS", "ABDUCTORS", "OBLIQUES", "GROIN", "FULL_BODY", "ROTATOR_CUFF",
  "HIP_FLEXOR", "ACHILLES_TENDON", "FINGERS", "LOWER_BACK", "MIDDLE_BACK",
] as const satisfies readonly Enums<"muscle_group">[];

export const EQUIPMENT = [
  "DUMBBELL", "KETTLEBELLS", "BARBELL", "SMITH_MACHINE", "BODY_ONLY", "BANDS",
  "EZ_BAR", "MACHINE", "DESK", "PULLUP_BAR", "CABLE", "MEDICINE_BALL",
  "SWISS_BALL", "FOAM_ROLL", "WEIGHT_PLATE", "TRX", "BOX", "ROPES", "SPIN_BIKE",
  "STEP", "BOSU", "TYRE", "SANDBAG", "POLE", "BENCH", "WALL", "BAR", "RACK",
  "CAR", "SLED", "CHAIN", "SKIERG", "ROPE", "NONE", "OTHER", "NA",
] as const satisfies readonly Enums<"equipment">[];

export const PROGRAM_LEVELS = [
  "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT",
] as const satisfies readonly Enums<"program_level">[];

export const PROGRAM_VISIBILITIES = [
  "DRAFT", "PUBLISHED", "ARCHIVED",
] as const satisfies readonly Enums<"program_visibility">[];

export const WORKOUT_SET_TYPES = [
  "TIME", "WEIGHT", "REPS", "BODYWEIGHT",
] as const satisfies readonly Enums<"workout_set_type">[];

export const WEIGHT_UNITS = ["kg", "lbs"] as const satisfies readonly Enums<"weight_unit">[];
