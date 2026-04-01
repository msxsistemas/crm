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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_agent_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          language: string | null
          max_tokens: number | null
          name: string
          persona: string | null
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          max_tokens?: number | null
          name?: string
          persona?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          max_tokens?: number | null
          name?: string
          persona?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_interaction_logs: {
        Row: {
          ai_response: string
          contact_phone: string | null
          created_at: string
          id: string
          user_id: string
          user_message: string
        }
        Insert: {
          ai_response: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          user_id: string
          user_message: string
        }
        Update: {
          ai_response?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          user_id?: string
          user_message?: string
        }
        Relationships: []
      }
      ai_knowledge_base: {
        Row: {
          content: string
          created_at: string
          file_url: string | null
          id: string
          source_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_url?: string | null
          id?: string
          source_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_url?: string | null
          id?: string
          source_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          delivered: number
          description: string | null
          failed: number
          id: string
          message_template: string | null
          name: string
          read: number
          send_speed: number
          status: string
          total_sent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered?: number
          description?: string | null
          failed?: number
          id?: string
          message_template?: string | null
          name: string
          read?: number
          send_speed?: number
          status?: string
          total_sent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered?: number
          description?: string | null
          failed?: number
          id?: string
          message_template?: string | null
          name?: string
          read?: number
          send_speed?: number
          status?: string
          total_sent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      chatbot_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          menu_options: Json | null
          name: string
          priority: number
          response_text: string
          response_type: string
          trigger_type: string
          trigger_value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_options?: Json | null
          name: string
          priority?: number
          response_text: string
          response_type?: string
          trigger_type: string
          trigger_value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_options?: Json | null
          name?: string
          priority?: number
          response_text?: string
          response_type?: string
          trigger_type?: string
          trigger_value?: string | null
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          avatar_url: string | null
          birthday: string | null
          city: string | null
          cpf_cnpj: string | null
          created_at: string
          disable_chatbot: boolean
          email: string | null
          extra_fields: Record<string, unknown> | null
          gender: string | null
          id: string
          name: string | null
          phone: string
          reference: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          disable_chatbot?: boolean
          email?: string | null
          extra_fields?: Record<string, unknown> | null
          gender?: string | null
          id?: string
          name?: string | null
          phone: string
          reference?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          disable_chatbot?: boolean
          email?: string | null
          extra_fields?: Record<string, unknown> | null
          gender?: string | null
          id?: string
          name?: string | null
          phone?: string
          reference?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          category_id: string | null
          contact_id: string
          created_at: string
          id: string
          instance_name: string
          last_message_at: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          instance_name?: string
          last_message_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          instance_name?: string
          last_message_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_connections: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          owner_jid: string | null
          profile_pic_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          owner_jid?: string | null
          profile_pic_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          owner_jid?: string | null
          profile_pic_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gateway_configs: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          gateway_name: string
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          gateway_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          gateway_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      kanban_boards: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kanban_cards: {
        Row: {
          column_id: string
          contact_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: number
          updated_at: string
          value: number | null
        }
        Insert: {
          column_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          value?: number | null
        }
        Update: {
          column_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kanban_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          board_id: string
          color: string
          created_at: string
          id: string
          is_default: boolean
          is_finalized: boolean
          name: string
          position: number
        }
        Insert: {
          board_id: string
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_finalized?: boolean
          name: string
          position?: number
        }
        Update: {
          board_id?: string
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_finalized?: boolean
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          from_me: boolean
          id: string
          media_type: string | null
          media_url: string | null
          status: string
          whatsapp_message_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          from_me?: boolean
          id?: string
          media_type?: string | null
          media_url?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          from_me?: boolean
          id?: string
          media_type?: string | null
          media_url?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          absence_message: string | null
          avatar_url: string | null
          campaigns_access: boolean
          can_create_tags: boolean
          contacts_access: boolean
          created_at: string
          default_connection_id: string | null
          email: string | null
          end_time: string | null
          follow_me_enabled: boolean
          full_name: string | null
          goodbye_message: string | null
          id: string
          is_inactive: boolean
          limited_access: boolean
          phone_number: string | null
          signing_enabled: boolean
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          absence_message?: string | null
          avatar_url?: string | null
          campaigns_access?: boolean
          can_create_tags?: boolean
          contacts_access?: boolean
          created_at?: string
          default_connection_id?: string | null
          email?: string | null
          end_time?: string | null
          follow_me_enabled?: boolean
          full_name?: string | null
          goodbye_message?: string | null
          id: string
          is_inactive?: boolean
          limited_access?: boolean
          phone_number?: string | null
          signing_enabled?: boolean
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          absence_message?: string | null
          avatar_url?: string | null
          campaigns_access?: boolean
          can_create_tags?: boolean
          contacts_access?: boolean
          created_at?: string
          default_connection_id?: string | null
          email?: string | null
          end_time?: string | null
          follow_me_enabled?: boolean
          full_name?: string | null
          goodbye_message?: string | null
          id?: string
          is_inactive?: boolean
          limited_access?: boolean
          phone_number?: string | null
          signing_enabled?: boolean
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          id: string
          is_global: boolean
          message: string
          shortcut: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          is_global?: boolean
          message: string
          shortcut: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          is_global?: boolean
          message?: string
          shortcut?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reseller_accounts: {
        Row: {
          company_name: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          plan_id: string | null
          primary_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          plan_id?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          plan_id?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_accounts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "reseller_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_connections: number
          max_contacts: number
          max_users: number
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_connections?: number
          max_contacts?: number
          max_users?: number
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_connections?: number
          max_contacts?: number
          max_users?: number
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      reseller_sub_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reseller_id: string
          sub_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reseller_id: string
          sub_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reseller_id?: string
          sub_user_id?: string
        }
        Relationships: []
      }
      reseller_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reseller_id: string
          status: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reseller_id: string
          status?: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reseller_id?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          ciabra_external_id: string | null
          ciabra_invoice_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          plan_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciabra_external_id?: string | null
          ciabra_invoice_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciabra_external_id?: string | null
          ciabra_invoice_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "reseller_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          kanban_enabled: boolean
          name: string
          priority: number
          tag_type: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kanban_enabled?: boolean
          name: string
          priority?: number
          tag_type?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kanban_enabled?: boolean
          name?: string
          priority?: number
          tag_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_cloud_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          label: string
          phone_number: string | null
          phone_number_id: string
          status: string
          updated_at: string
          user_id: string
          waba_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          label: string
          phone_number?: string | null
          phone_number_id: string
          status?: string
          updated_at?: string
          user_id: string
          waba_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          label?: string
          phone_number?: string | null
          phone_number_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          waba_id?: string | null
        }
        Relationships: []
      }
      zapi_connections: {
        Row: {
          client_token: string
          connected: boolean
          created_at: string
          id: string
          instance_id: string
          instance_token: string
          label: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_token: string
          connected?: boolean
          created_at?: string
          id?: string
          instance_id: string
          instance_token: string
          label: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_token?: string
          connected?: boolean
          created_at?: string
          id?: string
          instance_id?: string
          instance_token?: string
          label?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "reseller" | "user"
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
      app_role: ["admin", "reseller", "user"],
    },
  },
} as const
