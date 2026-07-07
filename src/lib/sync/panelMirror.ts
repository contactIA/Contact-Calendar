import { supabaseAdmin } from '@/lib/supabase'
import { getAccountIntegration, getPanel, listPanelCards, type PanelCard } from '@/lib/helena'

export interface SyncResult {
  panelId: string
  panelTitle: string
  stepsUpserted: number
  cardsTotal: number
  cardsLinked: number
  cardsPendingLink: number
  cardsUnlinked: number
  byStep: { stepId: string; stepName: string; count: number }[]
}

const BATCH_SIZE = 500

export async function syncPanel(accountId: string): Promise<SyncResult> {
  // 1. Config: token + panel_id
  const integ = await getAccountIntegration(accountId)
  if (!integ?.helena_token || !integ.panel_id) {
    throw new Error('Integração Helena não configurada (token ou panel_id ausente)')
  }
  const { helena_token: token, panel_id: helenaPanelId } = integ

  // 2. Fetch panel from Helena — steps come inside the raw response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPanel = await getPanel(helenaPanelId, token) as any
  const panelTitle: string = rawPanel.title ?? ''
  const rawSteps: { id: string; title: string; order?: number }[] =
    rawPanel?.steps ?? rawPanel?.columns ?? rawPanel?.phases ?? []

  // 3. Upsert panel
  const { data: panelRow, error: panelErr } = await supabaseAdmin
    .from('helena_panels')
    .upsert(
      { account_id: accountId, helena_panel_id: helenaPanelId, title: panelTitle, synced_at: new Date().toISOString() },
      { onConflict: 'account_id,helena_panel_id' },
    )
    .select('id')
    .single()
  if (panelErr) throw new Error(`Erro ao upsert panel: ${panelErr.message}`)
  const localPanelId = panelRow.id

  // 4. Upsert steps
  const { data: stepsRows, error: stepsErr } = await supabaseAdmin
    .from('helena_steps')
    .upsert(
      rawSteps.map((s, idx) => ({
        panel_id:      localPanelId,
        helena_step_id: s.id,
        name:           s.title,
        position:       s.order ?? idx + 1,
      })),
      { onConflict: 'panel_id,helena_step_id' },
    )
    .select('id, helena_step_id, name')
  if (stepsErr) throw new Error(`Erro ao upsert steps: ${stepsErr.message}`)

  const stepIdMap   = new Map<string, string>() // helena_step_id → local uuid
  const stepNameMap = new Map<string, string>() // helena_step_id → display name
  for (const s of (stepsRows ?? [])) {
    stepIdMap.set(s.helena_step_id, s.id)
    stepNameMap.set(s.helena_step_id, s.name ?? '')
  }

  // 5. Load tag_links for tag family resolution
  const { data: tagLinks, error: tagErr } = await supabaseAdmin
    .from('tag_links')
    .select('helena_tag_id, family')
    .eq('account_id', accountId)
  if (tagErr) throw new Error(`Erro ao carregar tag_links: ${tagErr.message}`)

  const tagFamilyMap = new Map<string, string>()
  for (const tl of (tagLinks ?? [])) tagFamilyMap.set(tl.helena_tag_id, tl.family)

  // 6. Paginate all cards (100 por página)
  const allCards: PanelCard[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const resp = await listPanelCards(helenaPanelId, token, page, 100)
    allCards.push(...resp.items)
    hasMore = resp.hasMorePages
    page++
  }

  // 7. Batch-resolve patient_id via helena_contact_id
  const contactIds = [...new Set(allCards.filter(c => c.contactId).map(c => c.contactId as string))]
  const contactToPatient = new Map<string, string>() // helena_contact_id → patient.id

  if (contactIds.length > 0) {
    const { data: patients, error: patErr } = await supabaseAdmin
      .from('patients')
      .select('id, helena_contact_id')
      .eq('account_id', accountId)
      .in('helena_contact_id', contactIds)
    if (patErr) throw new Error(`Erro ao resolver pacientes: ${patErr.message}`)
    for (const p of (patients ?? [])) {
      if (p.helena_contact_id) contactToPatient.set(p.helena_contact_id, p.id)
    }
  }

  // 8. Build card payloads + counters
  const now = new Date().toISOString()
  const stepCounts = new Map<string, number>()
  let linked = 0, pendingLink = 0, unlinked = 0

  const cardPayloads = allCards.map(card => {
    const localStepId = card.stepId ? stepIdMap.get(card.stepId) ?? null : null

    // Resolve tag family → column
    let unitTag: string | null = null, crcTag: string | null = null, originTag: string | null = null
    for (const tagId of (card.tagIds ?? [])) {
      const family = tagFamilyMap.get(tagId)
      if (family === 'unit')    unitTag   = tagId
      if (family === 'crc')     crcTag    = tagId
      if (family === 'channel') originTag = tagId
    }

    // Resolve patient
    const patientId = card.contactId ? contactToPatient.get(card.contactId) ?? null : null
    let status: string
    if (patientId)        { status = 'linked';   linked++ }
    else if (card.contactId) { status = 'unlinked'; unlinked++ }
    else                  { status = 'unlinked'; unlinked++ }

    // GATE R0 counter
    if (card.stepId) stepCounts.set(card.stepId, (stepCounts.get(card.stepId) ?? 0) + 1)

    return {
      account_id:     accountId,
      panel_id:       localPanelId,
      helena_card_id: card.id,
      step_id:        localStepId,
      patient_id:     patientId,
      lead_name:      card.title,
      description:    card.description,
      tag_ids:        card.tagIds,
      unit_tag:       unitTag,
      crc_tag:        crcTag,
      origin_tag:     originTag,
      status,
      updated_at:     card.updatedAt ?? now,
    }
  })

  // 9. Upsert cards in batches
  for (let i = 0; i < cardPayloads.length; i += BATCH_SIZE) {
    const { error: cardErr } = await supabaseAdmin
      .from('helena_cards')
      .upsert(cardPayloads.slice(i, i + BATCH_SIZE), { onConflict: 'account_id,helena_card_id' })
    if (cardErr) throw new Error(`Erro ao upsert cards (offset ${i}): ${cardErr.message}`)
  }

  // 10. Build per-step summary for GATE R0
  const byStep = rawSteps.map(s => ({
    stepId:   s.id,
    stepName: stepNameMap.get(s.id) ?? s.title,
    count:    stepCounts.get(s.id) ?? 0,
  }))

  return {
    panelId:          helenaPanelId,
    panelTitle,
    stepsUpserted:    rawSteps.length,
    cardsTotal:       allCards.length,
    cardsLinked:      linked,
    cardsPendingLink: pendingLink,
    cardsUnlinked:    unlinked,
    byStep,
  }
}
