-- Domain enums for the exercise catalogue and workout logging.
--
-- Values are kept identical to the workout-cool dataset so its CSV exports
-- import without a value mapping table. The one structural change: workout-cool
-- packs every value into a single `ExerciseAttributeValueEnum`, which lets a
-- muscle be stored as equipment. Splitting it per category makes those states
-- unrepresentable.

create type public.exercise_type as enum (
  'BODYWEIGHT',
  'STRENGTH',
  'POWERLIFTING',
  'CALISTHENIC',
  'PLYOMETRICS',
  'STRETCHING',
  'STRONGMAN',
  'CARDIO',
  'STABILIZATION',
  'POWER',
  'RESISTANCE',
  'CROSSFIT',
  'WEIGHTLIFTING'
);

create type public.muscle_group as enum (
  'BICEPS',
  'SHOULDERS',
  'CHEST',
  'BACK',
  'GLUTES',
  'TRICEPS',
  'HAMSTRINGS',
  'QUADRICEPS',
  'FOREARMS',
  'CALVES',
  'TRAPS',
  'ABDOMINALS',
  'NECK',
  'LATS',
  'ADDUCTORS',
  'ABDUCTORS',
  'OBLIQUES',
  'GROIN',
  'FULL_BODY',
  'ROTATOR_CUFF',
  'HIP_FLEXOR',
  'ACHILLES_TENDON',
  'FINGERS'
);

create type public.equipment as enum (
  'DUMBBELL',
  'KETTLEBELLS',
  'BARBELL',
  'SMITH_MACHINE',
  'BODY_ONLY',
  'BANDS',
  'EZ_BAR',
  'MACHINE',
  'DESK',
  'PULLUP_BAR',
  'CABLE',
  'MEDICINE_BALL',
  'SWISS_BALL',
  'FOAM_ROLL',
  'WEIGHT_PLATE',
  'TRX',
  'BOX',
  'ROPES',
  'SPIN_BIKE',
  'STEP',
  'BOSU',
  'TYRE',
  'SANDBAG',
  'POLE',
  'BENCH',
  'WALL',
  'BAR',
  'RACK',
  'CAR',
  'SLED',
  'CHAIN',
  'SKIERG',
  'ROPE',
  'NONE',
  'OTHER',
  'NA'
);

create type public.mechanics_type as enum ('ISOLATION', 'COMPOUND');

-- What a set measures. A set may track several at once (weight + reps).
create type public.workout_set_type as enum ('TIME', 'WEIGHT', 'REPS', 'BODYWEIGHT');

create type public.weight_unit as enum ('kg', 'lbs');

create type public.user_role as enum ('user', 'admin');
