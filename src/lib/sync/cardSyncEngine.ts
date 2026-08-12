import { supabaseAdmin } from '@/lib/supabase'
import {
  getAccountIntegration, getCardByContact, createCard,
  type PanelCard, type CreateCardInput,
} from '@/lib/helena'
import { statusToStep } from '@/lib/sync/statusToStep'
import type { Json } from '@/types/database'

// ============================================================================
// cardSyncEngine (TASK-022) — o "gerente dos Correios" da sincronização
// outbound: recebe um evento da agenda, decide para qual etapa do funil o
// card deve ir, monta a mensagem (description + tags) e ENFILEIRA em
// sync_outbox. Quem entrega na Helena é o Outbox Worker (TASK-020) — esta
// engine nunca fala com a Helena para mover um card, só para RESOLVER a
// identidade dele (achar ou criar), que é uma operação síncrona e idempotente
// por natureza (ver resolveCard).
//
// Mapa dos 8 eventos -> etapa (a chave de appointment_status é a mesma usada
// em step_mappings e em FUNIL_STAGES do HelenaIntegrationTab):
//   created         -> scheduled          (AGENDADOS)
//   cancelled       -> cancelled          (CANCELOU)
//   rescheduled     -> rescheduled        (REAGENDADO)
//   no_show         -> no_show            (FALTOU)
//   completed       -> attended           (COMPARECIDO)
//   closed_lost     -> attended_no_close  (COMPARECEU E NÃO FECHOU)
//   closed_won      -> attended_closed    (COMPARECEU E FECHOU)
//   no_appointment  -> not_scheduled      (NÃO AGENDADO)
// (PEND-3: closed_lost/closed_won são derivados DEPOIS do completed — quem
// decide QUANDO disparar cada um é o chamador, TASK-023; a engine só traduz.)
//
// Dependências (TASK-020 outbox, TASK-014 espelho, TASK-013 tag_links) — ver
// docs/tasks/EPIC-02-sync-engine.md. Par técnico obrigatório: André.
// ============================================================================

export type CardMoveEventKind =
  | 'created'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'completed'
  | 'closed_lost'
  | 'closed_won'
  | 'no_appointment'

// Exportados (em vez de const interno) para a rota de diagnóstico
// /api/dev/step-mapping-check reusar a mesma lista de 8 chaves — evita que o
// dev-tool e a engine divirjam sobre quais status existem.
export const KIND_TO_STATUS_KEY: Record<CardMoveEventKind, string> = {
  created:        'scheduled',
  cancelled:       'cancelled',
  rescheduled:     'rescheduled',
  no_show:         'no_show',
  completed:       'attended',
  closed_lost:     'attended_no_close',
  closed_won:      'attended_closed',
  no_appointment:  'not_scheduled',
}

export const STATUS_LABEL: Record<CardMoveEventKind, string> = {
  created:        'Agendado',
  cancelled:       'Cancelou',
  rescheduled:     'Reagendado',
  no_show:         'Faltou',
  completed:       'Compareceu',
  closed_lost:     'Compareceu e não fechou',
  closed_won:      'Compareceu e fechou',
  no_appointment:  'Não agendado',
}

// "quem agendou" quando não há CRC humano — a esmagadora maioria dos
// agendamentos hoje vem do agente de IA (src/app/api/agent/agendar). O admin
// cadastra uma tag_links (family='crc', meaning='AGENDADO IA') para servir de
// fallback; ver TagLinkTable.tsx.
const DEFAULT_CRC_MEANING = 'AGENDADO IA'

