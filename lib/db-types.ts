export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      change_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          entity: string;
          entity_id: string;
          id: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity: string;
          entity_id: string;
          id?: string;
          student_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity?: string;
          entity_id?: string;
          id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "change_log_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      claude_usage: {
        Row: {
          calls: number;
          day: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          calls?: number;
          day: string;
          user_id: string;
        };
        Update: {
          calls?: number;
          day?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claude_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      draft_items: {
        Row: {
          example: string | null;
          explanation: string | null;
          id: string;
          kind: string;
          meaning: string;
          new_topic_name: string | null;
          position: number;
          text: string;
          topic_id: string | null;
          upload_id: string;
        };
        ComputedFields: never;
        Insert: {
          example?: string | null;
          explanation?: string | null;
          id?: string;
          kind: string;
          meaning: string;
          new_topic_name?: string | null;
          position?: number;
          text: string;
          topic_id?: string | null;
          upload_id: string;
        };
        Update: {
          example?: string | null;
          explanation?: string | null;
          id?: string;
          kind?: string;
          meaning?: string;
          new_topic_name?: string | null;
          position?: number;
          text?: string;
          topic_id?: string | null;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "draft_items_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "draft_items_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          created_by_role: string;
          deleted_at: string | null;
          example: string | null;
          explanation: string | null;
          id: string;
          import_key: string | null;
          kind: string;
          last_edited_at: string | null;
          last_edited_by: string | null;
          lesson_id: string | null;
          meaning: string;
          student_id: string;
          text: string;
          topic_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          created_by_role: string;
          deleted_at?: string | null;
          example?: string | null;
          explanation?: string | null;
          id?: string;
          import_key?: string | null;
          kind: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          lesson_id?: string | null;
          meaning: string;
          student_id: string;
          text: string;
          topic_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          created_by_role?: string;
          deleted_at?: string | null;
          example?: string | null;
          explanation?: string | null;
          id?: string;
          import_key?: string | null;
          kind?: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          lesson_id?: string | null;
          meaning?: string;
          student_id?: string;
          text?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_last_edited_by_fkey";
            columns: ["last_edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_topic_id_student_id_fkey";
            columns: ["topic_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id", "student_id"];
          },
        ];
      };
      lessons: {
        Row: {
          id: string;
          import_key: string | null;
          lesson_date: string;
          published_at: string;
          published_by: string | null;
          publisher_name: string | null;
          source: string;
          student_id: string;
          tutor_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          import_key?: string | null;
          lesson_date?: string;
          published_at?: string;
          published_by?: string | null;
          publisher_name?: string | null;
          source: string;
          student_id: string;
          tutor_id?: string | null;
        };
        Update: {
          id?: string;
          import_key?: string | null;
          lesson_date?: string;
          published_at?: string;
          published_by?: string | null;
          publisher_name?: string | null;
          source?: string;
          student_id?: string;
          tutor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          student_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          claimed_at: string | null;
          dedupe_key: string;
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          send_after: string;
          sent_at: string | null;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          claimed_at?: string | null;
          dedupe_key: string;
          id?: string;
          kind: string;
          payload?: NonNullable<Json>;
          send_after?: string;
          sent_at?: string | null;
          student_id: string;
        };
        Update: {
          claimed_at?: string | null;
          dedupe_key?: string;
          id?: string;
          kind?: string;
          payload?: NonNullable<Json>;
          send_after?: string;
          sent_at?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          accent: string;
          created_at: string;
          display_name: string | null;
          email: string | null;
          focus: string | null;
          focus_updated_at: string | null;
          focus_updated_by: string | null;
          id: string;
          is_tutor: boolean;
          language: string;
          level: string | null;
          level_updated_at: string | null;
          level_updated_by: string | null;
          quiet_end: number;
          quiet_start: number;
          reminder_hour: number | null;
          reminder_mode: string;
          reminder_quiet_days: number | null;
          timezone: string;
          voice: string | null;
        };
        ComputedFields: never;
        Insert: {
          accent?: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          focus?: string | null;
          focus_updated_at?: string | null;
          focus_updated_by?: string | null;
          id: string;
          is_tutor?: boolean;
          language?: string;
          level?: string | null;
          level_updated_at?: string | null;
          level_updated_by?: string | null;
          quiet_end?: number;
          quiet_start?: number;
          reminder_hour?: number | null;
          reminder_mode?: string;
          reminder_quiet_days?: number | null;
          timezone?: string;
          voice?: string | null;
        };
        Update: {
          accent?: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          focus?: string | null;
          focus_updated_at?: string | null;
          focus_updated_by?: string | null;
          id?: string;
          is_tutor?: boolean;
          language?: string;
          level?: string | null;
          level_updated_at?: string | null;
          level_updated_by?: string | null;
          quiet_end?: number;
          quiet_start?: number;
          reminder_hour?: number | null;
          reminder_mode?: string;
          reminder_quiet_days?: number | null;
          timezone?: string;
          voice?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_focus_updated_by_fkey";
            columns: ["focus_updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_level_updated_by_fkey";
            columns: ["level_updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      session_results: {
        Row: {
          at: string;
          id: string;
          item_id: string;
          outcome: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          id?: string;
          item_id: string;
          outcome: string;
          session_id: string;
        };
        Update: {
          at?: string;
          id?: string;
          item_id?: string;
          outcome?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_results_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_results_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          counted: boolean;
          duration_s: number | null;
          ended_at: string | null;
          id: string;
          mode: string;
          started_at: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          counted?: boolean;
          duration_s?: number | null;
          ended_at?: string | null;
          id?: string;
          mode: string;
          started_at?: string;
          student_id: string;
        };
        Update: {
          counted?: boolean;
          duration_s?: number | null;
          ended_at?: string | null;
          id?: string;
          mode?: string;
          started_at?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          created_at: string;
          id: string;
          merged_at: string | null;
          merged_into: string | null;
          name: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          merged_at?: string | null;
          merged_into?: string | null;
          name: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merged_at?: string | null;
          merged_into?: string | null;
          name?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_merged_into_fkey";
            columns: ["merged_into"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "topics_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tutor_links: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          invite_email: string;
          invite_token: string;
          status: string;
          student_id: string | null;
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          invite_email: string;
          invite_token?: string;
          status?: string;
          student_id?: string | null;
          tutor_id: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          invite_email?: string;
          invite_token?: string;
          status?: string;
          student_id?: string | null;
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tutor_links_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tutor_links_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      uploads: {
        Row: {
          content_hash: string;
          created_at: string;
          extract_version: string;
          id: string;
          lesson_id: string | null;
          status: string;
          student_id: string;
          uploader_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_hash: string;
          created_at?: string;
          extract_version: string;
          id?: string;
          lesson_id?: string | null;
          status?: string;
          student_id: string;
          uploader_id?: string | null;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          extract_version?: string;
          id?: string;
          lesson_id?: string | null;
          status?: string;
          student_id?: string;
          uploader_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "uploads_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "uploads_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_item: { Args: { p_item: Json }; Returns: string };
      increment_claude_usage: { Args: { p_user: string; p_day: string }; Returns: number };
      is_linked_tutor: { Args: { student: string }; Returns: boolean };
      merge_topics: { Args: { p_from: string; p_into: string }; Returns: undefined };
      remove_item: { Args: { p_item: string }; Returns: undefined };
      rename_topic: { Args: { p_topic: string; p_name: string }; Returns: undefined };
      restore_item: { Args: { p_change: string }; Returns: undefined };
      undo_merge: { Args: { p_change: string }; Returns: undefined };
      update_item: { Args: { p_item: string; p_patch: Json }; Returns: undefined };
      update_lesson_date: { Args: { p_lesson: string; p_date: string }; Returns: undefined };
      publish_upload: {
        Args: { p_upload: string; p_items: Json; p_lesson_date: string | null };
        Returns: Json;
      };
      student_profile_for_tutor: {
        Args: { student: string };
        Returns: {
          display_name: string;
          focus: string;
          focus_updated_at: string;
          focus_updated_by: string;
          level: string;
          level_updated_at: string;
          level_updated_by: string;
        }[];
      };
      tutor_names_for_student: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          tutor_id: string;
        }[];
      };
      update_shared_setting: {
        Args: { field: string; student: string; value: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
