-- ============================================================================
-- 20260813160000 — Desfecho comercial da consulta (TASK-035 / RF-006)
--
-- Quando a recepção OU o dentista avaliador marca "Fechou"/"Não fechou" no
-- popover de uma consulta já atendida (status='completed'), registra o DESFECHO
-- COMERCIAL. O dentista avaliador é quem apresenta o orçamento na cadeira, então
-- ele também registra o fechamento (só não pode cancelar/no_show). Decisão de
-- modelagem: fechamento NÃO é um status da consulta — a consulta continua
-- 'completed' (ela foi atendida); fechar orçamento é um atributo à parte. Isso
-- evita poluir o enum appointment_status e não mistura estado clínico com
-- desfecho comercial.
--
--   closed_outcome = 'won'  -> fechou orçamento (exige closed_value > 0)
--   closed_outcome = 'lost' -> compareceu e não fechou
--   closed_outcome = NULL   -> concluída, desfecho ainda não registrado
--
-- closed_value: numeric (precisão de dinheiro), nullable — só faz sentido em 'won'.
-- Alimenta o card (engine: closed_won/closed_lost) e o futuro dashboard de
-- ticket médio / valor total fechado (RF-030).
-- ============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS closed_value   numeric,
  ADD COLUMN IF NOT EXISTS closed_outcome text
    CHECK (closed_outcome IN ('won', 'lost'));

COMMENT ON COLUMN public.appointments.closed_value IS
  'Valor R$ do orçamento fechado (TASK-035). Preenchido só quando closed_outcome=won; NULL nos demais.';
COMMENT ON COLUMN public.appointments.closed_outcome IS
  'Desfecho comercial da consulta atendida (TASK-035): won=fechou, lost=não fechou, NULL=sem desfecho. Status da consulta permanece completed.';
