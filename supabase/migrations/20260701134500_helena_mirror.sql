-- ============================================================================
-- helena_mirror — espelho local dos paineis/etapas/cards da Helena.
-- Nucleo de dados da Etapa 1 (kanban + sync). Seguranca: deny-all
-- (RLS habilitado SEM policies; acesso via service_role no backend filtrando
-- por account_id), identico ao restante do schema (ver init_schema e
-- account_integrations).
-- ============================================================================

-- 1) Paineis espelhados -------------------------------------------------------
create table public.helena_panels (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade, -- de qual clinica
  helena_panel_id text not null,               -- id do painel na Helena
  title           text,                        -- nome do painel
  synced_at       timestamptz                  -- ultima sincronizacao
);

-- 2) Etapas de cada painel (as colunas do funil) -----------------------------
create table public.helena_steps (
  id             uuid primary key default gen_random_uuid(),
  panel_id       uuid not null references public.helena_panels(id) on delete cascade,
  helena_step_id text not null,                -- StepId na Helena
  name           text,                         -- nome da etapa
  position       int                           -- ordem da coluna (1,2,3...)
);

-- 3) Cards (cada paciente/lead no funil) -------------------------------------
create table public.helena_cards (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  panel_id       uuid not null references public.helena_panels(id) on delete cascade,
  helena_card_id text not null,                -- id do card na Helena
  step_id        uuid references public.helena_steps(id) on delete set null, -- etapa atual
  patient_id     uuid references public.patients(id) on delete set null,     -- paciente (pode ser nulo)
  lead_name      text,                         -- nome do lead se nao houver paciente
  appt_date      text,                         -- campo personalizado DATA (string; IA coleta e preenche)
  appt_time      text,                         -- campo personalizado HORARIO (string; IA coleta e preenche)
  unit_tag       text,                         -- etiqueta de unidade
  crc_tag        text,                         -- etiqueta de CRC
  origin_tag     text,                         -- etiqueta de canal/origem
  closed_value   numeric,                      -- valor fechado, se houver
  status         text,                         -- status do card
  description    text,                         -- descricao (texto livre)
  tag_ids        text[],                       -- lista de UUIDs de tags
  updated_at     timestamptz                   -- ultima atualizacao
);

-- 4) Mapa status da consulta -> etapa do painel ------------------------------
create table public.step_mappings (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  appointment_status text not null,            -- ex.: 'cancelled'
  target_step_id     uuid references public.helena_steps(id) on delete set null -- vai para esta etapa
);

-- Indices e unicidade ---------------------------------------------------------
-- Os UNIQUE tambem servem como alvo de ON CONFLICT para o upsert da carga (TASK-014).
create unique index uq_panel_per_account on public.helena_panels (account_id, helena_panel_id);

create index        idx_steps_panel      on public.helena_steps (panel_id);
create unique index uq_step_per_panel    on public.helena_steps (panel_id, helena_step_id);

create index        idx_cards_account    on public.helena_cards (account_id);
create index        idx_cards_panel      on public.helena_cards (panel_id);
create index        idx_cards_step       on public.helena_cards (step_id);
create index        idx_cards_patient    on public.helena_cards (patient_id);
create unique index uq_card_per_account  on public.helena_cards (account_id, helena_card_id); -- card unico por conta

create index        idx_mappings_target  on public.step_mappings (target_step_id);
create unique index uq_mapping_status    on public.step_mappings (account_id, appointment_status); -- 1 mapeamento por status/conta

-- RLS deny-all: habilitado sem policies nas 4 tabelas -------------------------
alter table public.helena_panels enable row level security;
alter table public.helena_steps  enable row level security;
alter table public.helena_cards  enable row level security;
alter table public.step_mappings enable row level security;

-- Realtime: somente helena_cards (a tabela que o kanban observa) -------------
alter publication supabase_realtime add table public.helena_cards;
