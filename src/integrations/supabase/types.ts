export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      developers: {
        Row: {
          background_check_consent: boolean
          company_address: string
          company_name: string
          company_registration_number: string
          country_of_registration: string
          created_at: string | null
          deals_completed: number | null
          email: string
          full_name: string
          id: string
          legal_disputes: boolean | null
          legal_disputes_explanation: string | null
          number_of_employees: number
          past_projects: string | null
          performance_metrics: string | null
          phone: string
          property_specialization: string[] | null
          role_in_company: string
          total_value_of_projects: number | null
          updated_at: string | null
          website_url: string | null
          years_in_operation: number
        }
        Insert: {
          background_check_consent: boolean
          company_address: string
          company_name: string
          company_registration_number: string
          country_of_registration: string
          created_at?: string | null
          deals_completed?: number | null
          email: string
          full_name: string
          id: string
          legal_disputes?: boolean | null
          legal_disputes_explanation?: string | null
          number_of_employees: number
          past_projects?: string | null
          performance_metrics?: string | null
          phone: string
          property_specialization?: string[] | null
          role_in_company: string
          total_value_of_projects?: number | null
          updated_at?: string | null
          website_url?: string | null
          years_in_operation: number
        }
        Update: {
          background_check_consent?: boolean
          company_address?: string
          company_name?: string
          company_registration_number?: string
          country_of_registration?: string
          created_at?: string | null
          deals_completed?: number | null
          email?: string
          full_name?: string
          id?: string
          legal_disputes?: boolean | null
          legal_disputes_explanation?: string | null
          number_of_employees?: number
          past_projects?: string | null
          performance_metrics?: string | null
          phone?: string
          property_specialization?: string[] | null
          role_in_company?: string
          total_value_of_projects?: number | null
          updated_at?: string | null
          website_url?: string | null
          years_in_operation?: number
        }
        Relationships: []
      }
      investments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          payment_method: string
          property_id: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          payment_method: string
          property_id: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          payment_method?: string
          property_id?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accredited_reason: string | null
          address: string | null
          age: number | null
          annual_income: number | null
          created_at: string | null
          email: string
          full_name: string
          household_income_year1: number | null
          household_income_year2: number | null
          id: string
          income_year1: number | null
          income_year2: number | null
          investment_experience: string | null
          is_accredited: boolean | null
          net_worth: number | null
          occupation: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          accredited_reason?: string | null
          address?: string | null
          age?: number | null
          annual_income?: number | null
          created_at?: string | null
          email: string
          full_name: string
          household_income_year1?: number | null
          household_income_year2?: number | null
          id: string
          income_year1?: number | null
          income_year2?: number | null
          investment_experience?: string | null
          is_accredited?: boolean | null
          net_worth?: number | null
          occupation?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          accredited_reason?: string | null
          address?: string | null
          age?: number | null
          annual_income?: number | null
          created_at?: string | null
          email?: string
          full_name?: string
          household_income_year1?: number | null
          household_income_year2?: number | null
          id?: string
          income_year1?: number | null
          income_year2?: number | null
          investment_experience?: string | null
          is_accredited?: boolean | null
          net_worth?: number | null
          occupation?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          cash_on_cash: string
          category: string
          company: string
          created_at: string | null
          floors: string
          funded: string
          id: string
          image_url: string
          location: string
          min_investment: number | null
          price: string
          rented: string
          sqft: string
          status: string
          title: string
          updated_at: string | null
          upside: string
          website: string | null
          year: string
        }
        Insert: {
          cash_on_cash: string
          category: string
          company: string
          created_at?: string | null
          floors: string
          funded: string
          id?: string
          image_url: string
          location: string
          min_investment?: number | null
          price: string
          rented: string
          sqft: string
          status: string
          title: string
          updated_at?: string | null
          upside: string
          website?: string | null
          year: string
        }
        Update: {
          cash_on_cash?: string
          category?: string
          company?: string
          created_at?: string | null
          floors?: string
          funded?: string
          id?: string
          image_url?: string
          location?: string
          min_investment?: number | null
          price?: string
          rented?: string
          sqft?: string
          status?: string
          title?: string
          updated_at?: string | null
          upside?: string
          website?: string | null
          year?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
