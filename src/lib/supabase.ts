import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xhqqjungilusfiyvmhcg.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocXFqdW5naWx1c2ZpeXZtaGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzQ0NzMsImV4cCI6MjA5Njc1MDQ3M30.53sIPO7rdJZJktrg0J9Z8JOxewvv_HE-qee4UKkEefI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Client = {
  id: string;
  name: string;
  phone?: string | null;
  token: string;
  billing_due_day: number;
  preferred_due_date?: string | null;
  is_active: boolean;
  created_at: string;
};

export type Ride = {
  id: string;
  client_id: string;
  statement_id?: string | null;
  ride_date: string;
  origin?: string | null;
  destination?: string | null;
  amount: number;
  status: "pendente_confirmacao" | "confirmada" | "faturada" | "cancelada";
  created_by: "driver" | "passenger";
  notes?: string | null;
  created_at: string;
};

export type MonthlyStatement = {
  id: string;
  client_id: string;
  reference_month: string;
  start_date?: string;
  due_date: string;
  total_amount: number;
  rides_count: number;
  status: "em_aberto" | "pendente_conferencia" | "pago" | "recusado" | "atrasado";
  receipt_url?: string | null;
  refusal_reason?: string | null;
  paid_at?: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  description: string;
  category: "combustivel" | "manutencao" | "seguro" | "alimentacao" | "outros";
  amount: number;
  expense_date: string;
  notes?: string | null;
  created_at: string;
};

export type Settings = {
  id: string;
  driver_name: string;
  pix_key_type: string;
  pix_key: string;
  admin_password?: string;
  updated_at?: string;
};
