-- ============================================================================
-- outbox_claim — claim atomico da fila sync_outbox para o Outbox Worker (TASK-020).
--
-- Problema: o Vercel Cron pode sobrepor execucoes (um tick lento + o proximo
-- disparando). Dois ticks lendo status='pending' e ambos entregando o mesmo
-- item = card movido 2x na Helena (efeito colateral externo irreversivel).
--
-- Solucao: uma RPC que reivindica um lote com FOR UPDATE SKIP LOCKED e marca
-- os itens como 'processing' na mesma transacao. Só o tick que ganhou o lock
-- ve a linha; o concorrente pula. Itens presos em 'processing' (crash entre
-- claim e finalizacao) sao reivindicados de novo apos um lease de 5 min —
-- seguro porque move_card e idempotente na Helena.
--
-- Estados de sync_outbox.status: 'pending' | 'processing' | 'done' | 'failed'.
-- ============================================================================

-- 1) Coluna de lease: quando o item foi reivindicado (para detectar orfaos) --
alter table public.sync_outbox add column claimed_at timestamptz;

-- Index para a varredura de claim (status + hora): cobre pending e o lease.
create index idx_outbox_claim on public.sync_outbox (status, next_retry_at, claimed_at);

-- 2) RPC de claim atomico -----------------------------------------------------
-- Retorna ate p_limit itens prontos para entrega, marcando-os 'processing'.
-- Elegiveis:
--   (a) status='pending' com next_retry_at nulo ou ja vencido; OU
--   (b) status='processing' orfao (claimed_at mais antigo que o lease p_lease_seconds).
-- Ordena por created_at (FIFO). SKIP LOCKED garante que ticks concorrentes
-- nao pegam a mesma linha. SECURITY DEFINER: roda com o dono da funcao; so o
-- backend (service_role) chama via RPC — as tabelas tem RLS deny-all.
create or replace function public.claim_outbox_batch(
  p_limit         int  default 50,
  p_lease_seconds int  default 300
)
returns setof public.sync_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.sync_outbox o
  set    status     = 'processing',
         claimed_at = now()
  where  o.id in (
    select s.id
    from   public.sync_outbox s
    where  (
             (s.status = 'pending'    and (s.next_retry_at is null or s.next_retry_at <= now()))
             or
             (s.status = 'processing' and s.claimed_at is not null and s.claimed_at < now() - make_interval(secs => p_lease_seconds))
           )
    order by s.created_at
    for update skip locked
    limit p_limit
  )
  returning o.*;
end;
$$;

-- Trava o acesso: revoga do publico/anon/authenticated; so service_role executa.
revoke all on function public.claim_outbox_batch(int, int) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(int, int) to service_role;
