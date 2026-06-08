-- ============================================================
-- Migration 004: Permitir membros editarem itens de listas compartilhadas
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Permite que membros (não-donos) também possam inserir, atualizar
-- e deletar itens de listas que foram compartilhadas com eles.
CREATE POLICY "list_items_member_write" ON list_items
  FOR ALL
  USING (list_id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid()))
  WITH CHECK (list_id IN (SELECT list_id FROM list_members WHERE user_id = auth.uid()));