export interface CardMoveEvent {
  kind:          CardMoveEventKind
  appointmentId?: string | null
  patientId?:    string | null
  // helena_contact_id do paciente/lead — usado para achar/criar o card na
  // Helena quando o espelho local ainda não o conhece (TASK-050 resolve isso
  // no cadastro; aqui só consumimos).
  contactId?:    string | null
  leadName?:     string | null
  // unit_id (uuid local) do agendamento — resolve a etiqueta de unidade via
  // tag_links. quem agendou (nome do CRC) — se ausente, usa DEFAULT_CRC_MEANING.
  unitId?:       string | null
  crcMeaning?:   string | null
  // Campos do bloco estruturado da description — texto livre, já formatado
  // pelo chamador (a engine não sabe formatar data/hora nem calcular resumo).
  apptLabel?:    string | null   // 📅
  summary?:      string | null   // 📋
  painNote?:     string | null   // 🦷
  nextAction?:   string | null   // 🔜
  // Só relevante para kind === 'closed_won'.
  closedValue?:  number | null
}

export interface EnqueueResult {
  helenaCardId:  string
  localCardId:   string | null
  targetStepId:  string
  cardCreated:   boolean
}

// ─── Bloco estruturado da description (anexa/atualiza, nunca sobrescreve) ────

const BLOCK_START = '— Sync automático (não editar entre estas linhas) —'
const BLOCK_END   = '— Fim do sync automático —'

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function buildStructuredBlock(event: CardMoveEvent): string {
  const lines = [BLOCK_START]
  if (event.apptLabel) lines.push(`📅 Consulta: ${event.apptLabel}`)
  lines.push(`👤 Lead: ${event.leadName ?? '(sem nome)'}`)
  if (event.summary) lines.push(`📋 Resumo: ${event.summary}`)
  lines.push(`🎯 Status: ${STATUS_LABEL[event.kind]}`)
  if (event.painNote) lines.push(`🦷 Dor: ${event.painNote}`)
  if (event.kind === 'closed_won' && event.closedValue != null) {
    lines.push(`💰 Valor fechado: ${formatBRL(event.closedValue)}`)
  }
  if (event.nextAction) lines.push(`🔜 Próximo passo: ${event.nextAction}`)
  lines.push(BLOCK_END)
  return lines.join('\n')
}

// Substitui SÓ o trecho entre os marcadores (se já existir de uma sync
// anterior) ou anexa ao final — nunca apaga o resto (notas manuais da
// recepção etc.).
export function mergeDescription(current: string | null | undefined, block: string): string {
  const text = current ?? ''
  const startIdx = text.indexOf(BLOCK_START)
  const endIdx   = text.indexOf(BLOCK_END)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = text.slice(0, startIdx)
    const after  = text.slice(endIdx + BLOCK_END.length)
    return `${before}${block}${after}`
  }
  const trimmed = text.trimEnd()
  return trimmed ? `${trimmed}\n\n${block}` : block
}

// ─── Merge + dedup de tags (nunca substitui) ─────────────────────────────────

