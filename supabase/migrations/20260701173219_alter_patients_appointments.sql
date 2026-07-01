-- ============================================================================
-- alter_patients_appointments — adiciona colunas de vinculo com a Helena,
-- valor fechado e status de sync em tabelas com DADOS REAIS. Todas as colunas
-- novas sao NULAVEIS para nao quebrar as linhas existentes. Backfill do
-- telefone para E.164 + indice unico parcial por conta.
-- ============================================================================

-- 1) patients: vinculo Helena + telefone padronizado ------------------------
alter table public.patients add column helena_contact_id text; -- id do contato na Helena
alter table public.patients add column helena_lead_id    text; -- id do lead na Helena
alter table public.patients add column phone_e164         text; -- telefone padronizado E.164

-- 2) appointments: valor fechado + status de sincronizacao ------------------
alter table public.appointments add column closed_value        numeric;     -- valor fechado
alter table public.appointments add column closed_at           timestamptz; -- quando fechou
alter table public.appointments add column confirmation_status text;        -- status de confirmacao
alter table public.appointments add column last_sync_status    text;        -- status da ultima sync

-- 3) Backfill de phone_e164 (normaliza os telefones ja existentes) ----------
-- Regra: so tratamos "55" como DDI quando ha 12-13 digitos (DDI+DDD+numero);
-- 10-11 digitos = DDD+numero (prefixa +55); vazio vira null.
update public.patients p
set phone_e164 = sub.e164
from (
  select id,
    case
      when d = '' then null
      when length(d) in (12, 13) and left(d, 2) = '55' then '+' || d
      when length(d) in (10, 11)                       then '+55' || d
      else '+' || d
    end as e164
  from (
    select id, regexp_replace(coalesce(phone, ''), '\D', '', 'g') as d
    from public.patients
  ) x
) sub
where sub.id = p.id;

-- 4) Indice unico parcial: sem telefone repetido por conta ------------------
create unique index uq_phone_per_account
  on public.patients (account_id, phone_e164)
  where phone_e164 is not null;
