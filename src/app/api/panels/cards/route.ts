// ============================================================================
// GET /api/panels/cards?panelId=...&etiqueta=...&stepId=...&q=...
//
// A "torneira de dados" do kanban (TASK-041 / RF-020).
//
// ⚠️ REGRA DE OURO DESTA ROTA: lê SOMENTE do ESPELHO local
//    (helena_cards + helena_steps + helena_panels no Supabase).
//    NÃO existe — e não pode passar a existir — nenhum import de '@/lib/helena'
//    aqui. Bater na Helena a cada abertura do kanban é o erro clássico que
//    deixa a tela lenta e queima o rate limit da conta (RNF-001, RNF-015).
//    Quem fala com a Helena é o Panel Mirror (src/lib/sync/panelMirror.ts,
//    TASK-014) e o Outbox Worker — nunca uma rota de leitura da UI.
//
// Devolve os cards com a etapa já resolvida + a lista das etapas (colunas) na
// ordem do painel real, INCLUSIVE as etapas vazias — o KanbanBoard (TASK-042)
// precisa desenhar a coluna mesmo quando ela não tem card nenhum.
// ============================================================================

import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const zUuid = () => z.string().regex(UUID_RE, 'Invalid UUID')

const listSchema = z.object({
  // Aceita o UUID local (helena_panels.id) OU o id do painel na Helena.
  // Opcional: sem ele, resolvemos o painel da conta automaticamente (ver
  // resolvePanel) — hoje cada clínica tem um único painel configurado.
  panelId:  z.string().min(1).optional(),
  // Filtra uma coluna específica do funil (UUID local da etapa).
  stepId:   zUuid().optional(),
  // Etiqueta = UUID da tag na Helena. Casa contra o array tag_ids, então cobre
  // as três famílias (unidade / CRC / canal) com um único parâmetro.
  etiqueta: z.string().min(1).optional(),
  // Busca livre pelo nome do lead.
  q:        z.string().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(2000).default(1000),
})

const CARD_SELECT = `
  id, helena_card_id, step_id, patient_id, lead_name,
  appt_date, appt_time,
  unit_tag, crc_tag, origin_tag,
  closed_value, status, description, tag_ids, updated_at,
  step:helena_steps(id, helena_step_id, name, position),
  patient:patients(id, name, phone)
`

type PanelRow = {
  id: string
  helena_panel_id: string
  title: string | null
  synced_at: string | null
}

type ResolvedPanel =
  | { panel: PanelRow; reason: 'param' | 'single' | 'configured' }
  | { panel: null; reason: 'no_mirror' | 'not_found' | 'ambiguous' }

// Descobre de qual painel o kanban deve ler.
//
// 1. panelId veio na chamada  → usa esse (aceita uuid local ou id da Helena).
// 2. a conta tem 1 painel     → usa ele (caso real de hoje).
// 3. a conta tem vários       → usa o painel escolhido pelo admin na aba
//                               "Integração Helena" (account_integrations.panel_id).
// 4. nada resolve             → 'ambiguous', a rota devolve 400 pedindo panelId.
async function resolvePanel(accountId: string, panelIdParam?: string): Promise<ResolvedPanel> {
  const { data: panels, error } = await supabaseAdmin
    .from('helena_panels')
    .select('id, helena_panel_id, title, synced_at')
    .eq('account_id', accountId) // isolamento por conta: ponto único de entrada

  if (error) throw new Error(`Erro ao ler helena_panels: ${error.message}`)
  if (!panels || panels.length === 0) return { panel: null, reason: 'no_mirror' }

  if (panelIdParam) {
    const found = panels.find(p => p.id === panelIdParam || p.helena_panel_id === panelIdParam)
    return found ? { panel: found, reason: 'param' } : { panel: null, reason: 'not_found' }
  }

  if (panels.length === 1) return { panel: panels[0], reason: 'single' }

  // Leitura CRUA da coluna panel_id — de propósito não usamos
  // getAccountIntegration(), porque ela descriptografa o helena_token e exigiria
  // INTEGRATIONS_ENCRYPTION_KEY no ambiente. Esta rota não precisa (e não deve
  // precisar) do token da Helena para nada.
  // account_integrations não está nos tipos gerados (migration 0005).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: integ } = await (supabaseAdmin as any)
    .from('account_integrations')
    .select('panel_id')
    .eq('account_id', accountId)
    .maybeSingle()

  const configured = integ?.panel_id
    ? panels.find(p => p.helena_panel_id === integ.panel_id)
    : undefined

  return configured
    ? { panel: configured, reason: 'configured' }
    : { panel: null, reason: 'ambiguous' }
}

