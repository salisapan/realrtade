
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string
          title: string
          location: string
          company: string
          website: string
          cash_on_cash: string
          upside: string
          funded: string
          rented: string
          sqft: string
          floors: string
          status: string
          year: string
          price: string
          image_url: string
          category: string
          min_investment: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          location: string
          company: string
          website?: string
          cash_on_cash: string
          upside: string
          funded: string
          rented: string
          sqft: string
          floors: string
          status: string
          year: string
          price: string
          image_url: string
          category: string
          min_investment: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          location?: string
          company?: string
          website?: string
          cash_on_cash?: string
          upside?: string
          funded?: string
          rented?: string
          sqft?: string
          floors?: string
          status?: string
          year?: string
          price?: string
          image_url?: string
          category?: string
          min_investment?: number
          created_at?: string
          updated_at?: string
        }
      }
      investments: {
        Row: {
          id: string
          user_id: string
          property_id: string
          amount: number
          payment_method: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          property_id: string
          amount: number
          payment_method: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          property_id?: string
          amount?: number
          payment_method?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string
          address: string
          age: number
          annual_income: number
          net_worth: number
          investment_experience: string
          is_accredited: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          phone?: string
          address?: string
          age?: number
          annual_income?: number
          net_worth?: number
          investment_experience?: string
          is_accredited?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string
          address?: string
          age?: number
          annual_income?: number
          net_worth?: number
          investment_experience?: string
          is_accredited?: boolean
          created_at?: string
          updated_at?: string
        }
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
  }
}
