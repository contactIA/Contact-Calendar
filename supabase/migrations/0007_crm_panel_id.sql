-- ============================================================================
-- 0007 — Adiciona panel_id ao account_integrations para integração CRM Helena
--
-- Contexto: TASK-010 implementou as funções CRM (listPanels, listPanelCards,
-- moveCard etc.). Cada conta pode ter um painel Helena padrão onde os cards
-- de pacientes ficam. O panel_id é configurado pelo admin via aba Integrações
-- e usado pelo backend para associar pacientes ao painel correto sem precisar
-- listar todos os painéis a cada chamada.
-- ============================================================================

ALTER TABLE public.account_integrations
  ADD COLUMN IF NOT EXISTS panel_id text;
