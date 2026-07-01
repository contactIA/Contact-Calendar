export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_integrations: {
        Row: {
          account_id: string
          confirm_template_id: string | null
          created_at: string
          helena_channel: string | null
          helena_enabled: boolean
          helena_token: string | null
          panel_id: string | null
          reminder_lead_hours: number
          reminder_template_id: string | null
          step_mappings: Json
          sync_contacts: boolean
          tag_completed: string | null
          tag_no_show: string | null
          tag_scheduled: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          confirm_template_id?: string | null
          created_at?: string
          helena_channel?: string | null
          helena_enabled?: boolean
          helena_token?: string | null
          panel_id?: string | null
          reminder_lead_hours?: number
          reminder_template_id?: string | null
          step_mappings?: Json
          sync_contacts?: boolean
          tag_completed?: string | null
          tag_no_show?: string | null
          tag_scheduled?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          confirm_template_id?: string | null
          created_at?: string
          helena_channel?: string | null
          helena_enabled?: boolean
          helena_token?: string | null
          panel_id?: string | null
          reminder_lead_hours?: number
          reminder_template_id?: string | null
          step_mappings?: Json
          sync_contacts?: boolean
          tag_completed?: string | null
          tag_no_show?: string | null
          tag_scheduled?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_integrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          slot_interval_minutes: number
          slug: string
          theme_config: Json
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slot_interval_minutes?: number
          slug: string
          theme_config?: Json
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slot_interval_minutes?: number
          slug?: string
          theme_config?: Json
          timezone?: string
        }
        Relationships: []
      }
      ai_api_keys: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          label: string
          last_used_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          label: string
          last_used_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          label?: string
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          account_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          chair_id: string
          created_at: string
          created_by_role: Database["public"]["Enums"]["created_by_role"]
          dentist_id: string
          duration_minutes: number
          end_at: string
          id: string
          notes: string | null
          patient_id: string
          procedure_id: string
          reminder_message_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          unit_id: string
        }
        Insert: {
          account_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          chair_id: string
          created_at?: string
          created_by_role: Database["public"]["Enums"]["created_by_role"]
          dentist_id: string
          duration_minutes: number
          end_at: string
          id?: string
          notes?: string | null
          patient_id: string
          procedure_id: string
          reminder_message_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          unit_id: string
        }
        Update: {
          account_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          chair_id?: string
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["created_by_role"]
          dentist_id?: string
          duration_minutes?: number
          end_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          procedure_id?: string
          reminder_message_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "dentists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      chairs: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          unit_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          unit_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chairs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chairs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      dentist_priorities: {
        Row: {
          account_id: string
          consider_occupation: boolean
          consider_patient_history: boolean
          created_at: string
          dentist_id: string
          id: string
          priority: number
          procedure_id: string | null
          unit_id: string | null
        }
        Insert: {
          account_id: string
          consider_occupation?: boolean
          consider_patient_history?: boolean
          created_at?: string
          dentist_id: string
          id?: string
          priority?: number
          procedure_id?: string | null
          unit_id?: string | null
        }
        Update: {
          account_id?: string
          consider_occupation?: boolean
          consider_patient_history?: boolean
          created_at?: string
          dentist_id?: string
          id?: string
          priority?: number
          procedure_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dentist_priorities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_priorities_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "dentists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_priorities_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_priorities_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      dentist_schedules: {
        Row: {
          account_id: string
          created_at: string
          day_of_week: number
          dentist_id: string
          end_time: string
          id: string
          start_time: string
          unit_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          day_of_week: number
          dentist_id: string
          end_time: string
          id?: string
          start_time: string
          unit_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          day_of_week?: number
          dentist_id?: string
          end_time?: string
          id?: string
          start_time?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dentist_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_schedules_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "dentists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_schedules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      dentist_units: {
        Row: {
          account_id: string
          created_at: string
          dentist_id: string
          id: string
          priority: number
          unit_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          dentist_id: string
          id?: string
          priority?: number
          unit_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          dentist_id?: string
          id?: string
          priority?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dentist_units_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_units_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "dentists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentist_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      dentists: {
        Row: {
          account_id: string
          color: string
          created_at: string
          cro: string | null
          id: string
          specialty: string[]
          user_id: string
        }
        Insert: {
          account_id: string
          color?: string
          created_at?: string
          cro?: string | null
          id?: string
          specialty?: string[]
          user_id: string
        }
        Update: {
          account_id?: string
          color?: string
          created_at?: string
          cro?: string | null
          id?: string
          specialty?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dentists_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dentists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_cards: {
        Row: {
          account_id: string
          appt_date: string | null
          appt_time: string | null
          closed_value: number | null
          crc_tag: string | null
          description: string | null
          helena_card_id: string
          id: string
          lead_name: string | null
          origin_tag: string | null
          panel_id: string
          patient_id: string | null
          status: string | null
          step_id: string | null
          tag_ids: string[] | null
          unit_tag: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          appt_date?: string | null
          appt_time?: string | null
          closed_value?: number | null
          crc_tag?: string | null
          description?: string | null
          helena_card_id: string
          id?: string
          lead_name?: string | null
          origin_tag?: string | null
          panel_id: string
          patient_id?: string | null
          status?: string | null
          step_id?: string | null
          tag_ids?: string[] | null
          unit_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          appt_date?: string | null
          appt_time?: string | null
          closed_value?: number | null
          crc_tag?: string | null
          description?: string | null
          helena_card_id?: string
          id?: string
          lead_name?: string | null
          origin_tag?: string | null
          panel_id?: string
          patient_id?: string | null
          status?: string | null
          step_id?: string | null
          tag_ids?: string[] | null
          unit_tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helena_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helena_cards_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "helena_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helena_cards_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helena_cards_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "helena_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_panels: {
        Row: {
          account_id: string
          helena_panel_id: string
          id: string
          synced_at: string | null
          title: string | null
        }
        Insert: {
          account_id: string
          helena_panel_id: string
          id?: string
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          account_id?: string
          helena_panel_id?: string
          id?: string
          synced_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helena_panels_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_steps: {
        Row: {
          helena_step_id: string
          id: string
          name: string | null
          panel_id: string
          position: number | null
        }
        Insert: {
          helena_step_id: string
          id?: string
          name?: string | null
          panel_id: string
          position?: number | null
        }
        Update: {
          helena_step_id?: string
          id?: string
          name?: string | null
          panel_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "helena_steps_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "helena_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          account_id: string
          birth_date: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          account_id: string
          birth_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          account_id?: string
          birth_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          account_id: string
          color: string
          created_at: string
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          required_specialty: string | null
        }
        Insert: {
          account_id: string
          color?: string
          created_at?: string
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          required_specialty?: string | null
        }
        Update: {
          account_id?: string
          color?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          required_specialty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          dentist_id: string
          end_at: string
          id: string
          rrule: string | null
          start_at: string
          type: Database["public"]["Enums"]["block_type"]
          unit_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          dentist_id: string
          end_at: string
          id?: string
          rrule?: string | null
          start_at: string
          type: Database["public"]["Enums"]["block_type"]
          unit_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          dentist_id?: string
          end_at?: string
          id?: string
          rrule?: string | null
          start_at?: string
          type?: Database["public"]["Enums"]["block_type"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "dentists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      step_mappings: {
        Row: {
          account_id: string
          appointment_status: string
          id: string
          target_step_id: string | null
        }
        Insert: {
          account_id: string
          appointment_status: string
          id?: string
          target_step_id?: string | null
        }
        Update: {
          account_id?: string
          appointment_status?: string
          id?: string
          target_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_mappings_target_step_id_fkey"
            columns: ["target_step_id"]
            isOneToOne: false
            referencedRelation: "helena_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          account_id: string
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
        }
        Insert: {
          account_id: string
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
        }
        Update: {
          account_id?: string
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_id: string
          created_at: string
          email: string | null
          external_id: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          unit_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string | null
          external_id: string
          id?: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          unit_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string | null
          external_id?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_appointment_conflict: {
        Args: {
          p_chair_id: string
          p_dentist_id: string
          p_end_at: string
          p_exclude_id?: string
          p_start_at: string
        }
        Returns: {
          conflict_id: string
          conflict_type: string
          has_conflict: boolean
        }[]
      }
      find_patients_by_phone: {
        Args: { p_account_id: string; p_phone: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_available_slots: {
        Args: {
          p_date: string
          p_dentist_id: string
          p_duration_override?: number
          p_procedure_id: string
          p_slot_interval?: number
          p_unit_id: string
        }
        Returns: {
          chair_id: string
          chair_name: string
          end_at: string
          start_at: string
        }[]
      }
      search_appointment_ids: {
        Args: { p_account_id: string; p_term: string }
        Returns: {
          id: string
        }[]
      }
      search_patients: {
        Args: {
          p_account_id: string
          p_limit?: number
          p_offset?: number
          p_query: string
        }
        Returns: {
          birth_date: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      block_type: "absence" | "break" | "meeting" | "reserved"
      created_by_role: "receptionist" | "ai_agent"
      user_role: "admin" | "receptionist" | "dentist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      block_type: ["absence", "break", "meeting", "reserved"],
      created_by_role: ["receptionist", "ai_agent"],
      user_role: ["admin", "receptionist", "dentist"],
    },
  },
} as const
