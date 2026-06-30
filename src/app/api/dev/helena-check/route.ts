import { NextRequest, NextResponse } from 'next/server'
import { getAccountIntegration } from '@/lib/helena'
import { listPanels, listPanelCards, getCardNotes } from '@/lib/helena'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/dev/helena-check?secret=helena123
// Rota de diagnóstico SEM auth — apenas para desenvolvimento local.
// ⚠️ Remover antes de deploy em produção.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'helena123') {
    return NextResponse.json({ error: 'Passe ?secret=helena123 na URL' }, { status: 401 })
  }

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
      dica: 'Ative a integração Helena na aba Configurações ou via SQL: UPDATE account_integrations SET helena_enabled = true WHERE ...',
    }, { status: 404 })
  }

  const integ = await getAccountIntegration(accountId)
  if (!integ) {
    return NextResponse.json({
      error: 'getAccountIntegration retornou null — helena_token pode estar vazio.',
      account_id: accountId,
    }, { status: 404 })
  }

  const token = integ.helena_token!
  const panelId = integ.panel_id

  // 1. Lista painéis
  const panelsResult = await listPanels(token)

  // 2. Cards do painel configurado (se houver)
  let cardsResult = null
  let sampleNotes = null

  if (panelId) {
    cardsResult = await listPanelCards(panelId, token, 1, 5)
    if (cardsResult.items.length > 0) {
      sampleNotes = await getCardNotes(cardsResult.items[0].id, token)
    }
  }

  return NextResponse.json({
    status: '✅ Cadeia completa funcionando',
    conta: {
      account_id: accountId,
      panel_id:   panelId ?? '⚠️ não configurado ainda',
      channel:    integ.helena_channel ?? '⚠️ não configurado',
      token_ok:   '✅ (não exibido)',
    },
    paineis_na_helena: {
      total: panelsResult.totalItems,
      lista: panelsResult.items.map(p => ({
        id:     p.id,
        titulo: p.title,
        chave:  p.key,
        escopo: p.scope,
      })),
    },
    cards_primeira_pagina: panelId
      ? {
          painel_id:   panelId,
          total_cards: cardsResult?.totalItems,
          primeiros_5: cardsResult?.items.map(c => ({
            id:     c.id,
            titulo: c.title,
            stepId: c.stepId,
            tags:   c.tagIds,
          })),
        }
      : '⚠️ panel_id não configurado — rode o SQL abaixo no Supabase',
    nota_mais_recente: sampleNotes
      ? {
          card:        cardsResult?.items[0]?.title,
          total_notas: sampleNotes.totalItems,
          preview:     (sampleNotes.items.at(-1)?.text ?? '').slice(0, 150),
        }
      : null,
    sql_para_configurar_painel: panelId ? null
      : "UPDATE public.account_integrations SET panel_id = '3e8fc8bf-6431-4eec-ad44-c51dd59532ba' WHERE account_id = '" + accountId + "';",
  })
}
