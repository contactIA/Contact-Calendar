import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { enqueueCardMove, type CardMoveEvent, type CardMoveEventKind } from '@/lib/sync/cardSyncEngine'

const VALID_KINDS: CardMoveEventKind[] = [
  'created', 'cancelled', 'rescheduled', 'no_show', 'completed',
  'closed_lost', 'closed_won', 'no_appointment',
]

// GET /api/dev/card-sync-check?secret=helena123&debug=seed
//   -> cria um paciente + um card-espelho de teste JÁ VINCULADOS (só grava no
//      espelho local — nunca chama a Helena)
// GET ...&debug=mirror&patientId=<uuid>
//   -> mostra a linha atual de helena_cards daquele paciente (description/tags)
// GET ...&debug=outbox
//   -> lista as últimas 10 linhas de sync_outbox da conta
// GET ...&kind=cancelled&patientId=<uuid>[&unitId=&crcMeaning=&apptLabel=&summary=&painNote=&nextAction=&closedValue=&leadName=]
//   -> roda enqueueCardMove() de verdade e devolve o resultado + a linha que
//      acabou de cair na sync_outbox
//
// ⚠️ Só aceita patientId (nunca contactId) DE PROPÓSITO: se o card não existir
// no espelho local, a engine falha com erro claro em vez de buscar/criar na
// Helena real — testar por aqui NUNCA dispara uma chamada de rede pra Helena.
// Rota de diagnóstico SEM auth de usuário — apenas para desenvolvimento local.
// ⚠️ Remover antes de deploy em produção.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'helena123') {
    return NextResponse.json({ error: 'Passe ?secret=helena123 na URL' }, { status: 401 })
  }

  let accountId = req.nextUrl.searchParams.get('accountId')
  if (!accountId) {
    // account_integrations não está nos tipos gerados (migration 0005).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (supabaseAdmin as any)
      .from('account_integrations')
      .select('account_id')
      .eq('helena_enabled', true)
      .limit(1)
    accountId = rows?.[0]?.account_id ?? null
  }
  if (!accountId) {
    return NextResponse.json({ error: 'Nenhuma conta com helena_enabled=true encontrada.' }, { status: 404 })
  }

  const debug = req.nextUrl.searchParams.get('debug')

  // Cria paciente + card de teste já vinculados — caminho 100% local.
  if (debug === 'seed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: integ } = await (supabaseAdmin as any)
      .from('account_integrations')
      .select('panel_id')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!integ?.panel_id) return NextResponse.json({ error: 'Conta sem panel_id configurado' }, { status: 400 })

    const { data: panel } = await supabaseAdmin
      .from('helena_panels')
      .select('id')
      .eq('account_id', accountId)
      .eq('helena_panel_id', integ.panel_id)
      .maybeSingle()
    if (!panel) return NextResponse.json({ error: 'Painel local não encontrado — rode a sincronização primeiro' }, { status: 400 })

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const { data: patient, error: patErr } = await supabaseAdmin
      .from('patients')
      .insert({ account_id: accountId, name: `Paciente Teste ${stamp}` })
      .select('id, name')
      .single()
    if (patErr) return NextResponse.json({ error: patErr.message }, { status: 500 })

    const { data: card, error: cardErr } = await supabaseAdmin
      .from('helena_cards')
      .insert({
        account_id:     accountId,
        panel_id:       panel.id,
        helena_card_id: `dev-test-${stamp}`,
        patient_id:     patient.id,
        lead_name:      patient.name,
        description:    'Nota manual da recepção: paciente pediu para confirmar por WhatsApp.',
        tag_ids:        ['tag-existente-de-teste'],
      })
      .select('id, helena_card_id')
      .single()
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 })

    return NextResponse.json({
      status: '✅ paciente + card de teste criados (só no espelho local — nada foi enviado à Helena)',
      account_id: accountId,
      patient_id: patient.id,
      helena_card_local_id: card.id,
      helena_card_id: card.helena_card_id,
      instrucao: `Agora use &kind=<evento>&patientId=${patient.id} para testar a engine.`,
    })
  }

  // Mostra a linha do espelho pra inspecionar description/tags antes e depois.
  if (debug === 'mirror') {
    const patientId = req.nextUrl.searchParams.get('patientId')
    if (!patientId) return NextResponse.json({ error: 'Passe &patientId=<uuid>' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('helena_cards')
      .select('id, helena_card_id, step_id, description, tag_ids, updated_at')
      .eq('account_id', accountId)
      .eq('patient_id', patientId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ account_id: accountId, card: data })
  }

  // Simula "o ciclo completo já rolou": pega o payload da ÚLTIMA linha da
  // outbox pra esse card e grava description/tag_ids/step_id de volta no
  // espelho — é o que o Outbox Worker + um novo Panel Mirror fariam depois de
  // entregar na Helena de verdade. Só existe pra permitir testar aqui a troca
  // do bloco (2ª rodada) sem depender do ciclo real.
  if (debug === 'apply') {
    const patientId = req.nextUrl.searchParams.get('patientId')
    if (!patientId) return NextResponse.json({ error: 'Passe &patientId=<uuid>' }, { status: 400 })

    const { data: card, error: cardErr } = await supabaseAdmin
      .from('helena_cards')
      .select('id')
      .eq('account_id', accountId)
      .eq('patient_id', patientId)
      .maybeSingle()
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 })
    if (!card) return NextResponse.json({ error: 'Card não encontrado no espelho pra esse patientId' }, { status: 404 })

    const { data: outboxRows, error: outboxErr } = await supabaseAdmin
      .from('sync_outbox')
      .select('id, payload, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (outboxErr) return NextResponse.json({ error: outboxErr.message }, { status: 500 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = (outboxRows ?? []).find((r: any) => r.payload?.helena_card_local_id === card.id)
    if (!match) return NextResponse.json({ error: 'Nenhuma linha da outbox encontrada pra esse card' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = match.payload as any
    const { error: updErr } = await supabaseAdmin
      .from('helena_cards')
      .update({
        description: payload.description ?? null,
        tag_ids:     payload.tagIds ?? [],
        step_id:     payload.stepId ?? null,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', card.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({
      status: `✅ espelho atualizado com o payload da outbox ${match.id} (simulando entrega + re-sync)`,
      account_id: accountId,
      helena_card_local_id: card.id,
    })
  }

  // Lista as últimas linhas enfileiradas — pra inspecionar o payload bruto.
  if (debug === 'outbox') {
    const { data, error } = await supabaseAdmin
      .from('sync_outbox')
      .select('id, operation, status, origin, payload, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ account_id: accountId, outbox: data ?? [] })
  }

  const kindParam = req.nextUrl.searchParams.get('kind')
  const patientId = req.nextUrl.searchParams.get('patientId')

  if (!kindParam || !patientId) {
    return NextResponse.json({
      instrucao: 'Use &debug=seed pra criar um paciente+card de teste, depois &kind=<evento>&patientId=<uuid>.',
      kinds_validos: VALID_KINDS,
    })
  }
  if (!VALID_KINDS.includes(kindParam as CardMoveEventKind)) {
    return NextResponse.json({ error: `kind inválido. Use um de: ${VALID_KINDS.join(', ')}` }, { status: 400 })
  }

  const closedValueParam = req.nextUrl.searchParams.get('closedValue')
  const event: CardMoveEvent = {
    kind:        kindParam as CardMoveEventKind,
    patientId,
    unitId:      req.nextUrl.searchParams.get('unitId'),
    crcMeaning:  req.nextUrl.searchParams.get('crcMeaning'),
    apptLabel:   req.nextUrl.searchParams.get('apptLabel'),
    summary:     req.nextUrl.searchParams.get('summary'),
    painNote:    req.nextUrl.searchParams.get('painNote'),
    nextAction:  req.nextUrl.searchParams.get('nextAction'),
    leadName:    req.nextUrl.searchParams.get('leadName'),
    closedValue: closedValueParam ? Number(closedValueParam) : null,
  }

  try {
    const result = await enqueueCardMove(accountId, event)
    const { data: lastOutbox } = await supabaseAdmin
      .from('sync_outbox')
      .select('id, operation, status, origin, payload, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1)
    return NextResponse.json({
      status: '✅ enqueueCardMove executado',
      resultado: result,
      ultima_linha_da_outbox: lastOutbox?.[0] ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
