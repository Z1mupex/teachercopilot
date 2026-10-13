export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_runs: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          id: string;
          input_hash: string | null;
          model: string;
          output: Json | null;
          purpose: string;
          status: string;
          teacher_id: string;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          id?: string;
          input_hash?: string | null;
          model: string;
          output?: Json | null;
          purpose: string;
          status?: string;
          teacher_id: string;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          id?: string;
          input_hash?: string | null;
          model?: string;
          output?: Json | null;
          purpose?: string;
          status?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_runs_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      answer_keys: {
        Row: {
          created_at: string;
          expected_answer: Json;
          id: string;
          question_id: string;
          rubric: Json | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expected_answer: Json;
          id?: string;
          question_id: string;
          rubric?: Json | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expected_answer?: Json;
          id?: string;
          question_id?: string;
          rubric?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answer_keys_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: true;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          created_at: string;
          grade: number | null;
          id: string;
          name: string;
          student_count: number | null;
          subject: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          grade?: number | null;
          id?: string;
          name: string;
          student_count?: number | null;
          subject?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          grade?: number | null;
          id?: string;
          name?: string;
          student_count?: number | null;
          subject?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      grading_batches: {
        Row: {
          answer_key_confirmed_at: string | null;
          answer_key_review: Json;
          answer_key_source: string | null;
          answer_key_worksheet_id: string | null;
          class_id: string | null;
          completed_at: string | null;
          created_at: string;
          grade_conversion: Json | null;
          grading_preferences: Json | null;
          grading_started_at: string | null;
          id: string;
          processed_submissions: number;
          status: string;
          teacher_id: string;
          title: string;
          total_submissions: number;
          updated_at: string;
          worksheet_id: string | null;
        };
        Insert: {
          answer_key_confirmed_at?: string | null;
          answer_key_review?: Json;
          answer_key_source?: string | null;
          answer_key_worksheet_id?: string | null;
          class_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          grade_conversion?: Json | null;
          grading_preferences?: Json | null;
          grading_started_at?: string | null;
          id?: string;
          processed_submissions?: number;
          status?: string;
          teacher_id: string;
          title: string;
          total_submissions?: number;
          updated_at?: string;
          worksheet_id?: string | null;
        };
        Update: {
          answer_key_confirmed_at?: string | null;
          answer_key_review?: Json;
          answer_key_source?: string | null;
          answer_key_worksheet_id?: string | null;
          class_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          grade_conversion?: Json | null;
          grading_preferences?: Json | null;
          grading_started_at?: string | null;
          id?: string;
          processed_submissions?: number;
          status?: string;
          teacher_id?: string;
          title?: string;
          total_submissions?: number;
          updated_at?: string;
          worksheet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "grading_batches_answer_key_teacher_fk";
            columns: ["answer_key_worksheet_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "worksheets";
            referencedColumns: ["id", "teacher_id"];
          },
          {
            foreignKeyName: "grading_batches_class_id_teacher_id_fkey";
            columns: ["class_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id", "teacher_id"];
          },
          {
            foreignKeyName: "grading_batches_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grading_batches_worksheet_id_teacher_id_fkey";
            columns: ["worksheet_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "worksheets";
            referencedColumns: ["id", "teacher_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          school_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          school_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          school_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          created_at: string;
          id: string;
          max_score: number;
          metadata: Json;
          order_index: number;
          prompt: string;
          type: string;
          updated_at: string;
          variant_id: string | null;
          worksheet_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          max_score: number;
          metadata?: Json;
          order_index: number;
          prompt: string;
          type: string;
          updated_at?: string;
          variant_id?: string | null;
          worksheet_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          max_score?: number;
          metadata?: Json;
          order_index?: number;
          prompt?: string;
          type?: string;
          updated_at?: string;
          variant_id?: string | null;
          worksheet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_variant_id_worksheet_id_fkey";
            columns: ["variant_id", "worksheet_id"];
            isOneToOne: false;
            referencedRelation: "worksheet_variants";
            referencedColumns: ["id", "worksheet_id"];
          },
          {
            foreignKeyName: "questions_worksheet_id_fkey";
            columns: ["worksheet_id"];
            isOneToOne: false;
            referencedRelation: "worksheets";
            referencedColumns: ["id"];
          },
        ];
      };
      removed_submission_images: {
        Row: {
          page_id: string;
          removed_at: string;
          teacher_id: string;
        };
        Insert: {
          page_id: string;
          removed_at?: string;
          teacher_id: string;
        };
        Update: {
          page_id?: string;
          removed_at?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "removed_submission_images_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: true;
            referencedRelation: "submission_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "removed_submission_images_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_answers: {
        Row: {
          confidence: number | null;
          created_at: string;
          crop_storage_path: string | null;
          final_score: number | null;
          id: string;
          proposed_score: number | null;
          question_id: string;
          reasoning_summary: string | null;
          recognized_answer: Json | null;
          review_status: string;
          submission_id: string;
          updated_at: string;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string;
          crop_storage_path?: string | null;
          final_score?: number | null;
          id?: string;
          proposed_score?: number | null;
          question_id: string;
          reasoning_summary?: string | null;
          recognized_answer?: Json | null;
          review_status?: string;
          submission_id: string;
          updated_at?: string;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          crop_storage_path?: string | null;
          final_score?: number | null;
          id?: string;
          proposed_score?: number | null;
          question_id?: string;
          reasoning_summary?: string | null;
          recognized_answer?: Json | null;
          review_status?: string;
          submission_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_pages: {
        Row: {
          created_at: string;
          height: number | null;
          id: string;
          page_index: number;
          storage_path: string;
          submission_id: string;
          upload_status: string;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          height?: number | null;
          id?: string;
          page_index: number;
          storage_path: string;
          submission_id: string;
          upload_status?: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          height?: number | null;
          id?: string;
          page_index?: number;
          storage_path?: string;
          submission_id?: string;
          upload_status?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "submission_pages_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          batch_id: string;
          created_at: string;
          final_score: number | null;
          grading_attempt_id: string | null;
          grading_error: string | null;
          grading_lease_until: string | null;
          id: string;
          max_score: number | null;
          proposed_score: number | null;
          status: string;
          student_name: string | null;
          updated_at: string;
          upload_index: number | null;
          variant_id: string | null;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          final_score?: number | null;
          grading_attempt_id?: string | null;
          grading_error?: string | null;
          grading_lease_until?: string | null;
          id?: string;
          max_score?: number | null;
          proposed_score?: number | null;
          status?: string;
          student_name?: string | null;
          updated_at?: string;
          upload_index?: number | null;
          variant_id?: string | null;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          final_score?: number | null;
          grading_attempt_id?: string | null;
          grading_error?: string | null;
          grading_lease_until?: string | null;
          id?: string;
          max_score?: number | null;
          proposed_score?: number | null;
          status?: string;
          student_name?: string | null;
          updated_at?: string;
          upload_index?: number | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "grading_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "worksheet_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_library_entries: {
        Row: {
          content: Json | null;
          created_at: string;
          entry_key: string;
          folder: string;
          id: string;
          kind: string;
          tags: string[];
          teacher_id: string;
          title: string;
          worksheet_id: string;
        };
        Insert: {
          content?: Json | null;
          created_at?: string;
          entry_key: string;
          folder: string;
          id?: string;
          kind: string;
          tags?: string[];
          teacher_id: string;
          title: string;
          worksheet_id: string;
        };
        Update: {
          content?: Json | null;
          created_at?: string;
          entry_key?: string;
          folder?: string;
          id?: string;
          kind?: string;
          tags?: string[];
          teacher_id?: string;
          title?: string;
          worksheet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_library_entries_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_library_entries_worksheet_id_teacher_id_fkey";
            columns: ["worksheet_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "worksheets";
            referencedColumns: ["id", "teacher_id"];
          },
        ];
      };
      teacher_notifications: {
        Row: {
          batch_id: string;
          created_at: string;
          id: string;
          item_count: number;
          kind: string;
          read_at: string | null;
          teacher_id: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          id?: string;
          item_count: number;
          kind: string;
          read_at?: string | null;
          teacher_id: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          id?: string;
          item_count?: number;
          kind?: string;
          read_at?: string | null;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_notifications_batch_id_teacher_id_fkey";
            columns: ["batch_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "grading_batches";
            referencedColumns: ["id", "teacher_id"];
          },
          {
            foreignKeyName: "teacher_notifications_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_settings: {
        Row: {
          document: Json;
          revision: number;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          document: Json;
          revision?: number;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          document?: Json;
          revision?: number;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_settings_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      worksheet_variants: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          variant_index: number;
          worksheet_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          variant_index: number;
          worksheet_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          variant_index?: number;
          worksheet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worksheet_variants_worksheet_id_fkey";
            columns: ["worksheet_id"];
            isOneToOne: false;
            referencedRelation: "worksheets";
            referencedColumns: ["id"];
          },
        ];
      };
      worksheets: {
        Row: {
          created_at: string;
          grade: number | null;
          id: string;
          source: string;
          status: string;
          subject: string | null;
          teacher_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          grade?: number | null;
          id?: string;
          source: string;
          status?: string;
          subject?: string | null;
          teacher_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          grade?: number | null;
          id?: string;
          source?: string;
          status?: string;
          subject?: string | null;
          teacher_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worksheets_teacher_id_fkey";
            columns: ["teacher_id"];
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
      claim_grading_submission: {
        // PostgreSQL accepts NULL for the base worksheet variant.
        Args: {
          p_batch: string;
          p_submission: string;
          p_variant: string | null;
        };
        Returns: string;
      };
      delete_teacher_worksheet: { Args: { p_id: string }; Returns: boolean };
      fail_grading_submission: {
        Args: {
          p_attempt: string;
          p_batch: string;
          p_error: string;
          p_submission: string;
        };
        Returns: undefined;
      };
      finalize_grading_batch: { Args: { p_batch: string }; Returns: undefined };
      finish_grading_submission: {
        Args: {
          p_answers: Json;
          p_attempt: string;
          p_batch: string;
          p_student_name: string | null;
          p_submission: string;
        };
        Returns: undefined;
      };
      manage_grading_upload: {
        Args: {
          p_batch: string;
          p_command: string;
          p_payload?: Json;
          p_revision: string;
        };
        Returns: string;
      };
      reserve_ai_run: {
        Args: { p_input_hash: string; p_model: string; p_purpose: string };
        Returns: string;
      };
      review_grading_answer: {
        Args: {
          p_answer: string;
          p_batch: string;
          p_command: string;
          p_revision: string;
          p_score?: number;
        };
        Returns: undefined;
      };
      save_batch_grade_conversion: {
        Args: {
          p_batch: string;
          p_kind: string;
          p_revision: string;
          p_scale: Json;
        };
        Returns: undefined;
      };
      save_grading_answer_key: {
        Args: {
          p_batch: string;
          p_confirm: boolean;
          p_document: Json;
          p_review: Json;
          p_revision: string;
          p_source: string;
        };
        Returns: string;
      };
      save_teacher_settings: {
        Args: { p_document: Json; p_revision: number };
        Returns: number;
      };
      save_teacher_worksheet: {
        Args: {
          p_document: Json;
          p_expected_updated_at?: string;
          p_id?: string;
        };
        Returns: Json;
      };
      save_worksheet_with_library: {
        Args: {
          p_document: Json;
          p_expected_updated_at?: string;
          p_id?: string;
        };
        Returns: Json;
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

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
