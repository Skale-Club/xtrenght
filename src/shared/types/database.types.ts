/**
 * Database types for the Xtrenght schema.
 *
 * Hand-written to mirror the output shape of `supabase gen types typescript`.
 * Once the migrations are applied to a project, regenerate rather than edit:
 *
 *   pnpm db:types
 *
 * Keeping the shape identical to the generator's means that regeneration
 * produces a readable diff instead of a rewrite.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
          role: Enums<"user_role">;
          onboarding_preferences: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          first_name?: string;
          last_name?: string;
          avatar_url?: string | null;
          role?: Enums<"user_role">;
          onboarding_preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          first_name?: string;
          last_name?: string;
          avatar_url?: string | null;
          role?: Enums<"user_role">;
          onboarding_preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          legacy_id: number | null;
          name: string;
          slug: string;
          description: string | null;
          introduction: string | null;
          full_video_url: string | null;
          full_video_image_url: string | null;
          exercise_types: Enums<"exercise_type">[];
          primary_muscles: Enums<"muscle_group">[];
          secondary_muscles: Enums<"muscle_group">[];
          equipment: Enums<"equipment">[];
          mechanics: Enums<"mechanics_type"> | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: number | null;
          name: string;
          slug: string;
          description?: string | null;
          introduction?: string | null;
          full_video_url?: string | null;
          full_video_image_url?: string | null;
          exercise_types?: Enums<"exercise_type">[];
          primary_muscles?: Enums<"muscle_group">[];
          secondary_muscles?: Enums<"muscle_group">[];
          equipment?: Enums<"equipment">[];
          mechanics?: Enums<"mechanics_type"> | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          legacy_id?: number | null;
          name?: string;
          slug?: string;
          description?: string | null;
          introduction?: string | null;
          full_video_url?: string | null;
          full_video_image_url?: string | null;
          exercise_types?: Enums<"exercise_type">[];
          primary_muscles?: Enums<"muscle_group">[];
          secondary_muscles?: Enums<"muscle_group">[];
          equipment?: Enums<"equipment">[];
          mechanics?: Enums<"mechanics_type"> | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_favorite_exercises: {
        Row: {
          user_id: string;
          exercise_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          exercise_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_favorite_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          rating: number | null;
          rating_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          rating?: number | null;
          rating_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          rating?: number | null;
          rating_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workout_session_exercises: {
        Row: {
          id: string;
          workout_session_id: string;
          exercise_id: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_session_id: string;
          exercise_id: string;
          order_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_session_id?: string;
          exercise_id?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sets: {
        Row: {
          id: string;
          workout_session_exercise_id: string;
          set_index: number;
          types: Enums<"workout_set_type">[];
          reps: number | null;
          weight: number | null;
          weight_unit: Enums<"weight_unit"> | null;
          duration_seconds: number | null;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_session_exercise_id: string;
          set_index: number;
          types?: Enums<"workout_set_type">[];
          reps?: number | null;
          weight?: number | null;
          weight_unit?: Enums<"weight_unit"> | null;
          duration_seconds?: number | null;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_session_exercise_id?: string;
          set_index?: number;
          types?: Enums<"workout_set_type">[];
          reps?: number | null;
          weight?: number | null;
          weight_unit?: Enums<"weight_unit"> | null;
          duration_seconds?: number | null;
          completed?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_session_exercise_id_fkey";
            columns: ["workout_session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "workout_session_exercises";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      owns_workout_session: {
        Args: { session_id: string };
        Returns: boolean;
      };
      owns_workout_session_exercise: {
        Args: { session_exercise_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      equipment:
        | "DUMBBELL"
        | "KETTLEBELLS"
        | "BARBELL"
        | "SMITH_MACHINE"
        | "BODY_ONLY"
        | "BANDS"
        | "EZ_BAR"
        | "MACHINE"
        | "DESK"
        | "PULLUP_BAR"
        | "CABLE"
        | "MEDICINE_BALL"
        | "SWISS_BALL"
        | "FOAM_ROLL"
        | "WEIGHT_PLATE"
        | "TRX"
        | "BOX"
        | "ROPES"
        | "SPIN_BIKE"
        | "STEP"
        | "BOSU"
        | "TYRE"
        | "SANDBAG"
        | "POLE"
        | "BENCH"
        | "WALL"
        | "BAR"
        | "RACK"
        | "CAR"
        | "SLED"
        | "CHAIN"
        | "SKIERG"
        | "ROPE"
        | "NONE"
        | "OTHER"
        | "NA";
      exercise_type:
        | "BODYWEIGHT"
        | "STRENGTH"
        | "POWERLIFTING"
        | "CALISTHENIC"
        | "PLYOMETRICS"
        | "STRETCHING"
        | "STRONGMAN"
        | "CARDIO"
        | "STABILIZATION"
        | "POWER"
        | "RESISTANCE"
        | "CROSSFIT"
        | "WEIGHTLIFTING";
      mechanics_type: "ISOLATION" | "COMPOUND";
      muscle_group:
        | "BICEPS"
        | "SHOULDERS"
        | "CHEST"
        | "BACK"
        | "GLUTES"
        | "TRICEPS"
        | "HAMSTRINGS"
        | "QUADRICEPS"
        | "FOREARMS"
        | "CALVES"
        | "TRAPS"
        | "ABDOMINALS"
        | "NECK"
        | "LATS"
        | "ADDUCTORS"
        | "ABDUCTORS"
        | "OBLIQUES"
        | "GROIN"
        | "FULL_BODY"
        | "ROTATOR_CUFF"
        | "HIP_FLEXOR"
        | "ACHILLES_TENDON"
        | "FINGERS";
      user_role: "user" | "admin";
      weight_unit: "kg" | "lbs";
      workout_set_type: "TIME" | "WEIGHT" | "REPS" | "BODYWEIGHT";
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
