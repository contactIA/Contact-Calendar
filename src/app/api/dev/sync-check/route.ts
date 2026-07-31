import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncPanel } from '@/lib/sync/panelMirror'
import { getAccountIntegration, getPanel, listPanels, helenaFetch } from '@/lib/helena'

// GET /api/dev/sync-check?secret=helena123
// GET /api/dev/sync-check?secret=helena123&debug=panel                    ← resposta bruta do getPanel
// GET /api/dev/sync-check?secret=helena123&debug=panels                   ← lista TODOS os painéis (id, título, tipo)
// GET /api/dev/sync-check?secret=helena123&debug=steps&panelId=<uuid>     ← testa endpoints de steps de um painel
// Rota de diagnóstico SEM auth — apenas para desenvolvimento local (GATE R0).
// ⚠️ Remover antes de deploy em produção.
export async function GET(req: NextRequest) {
  // Fail-closed: rota de diagnostico NUNCA responde em producao. Usa service_role
  // (ignora RLS) e o "secret" e hardcoded — so vale para desenvolvimento local.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'helena123') {
    return NextResponse.json({ error: 'Passe ?secret=helena123 na URL' }, { status: 401 })
  }

  const debug = req.nextUrl.searchParams.get('debug')

  // Busca a primeira conta com integração Helena habilitada
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabaseAdmin as any)
    .from('account_integrations')
    .select('account_id')
    .eq('helena_enabled', true)
    .limit(1)

  const accountId: string | null = rows?.[0]?.account_id ?? null

  if (!accountId) {
    return NextResponse.json({
      error: 'Nenhuma conta com helena_enabled = true encontrada.',
    }, { status: 404 })
  }

  // Modo debug: lista os usuários da conta (para montar a URL da agenda: /{accountId}?userId={external_id})
  if (debug === 'users') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (supabaseAdmin as any)
      .from('users')
      .select('external_id, name, role')
      .eq('account_id', accountId)
    return NextResponse.json({
      debug: 'usuários da conta',
      account_id: accountId,
      usuarios: users ?? [],
      url_agenda: (users ?? []).map((u: { external_id: string; name: string; role: string }) =>
        `http://localhost:3000/${accountId}/agenda?userId=${encodeURIComponent(u.external_id)}  (${u.name} — ${u.role})`),
    })
  }

  // Modo debug: dump bruto do primeiro card (a etapa pode vir embutida no card)
  if (debug === 'card') {
    const integ = await getAccountIntegration(accountId)
    if (!integ?.helena_token || !integ.panel_id) {
      return NextResponse.json({ error: 'Integração Helena não configurada' }, { status: 404 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await helenaFetch(integ.helena_token, `/crm/v1/panel/card?PanelId=${integ.panel_id}&Page=1&PageSize=2`) as any
    return NextResponse.json({
      debug: 'primeiros 2 cards BRUTOS (procurar campo de step/etapa com título)',
      raw: resp,
    })
  }

  // Modo debug: lista todos os painéis da conta Helena (para achar o painel do FUNIL)
  if (debug === 'panels') {
    const integ = await getAccountIntegration(accountId)
    if (!integ?.helena_token) {
      return NextResponse.json({ error: 'Integração Helena não configurada' }, { status: 404 })
    }
    const panels = await listPanels(integ.helena_token)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lista = panels.items.map((p: any) => ({
      id:     p.id,
      titulo: p.title,
      chave:  p.key,
      tipo:   p.type,
      escopo: p.scope,
      configurado_atualmente: p.id === integ.panel_id ? '⬅️ panel_id ATUAL' : '',
    }))
    return NextResponse.json({
      debug: 'todos os painéis da conta',
      panel_id_configurado: integ.panel_id,
      total: panels.totalItems,
      paineis: lista,
      instrucao: 'Ache o painel do FUNIL DE PACIENTES (LEADS → COMPARECEU E FECHOU) e me passe o id. Depois teste ?debug=steps&panelId=<id>.',
    })
  }

  // Modo debug: testa os endpoints candidatos de steps para um painel específico
  if (debug === 'steps') {
    const panelId = req.nextUrl.searchParams.get('panelId')
    if (!panelId) return NextResponse.json({ error: 'Passe &panelId=<uuid>' }, { status: 400 })
    const integ = await getAccountIntegration(accountId)
    if (!integ?.helena_token) {
      return NextResponse.json({ error: 'Integração Helena não configurada' }, { status: 404 })
    }
    const token = integ.helena_token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tentativas: Record<string, any> = {}

    // Candidato 1: detalhe do painel (steps embutidas)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = await helenaFetch(token, `/crm/v1/panel/${panelId}`) as any
      tentativas['GET /crm/v1/panel/{id}'] = { steps: p?.steps, stepTitles: p?.stepTitles, type: p?.type }
    } catch (e) { tentativas['GET /crm/v1/panel/{id}'] = { erro: String(e) } }

    // Candidato 2: endpoint dedicado de steps
    try {
      tentativas['GET /crm/v1/panel/{id}/step'] = await helenaFetch(token, `/crm/v1/panel/${panelId}/step`)
    } catch (e) { tentativas['GET /crm/v1/panel/{id}/step'] = { erro: String(e) } }

    // Candidato 3: steps por query param
    try {
      tentativas['GET /crm/v1/panel/step?PanelId='] = await helenaFetch(token, `/crm/v1/panel/step?PanelId=${panelId}`)
    } catch (e) { tentativas['GET /crm/v1/panel/step?PanelId='] = { erro: String(e) } }

    // Candidato 4: v2 do detalhe do painel
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p2 = await helenaFetch(token, `/crm/v2/panel/${panelId}`) as any
      tentativas['GET /crm/v2/panel/{id}'] = { steps: p2?.steps, stepTitles: p2?.stepTitles, keys: Object.keys(p2 ?? {}) }
    } catch (e) { tentativas['GET /crm/v2/panel/{id}'] = { erro: String(e) } }

    // Candidato 5: /steps plural
    try {
      tentativas['GET /crm/v1/panel/{id}/steps'] = await helenaFetch(token, `/crm/v1/panel/${panelId}/steps`)
    } catch (e) { tentativas['GET /crm/v1/panel/{id}/steps'] = { erro: String(e) } }

    // Candidato 6: detalhe com IncludeSteps
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p3 = await helenaFetch(token, `/crm/v1/panel/${panelId}?IncludeSteps=true`) as any
      tentativas['GET /crm/v1/panel/{id}?IncludeSteps=true'] = { steps: p3?.steps, stepTitles: p3?.stepTitles }
    } catch (e) { tentativas['GET /crm/v1/panel/{id}?IncludeSteps=true'] = { erro: String(e) } }

    // Candidato 7: item da listagem v2 (o list pode trazer steps que o detalhe não traz)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lista = await helenaFetch(token, '/crm/v2/panel') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (lista?.items ?? []).find((p: any) => p.id === panelId)
      tentativas['item do GET /crm/v2/panel (list)'] = item
        ? { steps: item.steps, stepTitles: item.stepTitles, keys: Object.keys(item) }
        : { erro: 'painel não encontrado na listagem' }
    } catch (e) { tentativas['item do GET /crm/v2/panel (list)'] = { erro: String(e) } }

    // Candidato 8: painéis MANAGEMENT usam "phase" em vez de "step"
    try {
      tentativas['GET /crm/v1/panel/{id}/phase'] = await helenaFetch(token, `/crm/v1/panel/${panelId}/phase`)
    } catch (e) { tentativas['GET /crm/v1/panel/{id}/phase'] = { erro: String(e) } }

    try {
      tentativas['GET /crm/v1/panel/phase?PanelId='] = await helenaFetch(token, `/crm/v1/panel/phase?PanelId=${panelId}`)
    } catch (e) { tentativas['GET /crm/v1/panel/phase?PanelId='] = { erro: String(e) } }

    // Candidato 9: core (não crm) — talvez steps sejam recurso separado do módulo core
    try {
      tentativas['GET /core/v1/panel/{id}/step'] = await helenaFetch(token, `/core/v1/panel/${panelId}/step`)
    } catch (e) { tentativas['GET /core/v1/panel/{id}/step'] = { erro: String(e) } }

    // Candidato 10: task/management module — este painel é tipo MANAGEMENT, pode ter rota própria
    try {
      tentativas['GET /task/v1/panel/{id}'] = await helenaFetch(token, `/task/v1/panel/${panelId}`)
    } catch (e) { tentativas['GET /task/v1/panel/{id}'] = { erro: String(e) } }

    try {
      tentativas['GET /crm/v1/step?PanelId='] = await helenaFetch(token, `/crm/v1/step?PanelId=${panelId}`)
    } catch (e) { tentativas['GET /crm/v1/step?PanelId='] = { erro: String(e) } }

    // Candidato: stepTitles é um array de STRINGS na ordem das posições (sem id) — testar de novo direto
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p4 = await helenaFetch(token, `/crm/v1/panel/${panelId}`) as any
      tentativas['stepTitles (bruto, se vier como array de nomes ordenados)'] = p4?.stepTitles ?? null
    } catch (e) { tentativas['stepTitles (bruto)'] = { erro: String(e) } }

    // Candidato 11: IncludeDetails=Steps — documentado no obter_por_id.md como query param oficial
    for (const val of ['Steps', 'Step', 'STEPS', 'steps']) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p5 = await helenaFetch(token, `/crm/v1/panel/${panelId}?IncludeDetails=${val}`) as any
        tentativas[`GET /crm/v1/panel/{id}?IncludeDetails=${val}`] = { steps: p5?.steps, stepTitles: p5?.stepTitles, keys: Object.keys(p5 ?? {}) }
      } catch (e) { tentativas[`GET /crm/v1/panel/{id}?IncludeDetails=${val}`] = { erro: String(e) } }
    }

    return NextResponse.json({
      debug: 'testes de endpoints de steps',
      panel_id: panelId,
      tentativas,
      instrucao: 'Me mande o resultado — o candidato que devolver a lista de etapas vira o fix no panelMirror.ts.',
    })
  }

  // Modo debug: mostra resposta bruta do getPanel para descobrir o formato das steps
  if (debug === 'panel') {
    const integ = await getAccountIntegration(accountId)
    if (!integ?.helena_token || !integ.panel_id) {
      return NextResponse.json({ error: 'Integração Helena não configurada' }, { status: 404 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPanel = await getPanel(integ.panel_id, integ.helena_token) as any
    return NextResponse.json({
      debug: 'resposta bruta do getPanel',
      panel_id: integ.panel_id,
      keys_no_topo: Object.keys(rawPanel ?? {}),
      steps:   rawPanel?.steps   ?? '❌ ausente',
      columns: rawPanel?.columns ?? '❌ ausente',
      phases:  rawPanel?.phases  ?? '❌ ausente',
      raw_completo: rawPanel,
    })
  }

  try {
    const result = await syncPanel(accountId)
    return NextResponse.json({
      status: result.stepsUpserted === 0
        ? '⚠️  sync executado mas steps=0 — rode com ?debug=panel para inspecionar a resposta da Helena'
        : '✅ GATE R0 — sync executado',
      account_id: accountId,
      resultado: result,
      instrucao: 'Compare byStep.count com a contagem de cards em cada coluna do painel Helena.',
    })
  } catch (e) {
    return NextResponse.json({
      status: '❌ Erro no sync',
      account_id: accountId,
      erro: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
