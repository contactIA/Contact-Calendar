-- ============================================================================
-- 0009 — Vínculo de tags Helena → significado (TASK-013)
--
-- Contexto: as tags são pré-criadas manualmente no painel Helena (ADR 8) e a
-- API só as expõe por UUID. Esta tabela é o "tradutor": o admin vincula cada
-- UUID a uma família (unit = unidade, crc = quem agendou, channel = canal de
-- origem) e a um significado. Quando family = 'unit', unit_id aponta para a
-- unidade correspondente do cadastro — é o que o sync (TASK-022) e os filtros
-- dos dashboards vão consumir.
--
-- RLS: deny-all (habilitada sem policies), padrão do schema. Todo acesso é
-- via service_role no backend, com filtro por account_id nas queries.
-- ============================================================================

CREATE TABLE public.tag_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  helena_tag_id text        NOT NULL,  -- UUID da tag na Helena (texto: id externo, sem FK)
  family        text        NOT NULL CHECK (family IN ('unit', 'crc', 'channel')),
  meaning       text,                  -- significado legível (ex.: "Instagram", "Agendados Ana")
  unit_id       uuid        REFERENCES public.units(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Cada tag Helena só pode ter um vínculo por conta (alvo do upsert do PUT)
  UNIQUE (account_id, helena_tag_id)
);

ALTER TABLE public.tag_links ENABLE ROW LEVEL SECURITY;
