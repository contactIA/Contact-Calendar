-- ============================================================================
-- 20260813150000 — Custom fields do card (categorias de filtro) — TASK-052
--
-- Contexto: na Helena esses dados vivem como "custom fields" do card, e cada
-- clínica gera uma KEY diferente para o mesmo conceito (ex.: agendado-em pode
-- ser "agend-em-2" noutra conta). Por isso NÃO espelhamos a key da Helena:
-- a nossa plataforma passa a ser a fonte de verdade. A recepção digita esses
-- campos no NOSSO front, gravamos no NOSSO back, e filtramos no NOSSO painel.
-- A Helena fica de background (o write-through de volta é fase 2 — ver spec).
--
-- Os 4 campos são NULLABLE: o card pode nascer em qualquer fase (um lead entra
-- no funil sem agendamento). Eles se preenchem conforme a jornada avança —
-- estado vazio é a norma, não erro.
--
-- Tipos temporais (timestamptz), NÃO text: o filtro por data é de verdade
-- ("agendados para esta semana", "fechados em agosto"). Deliberadamente não
-- reaproveitamos appt_date/appt_time (string livre da IA da Helena — outro
-- propósito).
--
-- IF NOT EXISTS: idempotente. O ALTER já foi aplicado manualmente no banco de
-- produção (13/08); este arquivo versiona o schema para que novos ambientes
-- (dev do Gabriel/Daniel, reset de banco) cheguem ao mesmo estado.
-- ============================================================================

ALTER TABLE public.helena_cards
  ADD COLUMN IF NOT EXISTS campanha      text,        -- "Campanha" (recepção digita; label na Helena pode variar)
  ADD COLUMN IF NOT EXISTS agendado_em   timestamptz, -- instante em que a recepção AGENDOU (≠ criação do card)
  ADD COLUMN IF NOT EXISTS agendado_para timestamptz, -- data/hora-alvo da consulta
  ADD COLUMN IF NOT EXISTS fechado_em    timestamptz; -- quando o card fechou (won/lost)

-- Índices para os filtros por data. Incluem account_id à frente: multi-tenant,
-- todo filtro cruza a conta primeiro (padrão do projeto).
CREATE INDEX IF NOT EXISTS idx_helena_cards_agendado_para
  ON public.helena_cards (account_id, agendado_para);

CREATE INDEX IF NOT EXISTS idx_helena_cards_fechado_em
  ON public.helena_cards (account_id, fechado_em);
