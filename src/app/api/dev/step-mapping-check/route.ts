import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { statusToStep } from '@/lib/sync/statusToStep'
import { KIND_TO_STATUS_KEY } from '@/lib/sync/cardSyncEngine'

// GET /api/dev/step-mapping-check?secret=helena123
//   -> panorama: das 8 chaves de status usadas pela cardSyncEngine, quais já
//      têm etapa mapeada em step_mappings e quais faltam
// GET /api/dev/step-mapping-check?secret=helena123&status=cancelled
//   -> roda statusToStep() de verdade (a função de produção) para esse status
// GET /api/dev/step-mapping-check?secret=helena123&debug=steps
//   -> lista as etapas REAIS (helena_steps) da conta, para copiar o id certo
// GET /api/dev/step-mapping-check?secret=helena123&debug=set&status=cancelled&stepId=<uuid>
//   -> grava/atualiza UM mapeamento (conveniência de dev — hoje NADA na UI
//      grava na tabela step_mappings; é um débito técnico registrado na
//      migration 20260701134500_helena_mirror.sql, o HelenaIntegrationTab
//      ainda lê/grava o JSONB legado de account_integrations.step_mappings)
//
// Rota de diagnóstico SEM auth de usuário — apenas para desenvolvimento local.
// ⚠️ Remover antes de deploy em produção.
export async function GET(req: NextRequest) {
  // Fail-closed: nunca responde em produção (mesma guarda do sync-check).
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'helena123') {
    return NextResponse.json({ error: 'Passe ?secret=helena123 na URL' }, { status: 401 })
  }

  // accountId opcional: sem ele, usa a primeira conta com Helena habilitada.
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
    return NextResponse.json({ error: 'Nenhuma conta com helena_enabled=true encontrada. Passe &accountId=<uuid>.' }, { status: 404 })
  }

  const debug = req.nextUrl.searchParams.get('debug')

  // Modo debug: lista as etapas reais do(s) painel(éis) espelhado(s) da conta.
  if (debug === 'steps') {
    const { data: panels } = await supabaseAdmin
      .from('helena_panels')
      .select('id, title')
      .eq('account_id', accountId)
    const panelIds = (panels ?? []).map(p => p.id)
    const { data: steps } = panelIds.length
      ? await supabaseAdmin
          .from('helena_steps')
          .select('id, name, position, panel_id')
          .in('panel_id', panelIds)
          .order('position')
      : { data: [] }
    return NextResponse.json({
      debug: 'etapas reais do(s) painel(éis) espelhado(s)',
      account_id: accountId,
      panels: panels ?? [],
      steps: steps ?? [],
      instrucao: 'Copie o id da etapa desejada e use em &debug=set&status=<chave>&stepId=<id>.',
    })
  }

  // Modo debug: upsert de conveniência — grava um mapeamento sem abrir o SQL editor.
  if (debug === 'set') {
    const status = req.nextUrl.searchParams.get('status')
    const stepId = req.nextUrl.searchParams.get('stepId')
    if (!status || !stepId) {
      return NextResponse.json({ error: 'Passe &status=<chave>&stepId=<uuid>' }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from('step_mappings')
      .upsert(
        { account_id: accountId, appointment_status: status, target_step_id: stepId },
        { onConflict: 'account_id,appointment_status' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: `✅ mapeamento salvo: ${status} -> ${stepId}`, account_id: accountId })
  }

  const statusParam = req.nextUrl.searchParams.get('status')

  // Sem &status: panorama geral — o que já está mapeado e o que falta das 8 chaves.
  if (!statusParam) {
    const { data: mappings, error } = await supabaseAdmin
      .from('step_mappings')
      .select('appointment_status, target_step_id, helena_steps(name)')
      .eq('account_id', accountId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byStatus = new Map((mappings ?? []).map(m => [m.appointment_status, m]))
    const expectedKeys = [...new Set(Object.values(KIND_TO_STATUS_KEY))]
    const panorama = expectedKeys.map(key => {
      const row = byStatus.get(key)
      return {
        status:         key,
        mapeado:        Boolean(row?.target_step_id),
        target_step_id: row?.target_step_id ?? null,
        etapa_nome:     row?.helena_steps?.name ?? null,
      }
    })

    return NextResponse.json({
      account_id: accountId,
      panorama,
      instrucao: 'Use &debug=steps para ver os ids reais das etapas e &debug=set&status=<chave>&stepId=<id> pra preencher o que faltar. Depois teste com &status=<chave>.',
    })
  }

  // Com &status: roda a função de produção de verdade (é a mesma que a engine usa).
  try {
    const targetStepId = await statusToStep(accountId, statusParam)
    return NextResponse.json({
      account_id:         accountId,
      appointment_status: statusParam,
      target_step_id:    targetStepId,
      resultado: targetStepId
        ? '✅ mapeamento encontrado'
        : '⚠️ sem mapeamento — statusToStep devolveu null (normal se você não configurou este status ainda)',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
