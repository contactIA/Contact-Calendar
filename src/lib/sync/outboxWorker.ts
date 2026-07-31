import { supabaseAdmin } from '@/lib/supabase'
import { getHelenaTokenForAccount, moveCard, type MoveCardInput, type PanelCard } from '@/lib/helena'

// ============================================================================
// Outbox Worker (TASK-020) — o "carteiro" que drena a fila sync_outbox e
// entrega as operacoes na Helena com retry exponencial.
//
// Fluxo por item (ver docs/tasks/EPIC-02-sync-engine.md e ADRs 020-1..5):
//   1. claim atomico do lote via RPC claim_outbox_batch (FOR UPDATE SKIP LOCKED)
//      -> itens viram status='processing' (impede entrega dupla entre ticks)
//   2. agrupa por card e processa em ordem FIFO (created_at); se uma operacao
//      de um card falha, ABORTA as seguintes DAQUELE card (nao pula a ordem)
//   3. executa a operation (move_card -> moveCard do helena.ts)
//   4. sucesso  -> status='done'  + sync_log(result='ok')
//      falha     -> attempts++, next_retry_at=now()+2^attempts min, last_error,
//                   sync_log(result='error'); apos 5 -> status='failed' +
//                   appointments.last_sync_status='failed'
//      HTTP 429  -> backoff curto SEM contar tentativa (rate limit != defeito)
//
// Dependencias externas (Supabase, Helena) sao injetaveis via OutboxDeps para
// testabilidade; o default liga na infra real de producao.
// ============================================================================

const MAX_ATTEMPTS       = 5
const RATE_LIMIT_WAIT_MS = 60_000  // 1 min fixo em 429
const DEFAULT_BATCH      = 50

export interface OutboxResult {
  processed:   number
  done:        number
  failed:      number   // itens que esgotaram as tentativas neste tick
  retried:     number   // itens que voltaram para pending (vao tentar de novo)
  rateLimited: number
}

export interface OutboxRow {
  id:         string
  account_id: string
  operation:  string
  payload:    Record<string, unknown>
  attempts:   number
  status:     string
  created_at: string
}

interface MoveCardPayload {
  helena_card_id:        string
  stepId?:               string
  description?:          string
  tagIds?:               string[]
  appointment_id?:       string | null
  helena_card_local_id?: string | null
}

// Portas injetaveis. O default (makeProdDeps) usa Supabase + Helena reais.
export interface OutboxDeps {
  claimBatch:      (limit: number, leaseSeconds: number) => Promise<OutboxRow[]>
  getToken:        (accountId: string) => Promise<string | null>
  moveCard:        (cardId: string, updates: MoveCardInput, token: string) => Promise<PanelCard>
  updateOutbox:    (id: string, patch: Record<string, unknown>) => Promise<void>
  logSync:         (accountId: string, cardId: string | null, result: 'ok' | 'error', detail: Record<string, unknown>) => Promise<void>
  markApptFailed:  (accountId: string, appointmentId: string) => Promise<void>
  now:             () => number
}

function makeProdDeps(): OutboxDeps {
  return {
    async claimBatch(limit, leaseSeconds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabaseAdmin as any).rpc('claim_outbox_batch', {
        p_limit: limit, p_lease_seconds: leaseSeconds,
      })
      if (error) throw new Error(`Erro ao reivindicar fila (claim_outbox_batch): ${error.message}`)
      return (data ?? []) as OutboxRow[]
    },
    getToken: getHelenaTokenForAccount,
    moveCard,
    async updateOutbox(id, patch) {
      // Guarda de status: so muta itens 'processing' (reivindicados por ESTE
      // tick). Impede corrida com um lease-reclaim concorrente.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin as any)
        .from('sync_outbox').update(patch).eq('id', id).eq('status', 'processing')
      if (error) throw new Error(`Erro ao atualizar sync_outbox ${id}: ${error.message}`)
    },
    async logSync(accountId, cardId, result, detail) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from('sync_log').insert({
        account_id: accountId, card_id: cardId, direction: 'outbound', result, detail,
      })
    },
    async markApptFailed(accountId, appointmentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from('appointments').update({ last_sync_status: 'failed' })
        .eq('id', appointmentId).eq('account_id', accountId)  // defesa: nunca cruzar contas
    },
    now: () => Date.now(),
  }
}