// Acesso: perfis humanos da conta. O ai_agent fica de fora — ele tem as rotas
// /api/agent/* e, na R2, a API pública /api/v1 (RF-060). Kanban é tela humana.
export const GET = withAuth(async (req, ctx) => {
  const parsed = listSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { panelId, stepId, etiqueta, q, limit } = parsed.data
  const accountId = ctx.user.accountId

  // ---- 1. painel -----------------------------------------------------------
  let resolved: ResolvedPanel
  try {
    resolved = await resolvePanel(accountId, panelId)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao resolver painel', 500)
  }

  if (!resolved.panel) {
    if (resolved.reason === 'no_mirror') {
      return err(
        'Espelho vazio: nenhum painel sincronizado para esta conta. Rode a sincronização em Configurações > Integração Helena.',
        409,
      )
    }
    if (resolved.reason === 'not_found') return err('Painel não encontrado nesta conta', 404)
    return err('Esta conta tem mais de um painel espelhado e nenhum configurado. Informe panelId.', 400)
  }
  const panel = resolved.panel

  // ---- 2. etapas (as colunas do kanban, na ordem do painel real) ----------
  // helena_steps não tem account_id: o isolamento vem de panel_id, e o painel
  // já foi filtrado por account_id no passo 1.
  const { data: steps, error: stepsErr } = await supabaseAdmin
    .from('helena_steps')
    .select('id, helena_step_id, name, position')
    .eq('panel_id', panel.id)
    .order('position', { ascending: true, nullsFirst: false })

  if (stepsErr) return err(`Erro ao ler etapas: ${stepsErr.message}`, 500)

  // ---- 3. cards ------------------------------------------------------------
  let query = supabaseAdmin
    .from('helena_cards')
    .select(CARD_SELECT, { count: 'exact' })
    .eq('account_id', accountId) // cinto
    .eq('panel_id', panel.id)    // e suspensório

  if (stepId)   query = query.eq('step_id', stepId)
  if (etiqueta) query = query.contains('tag_ids', [etiqueta])
  if (q)        query = query.ilike('lead_name', `%${q}%`)

  const { data: cards, error: cardsErr, count } = await query
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (cardsErr) return err(`Erro ao ler cards: ${cardsErr.message}`, 500)

  const rows = cards ?? []
  const total = count ?? rows.length

  // ---- 4. contagem por coluna ---------------------------------------------
  // Calculada sobre os cards devolvidos. Se `truncated` for true a contagem é
  // parcial — por isso ela é exposta, para o board poder avisar em vez de
  // mentir um número (o gate R0/R1 exige contagem por coluna correta).
  const countByStep = new Map<string, number>()
  let withoutStep = 0
  for (const c of rows) {
    if (c.step_id) countByStep.set(c.step_id, (countByStep.get(c.step_id) ?? 0) + 1)
    else withoutStep++
  }

  return ok({
    // Marcador explícito da origem do dado. Serve de prova de que a leitura é
    // do espelho e não da Helena (útil na revisão e no debug do kanban).
    source: 'mirror',
    panel: {
      id:              panel.id,
      helena_panel_id: panel.helena_panel_id,
      title:           panel.title,
      synced_at:       panel.synced_at,
      resolved_by:     resolved.reason,
    },
    steps: (steps ?? []).map(s => ({
      id:             s.id,
      helena_step_id: s.helena_step_id,
      name:           s.name,
      position:       s.position,
      count:          countByStep.get(s.id) ?? 0,
    })),
    // Cards sem etapa resolvida (step_id null) existem: o Panel Mirror grava
    // null quando o StepId da Helena não está no espelho. O board mostra num
    // balde "(sem etapa)" em vez de sumir com o card.
    cards: rows,
    total,
    returned: rows.length,
    truncated: total > rows.length,
    cards_without_step: withoutStep,
  })
}, ['admin', 'receptionist', 'dentist'])
