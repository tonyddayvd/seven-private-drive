-- ==============================================================================
-- SCHEMA INICIAL: SEVEN PRIVATE DRIVE
-- ==============================================================================

-- 1. TABELA DE CLIENTES / PASSAGEIROS
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    token TEXT UNIQUE NOT NULL,
    billing_due_day INTEGER DEFAULT 10,
    preferred_due_date DATE, -- data flexivel escolhida pelo passageiro para o ciclo atual
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA DE FATURAS MENSAIS / CICLOS DE FATURAMENTO
CREATE TABLE IF NOT EXISTS public.monthly_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    reference_month TEXT NOT NULL, -- Ex: "2026-09" ou "2026-09-A"
    start_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount NUMERIC(10,2) DEFAULT 0.00,
    rides_count INTEGER DEFAULT 0,
    status TEXT CHECK (status IN ('em_aberto', 'pendente_conferencia', 'pago', 'recusado', 'atrasado')) DEFAULT 'em_aberto',
    receipt_url TEXT,
    refusal_reason TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA DE CORRIDAS
CREATE TABLE IF NOT EXISTS public.rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    statement_id UUID REFERENCES public.monthly_statements(id) ON DELETE SET NULL,
    ride_date DATE NOT NULL DEFAULT CURRENT_DATE,
    origin TEXT,
    destination TEXT,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT CHECK (status IN ('pendente_confirmacao', 'confirmada', 'faturada', 'cancelada')) DEFAULT 'pendente_confirmacao',
    created_by TEXT CHECK (created_by IN ('driver', 'passenger')) DEFAULT 'passenger',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA DE DESPESAS OPERACIONAIS DO MOTORISTA
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    category TEXT CHECK (category IN ('combustivel', 'manutencao', 'seguro', 'alimentacao', 'outros')) DEFAULT 'combustivel',
    amount NUMERIC(10,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABELA DE CONFIGURAÇÕES GERAIS
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY DEFAULT 'config-default',
    driver_name TEXT DEFAULT 'Tony',
    pix_key_type TEXT DEFAULT 'Chave Aleatória',
    pix_key TEXT DEFAULT 'tony@exemplo.com.br',
    admin_password TEXT DEFAULT '123456',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir configuração padrão inicial caso não exista
INSERT INTO public.settings (id, driver_name, pix_key_type, pix_key, admin_password)
VALUES ('config-default', 'Tony', 'Chave Aleatória', 'tony@exemplo.com.br', '123456')
ON CONFLICT (id) DO NOTHING;

-- HABILITAR RLS (Row Level Security)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PÚBLICAS/ANÔNIMAS (Para funcionamento simplificado e PWA)
DO $$ 
BEGIN
    -- Clients
    DROP POLICY IF EXISTS "Public access for clients" ON public.clients;
    CREATE POLICY "Public access for clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

    -- Rides
    DROP POLICY IF EXISTS "Public access for rides" ON public.rides;
    CREATE POLICY "Public access for rides" ON public.rides FOR ALL USING (true) WITH CHECK (true);

    -- Monthly Statements
    DROP POLICY IF EXISTS "Public access for statements" ON public.monthly_statements;
    CREATE POLICY "Public access for statements" ON public.monthly_statements FOR ALL USING (true) WITH CHECK (true);

    -- Expenses
    DROP POLICY IF EXISTS "Public access for expenses" ON public.expenses;
    CREATE POLICY "Public access for expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

    -- Settings
    DROP POLICY IF EXISTS "Public access for settings" ON public.settings;
    CREATE POLICY "Public access for settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 6. BUCKET DE STORAGE PARA COMPROVANTES
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage para Comprovantes
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public receipts read" ON storage.objects;
    CREATE POLICY "Public receipts read" ON storage.objects FOR SELECT USING (bucket_id = 'receipts');

    DROP POLICY IF EXISTS "Public receipts insert" ON storage.objects;
    CREATE POLICY "Public receipts insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts');

    DROP POLICY IF EXISTS "Public receipts update" ON storage.objects;
    CREATE POLICY "Public receipts update" ON storage.objects FOR UPDATE USING (bucket_id = 'receipts');
END $$;