function dedupe(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

interface TagLinkRow {
  helena_tag_id: string
  family:        string
  meaning:       string | null
  unit_id:       string | null
}

export function resolveTagsToAdd(
  tagLinks: TagLinkRow[],
  unitId: string | null | undefined,
  crcMeaning: string | null | undefined,
): string[] {
  const toAdd: string[] = []
  if (unitId) {
    const unitTag = tagLinks.find(t => t.family === 'unit' && t.unit_id === unitId)
    if (unitTag) toAdd.push(unitTag.helena_tag_id)
  }
  const wantedCrc = (crcMeaning ?? DEFAULT_CRC_MEANING).trim().toLowerCase()
  const crcTag = tagLinks.find(t => t.family === 'crc' && (t.meaning ?? '').trim().toLowerCase() === wantedCrc)
  if (crcTag) toAdd.push(crcTag.helena_tag_id)
  return toAdd
}

// ─── Resolução do card (espelho -> Helena por contato -> cria) ──────────────

interface IntegrationContext {
  token:         string
  helenaPanelId: string
  localPanelId:  string
}

interface MirrorCardRow {
  id:             string
  helena_card_id: string
  description:    string | null
  tag_ids:        string[] | null
}

interface ResolvedCard {
  helenaCardId: string
  localCardId:  string | null
  description:  string | null
  tagIds:       string[]
  created:      boolean
}

// Portas injetáveis (mesmo padrão do outboxWorker/resolveHelena): isola I/O de
// Supabase e Helena para permitir testar a lógica de decisão sem rede.
export interface CardSyncDeps {
  getIntegrationContext: (accountId: string) => Promise<IntegrationContext | null>
  resolveStepId:         (accountId: string, appointmentStatus: string) => Promise<string | null>
  findMirrorCard:        (accountId: string, localPanelId: string, patientId: string) => Promise<MirrorCardRow | null>
  findRemoteCard:        (helenaPanelId: string, contactId: string, token: string) => Promise<PanelCard | null>
  createRemoteCard:      (helenaPanelId: string, input: CreateCardInput, token: string) => Promise<PanelCard>
  upsertMirrorCard:      (accountId: string, localPanelId: string, patch: Record<string, unknown>) => Promise<string>
  loadTagLinks:          (accountId: string) => Promise<TagLinkRow[]>
  enqueueOutbox:         (accountId: string, payload: Record<string, unknown>) => Promise<void>
}

function makeProdDeps(): CardSyncDeps {
  return {
    async getIntegrationContext(accountId) {
      const integ = await getAccountIntegration(accountId)
      if (!integ?.helena_token || !integ.panel_id) return null
      const { data: panel, error } = await supabaseAdmin
        .from('helena_panels')
        .select('id')
        .eq('account_id', accountId)
        .eq('helena_panel_id', integ.panel_id)
        .maybeSingle()
      if (error) throw new Error(`Erro ao resolver painel local: ${error.message}`)
      if (!panel) return null
      return { token: integ.helena_token, helenaPanelId: integ.panel_id, localPanelId: panel.id }
    },
    resolveStepId: statusToStep,
    async findMirrorCard(accountId, localPanelId, patientId) {
      const { data, error } = await supabaseAdmin
        .from('helena_cards')
        .select('id, helena_card_id, description, tag_ids')
        .eq('account_id', accountId)
        .eq('panel_id', localPanelId)
        .eq('patient_id', patientId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1)
      if (error) throw new Error(`Erro ao ler espelho de cards: ${error.message}`)
      return data?.[0] ?? null
    },
    findRemoteCard: getCardByContact,
    async createRemoteCard(helenaPanelId, input, token) {
      return createCard(helenaPanelId, input, token)
    },
    async upsertMirrorCard(accountId, localPanelId, patch) {
      const { data, error } = await supabaseAdmin
        .from('helena_cards')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ account_id: accountId, panel_id: localPanelId, ...patch } as any, { onConflict: 'account_id,helena_card_id' })
        .select('id')
        .single()
      if (error) throw new Error(`Erro ao gravar card no espelho: ${error.message}`)
      return data.id
    },
    async loadTagLinks(accountId) {
      const { data, error } = await supabaseAdmin
        .from('tag_links')
        .select('helena_tag_id, family, meaning, unit_id')
        .eq('account_id', accountId)
      if (error) throw new Error(`Erro ao ler tag_links: ${error.message}`)
      return data ?? []
    },
    async enqueueOutbox(accountId, payload) {
      const { error } = await supabaseAdmin
        .from('sync_outbox')
        .insert({ account_id: accountId, operation: 'move_card', payload: payload as unknown as Json, origin: 'platform' })
      if (error) throw new Error(`Erro ao enfileirar move_card: ${error.message}`)
    },
  }
}