// 429 da Helena chega como Error('Helena API error 429: ...') porque helenaFetch
// esgotou seus retries internos. Classificamos pela mensagem — encapsulado aqui
// para amarrar o acoplamento ao formato de helenaFetch num unico ponto.
// (Debito: helenaFetch deveria lancar HelenaApiError tipada com .status.)
export function isRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Helena API error 429')
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function processOutbox(batch = DEFAULT_BATCH, deps: OutboxDeps = makeProdDeps()): Promise<OutboxResult> {
  const result: OutboxResult = { processed: 0, done: 0, failed: 0, retried: 0, rateLimited: 0 }

  // 1. Claim atomico do lote (RPC — FOR UPDATE SKIP LOCKED, marca 'processing').
  const items = await deps.claimBatch(batch, 300)
  if (items.length === 0) return result

  // 2. Agrupa por card para preservar FIFO por card. Itens sem card identificavel
  //    caem num balde proprio (processados independentes, sem ordenacao entre si).
  const byCard = new Map<string, OutboxRow[]>()
  for (const item of items) {
    const p = (item.payload ?? {}) as Partial<MoveCardPayload>
    const key = p.helena_card_id ?? `__nocard__${item.id}`
    const arr = byCard.get(key) ?? []
    arr.push(item)
    byCard.set(key, arr)
  }

  // 3. Processa cada card em ordem; aborta o resto do card na 1a falha/backoff.
  for (const [, cardItems] of byCard) {
    cardItems.sort((a, b) => a.created_at.localeCompare(b.created_at))
    let abortRest = false
    for (const item of cardItems) {
      result.processed++
      if (abortRest) {
        // Operacao anterior do MESMO card nao concluiu — devolve esta para
        // 'pending' sem tentar, para nao furar a ordem FIFO do card.
        await deps.updateOutbox(item.id, { status: 'pending', claimed_at: null })
        result.retried++
        continue
      }
      const outcome = await processItem(item, deps)
      if (outcome === 'done')              result.done++
      else if (outcome === 'failed')       { result.failed++; abortRest = true }
      else if (outcome === 'rate_limited') { result.rateLimited++; abortRest = true }
      else /* retried */                   { result.retried++; abortRest = true }
    }
  }

  return result
}

type ItemOutcome = 'done' | 'retried' | 'failed' | 'rate_limited'

async function processItem(item: OutboxRow, deps: OutboxDeps): Promise<ItemOutcome> {
  const cardLocalId = cardLocalIdOf(item)

  // Guarda de operacao: hoje so 'move_card'. Operacao desconhecida = falha
  // definitiva (nao fica reciclando algo que o worker nao sabe executar).
  if (item.operation !== 'move_card') {
    return await fail(item, deps, `Operacao desconhecida: ${item.operation}`, item.attempts + 1)
  }

  const p = (item.payload ?? {}) as Partial<MoveCardPayload>
  if (!p.helena_card_id || !p.stepId) {
    return await fail(item, deps, 'Payload move_card invalido: helena_card_id e stepId sao obrigatorios', item.attempts + 1)
  }

  // Token buscado em runtime por account_id — NUNCA vem no payload.
  const token = await deps.getToken(item.account_id)
  if (!token) {
    // Falha comum e transitoria (admin pode reconfigurar) -> retry, nao failed imediato.
    return await scheduleRetry(item, deps, 'Token Helena ausente para a conta')
  }

  const updates: MoveCardInput = { stepId: p.stepId }
  if (p.description !== undefined) updates.description = p.description
  if (p.tagIds !== undefined)      updates.tagIds      = p.tagIds

  try {
    await deps.moveCard(p.helena_card_id, updates, token)
    await deps.updateOutbox(item.id, { status: 'done', last_error: null })
    await deps.logSync(item.account_id, cardLocalId, 'ok', { outbox_id: item.id })
    return 'done'
  } catch (err) {
    if (isRateLimit(err)) {
      const nextRetry = new Date(deps.now() + RATE_LIMIT_WAIT_MS).toISOString()
      await deps.updateOutbox(item.id, {
        status: 'pending', last_error: 'Helena rate limit (429)', next_retry_at: nextRetry, claimed_at: null,
      })
      await deps.logSync(item.account_id, cardLocalId, 'error', { outbox_id: item.id, reason: 'rate_limited_429', next_retry_at: nextRetry })
      return 'rate_limited'
    }
    return await scheduleRetry(item, deps, errText(err))
  }
}

// Retorna 'failed' se esgotou as tentativas, senao agenda backoff e 'retried'.
async function scheduleRetry(item: OutboxRow, deps: OutboxDeps, reason: string): Promise<ItemOutcome> {
  const attempts = item.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    return await fail(item, deps, reason, attempts)
  }
  const backoffMs = Math.pow(2, attempts) * 60_000  // 2^attempts minutos
  const nextRetry = new Date(deps.now() + backoffMs).toISOString()
  await deps.updateOutbox(item.id, {
    status: 'pending', attempts, last_error: reason, next_retry_at: nextRetry, claimed_at: null,
  })
  await deps.logSync(item.account_id, cardLocalIdOf(item), 'error', { outbox_id: item.id, reason, attempts, next_retry_at: nextRetry })
  return 'retried'
}

// Marca falha definitiva: status='failed' + sinaliza a consulta + loga.
async function fail(item: OutboxRow, deps: OutboxDeps, reason: string, attempts: number): Promise<'failed'> {
  await deps.updateOutbox(item.id, { status: 'failed', attempts, last_error: reason })
  await deps.logSync(item.account_id, cardLocalIdOf(item), 'error', { outbox_id: item.id, reason, attempts })
  const p = (item.payload ?? {}) as Partial<MoveCardPayload>
  if (p.appointment_id) await deps.markApptFailed(item.account_id, p.appointment_id)
  return 'failed'
}

function cardLocalIdOf(item: OutboxRow): string | null {
  const p = (item.payload ?? {}) as Partial<MoveCardPayload>
  return p.helena_card_local_id ?? null
}
