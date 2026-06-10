-- Migration 005: Plano de assinatura e integrações de pagamento
-- Execute este script no SQL Editor do Supabase

-- Tabela de assinaturas do usuário
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'annual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_subscriptions_select" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_subscriptions_insert" ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_subscriptions_update" ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_subscriptions_delete" ON user_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Tabela de pagamentos relacionados à assinatura
CREATE TABLE IF NOT EXISTS subscription_payments (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  asaas_payment_id text NOT NULL UNIQUE,
  billing_type text NOT NULL CHECK (billing_type IN ('PIX', 'CREDIT_CARD')),
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED')),
  paid_at timestamptz,
  invoice_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  raw_response jsonb
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_payments_select" ON subscription_payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscription_payments_insert" ON subscription_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscription_payments_update" ON subscription_payments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscription_payments_delete" ON subscription_payments
  FOR DELETE USING (auth.uid() = user_id);

-- Funções auxiliares de limite
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id
      AND plan = 'annual'
      AND status = 'active'
      AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_list_count(p_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COUNT(*) FROM shopping_lists WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_completed_purchase_count(p_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COUNT(*) FROM shopping_sessions WHERE user_id = p_user_id AND status = 'completed';
$$;

CREATE OR REPLACE FUNCTION public.can_create_list(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT has_active_subscription(p_user_id)
    OR user_list_count(p_user_id) < 3;
$$;

CREATE OR REPLACE FUNCTION public.can_start_purchase(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT has_active_subscription(p_user_id)
    OR user_completed_purchase_count(p_user_id) < 3;
$$;

-- Políticas de inserção com limite para plano gratuito
DROP POLICY IF EXISTS "shopping_lists_insert" ON shopping_lists;
CREATE POLICY "shopping_lists_insert" ON shopping_lists
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND can_create_list(auth.uid())
  );

DROP POLICY IF EXISTS "shopping_sessions_insert" ON shopping_sessions;
CREATE POLICY "shopping_sessions_insert" ON shopping_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND can_start_purchase(auth.uid())
  );