async function resolveCard(
  accountId: string,
  ctx: IntegrationContext,
  event: CardMoveEvent,
  deps: CardSyncDeps,
): Promise<ResolvedCard> {
  // 1. Espelho local — mais rápido, não bate na Helena.
  if (event.patientId) {
    const mirror = await deps.findMirrorCard(accountId, ctx.localPanelId, event.patientId)
    if (mirror) {
      return {
        helenaCardId: mirror.helena_card_id,
        localCardId:  mirror.id,
        description:  mirror.description,
        tagIds:       mirror.tag_ids ?? [],
        created:      false,
      }
    }
  }

  // 2. Helena por contato — paciente vinculado mas ainda não espelhado (ex.:
  //    Panel Mirror não rodou desde a criação do card) ou lead puro sem patient_id.
  if (event.contactId) {
    const remote = await deps.findRemoteCard(ctx.helenaPanelId, event.contactId, ctx.token)
    if (remote) {
      return {
        helenaCardId: remote.id,
        localCardId:  null,
        description:  remote.description,
        tagIds:        remote.tagIds ?? [],
        created:       false,
      }
    }
  }

  // 3. Não existe em lugar nenhum -> cria. Sem contactId não há como criar um
  //    card vinculável de forma segura (ficaria órfão no painel) — falha alto
  //    e claro em vez de inventar um card sem paciente/lead identificável.
  if (!event.contactId) {
    throw new Error(
      'Não foi possível resolver nem criar o card: contactId (helena_contact_id) ausente. ' +
      'Resolva o vínculo Helena do paciente (TASK-050) antes de sincronizar.',
    )
  }
  const created = await deps.createRemoteCard(ctx.helenaPanelId, {
    contactId: event.contactId,
    title:     event.leadName ?? undefined,
  }, ctx.token)

  const localCardId = await deps.upsertMirrorCard(accountId, ctx.localPanelId, {
    helena_card_id: created.id,
    patient_id:     event.patientId ?? null,
    lead_name:      event.leadName ?? null,
    description:    created.description ?? null,
    tag_ids:        created.tagIds ?? [],
  })

  return {
    helenaCardId: created.id,
    localCardId,
    description:  created.description ?? null,
    tagIds:        created.tagIds ?? [],
    created:       true,
  }
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

// Decide para onde o card vai e enfileira o move_card em sync_outbox. NUNCA
// fala com a Helena para mover — só para resolver a identidade do card
// (achar/criar). Quem entrega na Helena é o Outbox Worker (TASK-020).
export async function enqueueCardMove(
  accountId: string,
  event: CardMoveEvent,
  deps: CardSyncDeps = makeProdDeps(),
): Promise<EnqueueResult> {
  const ctx = await deps.getIntegrationContext(accountId)
  if (!ctx) {
    throw new Error('Integração Helena não configurada ou painel não sincronizado para esta conta (rode Configurações > Integração Helena).')
  }

  const statusKey = KIND_TO_STATUS_KEY[event.kind]
  const targetStepId = await deps.resolveStepId(accountId, statusKey)
  if (!targetStepId) {
    throw new Error(`Nenhuma etapa mapeada para o status "${statusKey}" (configure em Configurações > Integração Helena).`)
  }

  const resolved = await resolveCard(accountId, ctx, event, deps)

  const block = buildStructuredBlock(event)
  const description = mergeDescription(resolved.description, block)

  const tagLinks = await deps.loadTagLinks(accountId)
  const toAdd = resolveTagsToAdd(tagLinks, event.unitId, event.crcMeaning)
  const tagIds = dedupe([...resolved.tagIds, ...toAdd])

  const payload: Record<string, unknown> = {
    helena_card_id:        resolved.helenaCardId,
    stepId:                targetStepId,
    description,
    tagIds,
    appointment_id:        event.appointmentId ?? null,
    helena_card_local_id:  resolved.localCardId,
  }
  // Guardado no payload para consumo futuro (o Outbox Worker de hoje, TASK-020,
  // ainda não grava closed_value no espelho — combinado com André para decidir
  // se entra nesta task ou numa seguinte). O valor já fica visível na
  // description (💰) independentemente disso.
  if (event.kind === 'closed_won' && event.closedValue != null) {
    payload.closed_value = event.closedValue
  }

  await deps.enqueueOutbox(accountId, payload)

  return {
    helenaCardId: resolved.helenaCardId,
    localCardId:  resolved.localCardId,
    targetStepId,
    cardCreated:  resolved.created,
  }
}
