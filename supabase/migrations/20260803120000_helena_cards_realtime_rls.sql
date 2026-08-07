-- ============================================================================
-- TASK-041 — Permite que o navegador ASSINE o Realtime de helena_cards
--            sem quebrar o isolamento entre clínicas (multi-tenant).
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
-- A migration 20260701134500_helena_mirror ligou RLS em helena_cards SEM
-- policies (deny-all). Isso é correto para o backend (que usa service_role e
-- ignora RLS), mas o Supabase Realtime **respeita RLS**: uma assinatura feita
-- pelo navegador (role `authenticated`) não recebe NENHUM evento se não houver
-- uma policy de SELECT que enxergue a linha. O canal conecta e fica mudo.
--
-- SOLUÇÃO
-- Uma policy de SELECT que libera SOMENTE as linhas da conta que está no token
-- do usuário. O token é emitido pelo nosso backend em
-- `src/app/api/realtime/token/route.ts`, assinado com SUPABASE_JWT_SECRET, e
-- carrega o claim `account_id` extraído do nosso próprio JWT (que só o backend
-- consegue produzir). Resultado: cada clínica só recebe eventos dos seus cards.
--
-- ESCOPO DELIBERADAMENTE MÍNIMO (defesa em profundidade)
--   * Só SELECT — nenhuma escrita pelo cliente. Toda escrita continua indo pelo
--     backend / outbox (ADR 7, single writer).
--   * Só helena_cards — as outras 21 tabelas seguem deny-all, então o token
--     emitido não abre mais nada além desta tabela.
--   * Só a role `authenticated` — a role `anon` (chave pública do navegador,
--     sem token) continua sem ver nada.
--
-- Referência: RNF-011 (LGPD / RLS por conta), RNF-021 (Realtime na UI).
-- ============================================================================

-- 1) Privilégio de tabela ----------------------------------------------------
-- O Supabase já concede privilégios por default às roles anon/authenticated em
-- tabelas novas do schema public, mas declaramos explicitamente para a
-- migration ser autossuficiente (e para deixar claro que é SELECT e nada mais).
grant select on public.helena_cards to authenticated;

-- 2) A policy ----------------------------------------------------------------
-- `account_id = claim account_id do token`.
--
-- Notas sobre a expressão (foi escrita defensivamente de propósito):
--   * `current_setting('request.jwt.claims', true)` — o `true` faz retornar
--     NULL em vez de erro quando a variável não existe (ex.: conexão sem token).
--   * `nullif(..., '')` evita `''::jsonb`, que lançaria exceção. Exceção dentro
--     de uma policy derruba a query inteira, então nunca deixamos isso possível.
--   * comparamos como TEXT (`account_id::text`) para não arriscar um cast de
--     uuid falhar num claim malformado. Sem claim → compara com '' → nega.
--   * é equivalente a `auth.jwt() ->> 'account_id'`, só sem depender da função
--     auxiliar do schema `auth`.
create policy helena_cards_select_own_account
  on public.helena_cards
  for select
  to authenticated
  using (
    account_id::text = coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'account_id',
      ''
    )
  );

-- 3) REPLICA IDENTITY FULL ---------------------------------------------------
-- Por default o Postgres só coloca a chave primária no WAL de um DELETE. Sem
-- isso, dois problemas no kanban:
--   a) o evento de DELETE chega sem account_id, então o `filter:
--      account_id=eq.<uuid>` da assinatura NÃO casa e o card apagado nunca
--      desaparece da tela;
--   b) a policy acima não tem account_id para avaliar no DELETE.
-- Com FULL, a linha antiga inteira vai para o WAL. Custo: WAL um pouco maior —
-- irrelevante nesta tabela (dezenas/centenas de linhas por conta).
alter table public.helena_cards replica identity full;

-- Lembrete: helena_cards já está na publication supabase_realtime
-- (ver 20260701134500_helena_mirror.sql, última linha). Não repetir aqui —
-- `add table` duas vezes é erro.
