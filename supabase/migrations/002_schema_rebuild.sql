-- ============================================================
-- Lista de Compras - Migration 002: Rebuild completo com auth
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- DICA: Para facilitar o desenvolvimento, desative a confirmação
-- de email em: Authentication > Settings > "Enable email confirmations"

-- ============================================================
-- Passo 1: Remover tabelas antigas (sem contexto de usuário)
-- ============================================================
DROP TABLE IF EXISTS public.price_history CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.markets CASCADE;
DROP TABLE IF EXISTS public.list_items CASCADE;
DROP TABLE IF EXISTS public.shopping_lists CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- Passo 2: Criar novas tabelas
-- ============================================================

-- Perfis de usuário (vinculados ao auth.users)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Mercados (por usuário)
CREATE TABLE public.markets (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets_all" ON public.markets
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Listas de compras
CREATE TABLE public.shopping_lists (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  market_id bigint REFERENCES public.markets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_lists_all" ON public.shopping_lists
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Itens das listas
CREATE TABLE public.list_items (
  id bigserial PRIMARY KEY,
  list_id bigint REFERENCES public.shopping_lists(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'un',
  price numeric NOT NULL DEFAULT 0,
  checked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "list_items_all" ON public.list_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Histórico de preços (por usuário, item e mercado)
CREATE TABLE public.price_history (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,
  market_id bigint REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_name, market_id)
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_history_all" ON public.price_history
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Passo 3: Trigger para criar perfil automaticamente no cadastro
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
