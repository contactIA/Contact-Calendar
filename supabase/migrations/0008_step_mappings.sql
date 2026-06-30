-- ============================================================================
-- 0008 — Mapeamento das 9 etapas do funil → StepId real da Helena
--
-- Contexto: TASK-011 permite ao admin mapear cada status interno do sistema
-- (lead, scheduled, cancelled...) ao StepId correspondente no painel Helena.
-- Armazenado como JSONB para flexibilidade — chave = status interno,
-- valor = StepId (UUID da etapa na Helena).
-- Exemplo: { "scheduled": "f823...", "cancelled": "f3a7...", ... }
-- ============================================================================

ALTER TABLE public.account_integrations
  ADD COLUMN IF NOT EXISTS step_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;
