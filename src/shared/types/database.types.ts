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
          available_equipment: Enums<"equipment">[] | null;
          training_goal: Enums<"training_goal"> | null;
          sessions_per_week: number | null;
          limitations: string | null;
          onboarded_at: string | null;
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
          available_equipment?: Enums<"equipment">[] | null;
          training_goal?: Enums<"training_goal"> | null;
          sessions_per_week?: number | null;
          limitations?: string | null;
          onboarded_at?: string | null;
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
          available_equipment?: Enums<"equipment">[] | null;
          training_goal?: Enums<"training_goal"> | null;
          sessions_per_week?: number | null;
          limitations?: string | null;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      body_weight_entries: {
        Row: {
          id: string;
          user_id: string;
          weight: number;
          weight_unit: Enums<"weight_unit">;
          measured_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          weight: number;
          weight_unit?: Enums<"weight_unit">;
          measured_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          weight?: number;
          weight_unit?: Enums<"weight_unit">;
          measured_at?: string;
          created_at?: string;
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
          force: Enums<"exercise_force"> | null;
          level: Enums<"exercise_level"> | null;
          image_urls: string[];
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
          force?: Enums<"exercise_force"> | null;
          level?: Enums<"exercise_level"> | null;
          image_urls?: string[];
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
          force?: Enums<"exercise_force"> | null;
          level?: Enums<"exercise_level"> | null;
          image_urls?: string[];
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
      programs: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          category: string | null;
          image_url: string | null;
          level: Enums<"program_level">;
          equipment: Enums<"equipment">[];
          session_duration_min: number | null;
          visibility: Enums<"program_visibility">;
          participant_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          description?: string | null;
          category?: string | null;
          image_url?: string | null;
          level?: Enums<"program_level">;
          equipment?: Enums<"equipment">[];
          session_duration_min?: number | null;
          visibility?: Enums<"program_visibility">;
          participant_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          description?: string | null;
          category?: string | null;
          image_url?: string | null;
          level?: Enums<"program_level">;
          equipment?: Enums<"equipment">[];
          session_duration_min?: number | null;
          visibility?: Enums<"program_visibility">;
          participant_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      program_weeks: {
        Row: {
          id: string;
          program_id: string;
          week_number: number;
          title: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          week_number: number;
          title?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          week_number?: number;
          title?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_weeks_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      program_sessions: {
        Row: {
          id: string;
          week_id: string;
          session_number: number;
          slug: string;
          title: string;
          description: string | null;
          estimated_minutes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_id: string;
          session_number: number;
          slug: string;
          title: string;
          description?: string | null;
          estimated_minutes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          week_id?: string;
          session_number?: number;
          slug?: string;
          title?: string;
          description?: string | null;
          estimated_minutes?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_sessions_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "program_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      program_session_exercises: {
        Row: {
          id: string;
          program_session_id: string;
          exercise_id: string;
          order_index: number;
          instructions: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_session_id: string;
          exercise_id: string;
          order_index: number;
          instructions?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_session_id?: string;
          exercise_id?: string;
          order_index?: number;
          instructions?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_session_exercises_program_session_id_fkey";
            columns: ["program_session_id"];
            isOneToOne: false;
            referencedRelation: "program_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      program_suggested_sets: {
        Row: {
          id: string;
          program_session_exercise_id: string;
          set_index: number;
          types: Enums<"workout_set_type">[];
          reps: number | null;
          weight: number | null;
          weight_unit: Enums<"weight_unit"> | null;
          duration_seconds: number | null;
        };
        Insert: {
          id?: string;
          program_session_exercise_id: string;
          set_index: number;
          types?: Enums<"workout_set_type">[];
          reps?: number | null;
          weight?: number | null;
          weight_unit?: Enums<"weight_unit"> | null;
          duration_seconds?: number | null;
        };
        Update: {
          id?: string;
          program_session_exercise_id?: string;
          set_index?: number;
          types?: Enums<"workout_set_type">[];
          reps?: number | null;
          weight?: number | null;
          weight_unit?: Enums<"weight_unit"> | null;
          duration_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_suggested_sets_program_session_exercise_id_fkey";
            columns: ["program_session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "program_session_exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      user_program_enrollments: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          enrolled_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_id: string;
          enrolled_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string;
          enrolled_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_program_enrollments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      user_session_progress: {
        Row: {
          id: string;
          enrollment_id: string;
          program_session_id: string;
          workout_session_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          enrollment_id: string;
          program_session_id: string;
          workout_session_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          enrollment_id?: string;
          program_session_id?: string;
          workout_session_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_session_progress_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "user_program_enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_session_progress_program_session_id_fkey";
            columns: ["program_session_id"];
            isOneToOne: false;
            referencedRelation: "program_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_session_progress_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: true;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: Enums<"ai_message_role">;
          content: Json;
          input_tokens: number | null;
          output_tokens: number | null;
          cache_read_tokens: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: Enums<"ai_message_role">;
          content: Json;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_tokens?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: Enums<"ai_message_role">;
          content?: Json;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_tokens?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_coach_notes: {
        Row: {
          id: string;
          user_id: string;
          note: string;
          source_message_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          note: string;
          source_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          note?: string;
          source_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_coach_notes_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "ai_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: string;
          is_secret: boolean;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: string;
          is_secret?: boolean;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: string;
          is_secret?: boolean;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
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
      owns_enrollment: {
        Args: { enrollment_id: string };
        Returns: boolean;
      };
      owns_ai_conversation: {
        Args: { conversation_id: string };
        Returns: boolean;
      };
      admin_list_settings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          key: string;
          value: string | null;
          is_secret: boolean;
          is_set: boolean;
          description: string | null;
          updated_at: string;
        }[];
      };
      admin_set_setting: {
        Args: {
          setting_key: string;
          setting_value: string;
          setting_is_secret?: boolean;
          setting_description?: string | null;
        };
        Returns: undefined;
      };
      admin_delete_setting: {
        Args: { setting_key: string };
        Returns: undefined;
      };
      program_is_readable: {
        Args: { program_id: string };
        Returns: boolean;
      };
      week_is_readable: {
        Args: { week_id: string };
        Returns: boolean;
      };
      program_session_is_readable: {
        Args: { session_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      ai_message_role: "user" | "assistant";
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
      exercise_force: "PUSH" | "PULL" | "STATIC";
      exercise_level: "BEGINNER" | "INTERMEDIATE" | "EXPERT";
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
      program_level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
      program_visibility: "DRAFT" | "PUBLISHED" | "ARCHIVED";
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
        | "FINGERS"
        | "LOWER_BACK"
        | "MIDDLE_BACK";
      training_goal: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE" | "WEIGHT_LOSS" | "GENERAL_FITNESS";
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
