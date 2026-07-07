-- ============================================================================
-- sync_infra — infraestrutura de entrega confiavel para a sincronizacao Helena.
-- Depende de helena_mirror (helena_cards). Seguranca: deny-all (RLS habilitado
-- SEM policies; acesso via service_role no backend filtrando account_id).
-- ============================================================================

-- 1) Fila de saida (o que precisa ser enviado a Helena) ----------------------
create table public.sync_outbox (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  operation     text not null,                       -- ex.: 'move_card'
  payload       jsonb not null,                      -- dados da operacao
  origin        text not null,                       -- 'platform' | 'helena' | 'n8n'
  attempts      int  not null default 0,             -- quantas tentativas ja houve
  status        text not null default 'pending',     -- 'pending' | 'done' | 'failed'
  next_retry_at timestamptz,                          -- quando tentar de novo
  last_error    text,                                 -- ultimo erro, se houve
  created_at    timestamptz not null default now()
);

-- 2) Eventos recebidos (dedup para nao processar duas vezes) -----------------
create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  helena_event_id text not null,                     -- id do evento na Helena
  event_type      text,                              -- tipo do evento
  payload         jsonb,                             -- dados recebidos
  status          text,                              -- estado do processamento
  received_at     timestamptz not null default now()
);

-- 3) Diario de bordo das sincronizacoes --------------------------------------
create table public.sync_log (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  card_id    uuid references public.helena_cards(id) on delete set null, -- card afetado (pode ser nulo)
  direction  text,                                    -- 'inbound' | 'outbound'
  result     text,                                    -- 'ok' | 'error'
  detail     jsonb,                                   -- detalhes
  created_at timestamptz not null default now()
);

-- Indices ---------------------------------------------------------------------
-- O "carteiro" busca a fila por status + hora de tentar de novo.
create index idx_outbox_status_retry on public.sync_outbox (status, next_retry_at);
create index idx_outbox_account      on public.sync_outbox (account_id);      -- cobre a FK

-- Dedup por conta: impede processar o mesmo evento duas vezes na mesma clinica.
-- account_id como 1a coluna tambem cobre a FK account_id.
create unique index uq_event_per_account on public.webhook_events (account_id, helena_event_id);

create index idx_synclog_account on public.sync_log (account_id);            -- cobre a FK
create index idx_synclog_card    on public.sync_log (card_id);               -- cobre a FK

-- RLS deny-all: habilitado sem policies nas 3 tabelas ------------------------
alter table public.sync_outbox    enable row level security;
alter table public.webhook_events enable row level security;
alter table public.sync_log       enable row level security;
