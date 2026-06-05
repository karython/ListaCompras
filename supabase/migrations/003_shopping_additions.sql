-- ============================================================
-- Migration 003: Fazer Compras (sessões) + Compartilhamento
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- Passo 1: Adicionar status 'saved' nas listas
-- ============================================================
ALTER TABLE shopping_lists DROP CONSTRAINT IF EXISTS shopping_lists_status_check;
ALTER TABLE shopping_lists ADD CONSTRAINT shopping_lists_status_check
  CHECK (status IN ('open', 'saved', 'closed'));

-- ============================================================
-- Passo 2: Membros de lista — criado ANTES das sessões
--          pois as políticas de sessão referenciam esta tabela
-- ============================================================
CREATE TABLE IF NOT EXISTS list_members (
  id bigserial PRIMARY KEY,
  list_id bigint REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(list_id, user_id)
);

ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_members_select" ON list_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "list_members_insert" ON list_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "list_members_delete" ON list_members
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Passo 3: Token de compartilhamento de lista
-- ============================================================
CREATE TABLE IF NOT EXISTS list_shares (
  id bigserial PRIMARY KEY,
  list_id bigint REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  share_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(list_id),
  UNIQUE(share_token)
);

ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_shares_owner" ON list_shares
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "list_shares_read" ON list_shares
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Passo 4: Sessões de compra (list_members já existe aqui)
-- ============================================================
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id bigserial PRIMARY KEY,
  list_id bigint REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  market_id bigint REFERENCES markets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select" ON shopping_sessions
  FOR SELECT USING (
    auth.uid() = user_id OR
    list_id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sessions_insert" ON shopping_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_update" ON shopping_sessions
  FOR UPDATE USING (
    auth.uid() = user_id OR
    list_id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Passo 5: Itens da sessão (list_members já existe aqui)
-- ============================================================
CREATE TABLE IF NOT EXISTS session_items (
  id bigserial PRIMARY KEY,
  session_id bigint REFERENCES shopping_sessions(id) ON DELETE CASCADE NOT NULL,
  list_item_id bigint REFERENCES list_items(id) ON DELETE CASCADE NOT NULL,
  picked boolean DEFAULT NULL,
  actual_price numeric DEFAULT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(session_id, list_item_id)
);

ALTER TABLE session_items ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para checar acesso à sessão
CREATE OR REPLACE FUNCTION public.can_access_session(p_session_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM shopping_sessions ss
    LEFT JOIN list_members lm ON lm.list_id = ss.list_id AND lm.user_id = auth.uid()
    WHERE ss.id = p_session_id AND (ss.user_id = auth.uid() OR lm.id IS NOT NULL)
  );
$$;

CREATE POLICY "session_items_all" ON session_items
  USING (can_access_session(session_id))
  WITH CHECK (can_access_session(session_id));

-- ============================================================
-- Passo 6: Atualizar RLS de shopping_lists para membros
-- ============================================================
DROP POLICY IF EXISTS "shopping_lists_all" ON shopping_lists;
DROP POLICY IF EXISTS "shopping_lists_owner" ON shopping_lists;
DROP POLICY IF EXISTS "shopping_lists_owner_all" ON shopping_lists;
DROP POLICY IF EXISTS "shopping_lists_member_read" ON shopping_lists;

CREATE POLICY "shopping_lists_owner_all" ON shopping_lists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopping_lists_member_read" ON shopping_lists
  FOR SELECT USING (
    id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Passo 7: Atualizar RLS de list_items para membros lerem
-- ============================================================
DROP POLICY IF EXISTS "list_items_all" ON list_items;
DROP POLICY IF EXISTS "list_items_owner" ON list_items;
DROP POLICY IF EXISTS "list_items_owner_all" ON list_items;
DROP POLICY IF EXISTS "list_items_member_read" ON list_items;

CREATE POLICY "list_items_owner_all" ON list_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "list_items_member_read" ON list_items
  FOR SELECT USING (
    list_id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid())
  );
