'use client'

// ============================================================================
// PÁGINA DESCARTÁVEL — prova de funcionamento da TASK-041.
//
// Existe só para demonstrar o usePanelCards antes do KanbanBoard existir
// (TASK-042). Sem estilo, de propósito: aqui não se avalia design, se avalia
// se o dado chega e se a tela se atualiza sozinha.
//
// 🗑️ A TASK-042 DEVE APAGAR ESTA PASTA ao entregar o kanban de verdade.
//
// Como usar:
//   1. npm run dev
//   2. abrir /<accountId>/dev-panel-cards?token=<jwt>   (ou ?userId=<id> em dev)
//   3. no Supabase, mudar o step_id de um card em helena_cards
//   4. olhar a tela: o card troca de coluna sozinho, sem F5
// ============================================================================

import { use } from 'react'
import { usePanelCards } from '@/hooks/usePanelCards'

// Bloqueio em produção — mesma observação que o revisor fez para
// /api/dev/helena-check. Página de diagnóstico não vai ao ar.
const IS_PROD = process.env.NODE_ENV === 'production'

export default function DevPanelCardsPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params)
  const {
    panel, steps, cards, total, truncated, cardsWithoutStep,
    loading, error, realtime, lastFetchMs, refetch,
  } = usePanelCards(accountId)

  if (IS_PROD) {
    return <p style={{ padding: 24, fontFamily: 'monospace' }}>Not available in production.</p>
  }

  const byStep = (stepId: string) => cards.filter(c => c.step_id === stepId)
  const orphans = cards.filter(c => !c.step_id)

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 16, fontWeight: 700 }}>DEV — usePanelCards (TASK-041)</h1>

      {/* Painel de diagnóstico: é isto que se filma para provar as subtasks */}
      <pre style={{ background: '#f4f4f5', padding: 12, borderRadius: 6, marginTop: 12 }}>
{`account_id : ${accountId}
painel     : ${panel ? `${panel.title ?? '(sem título)'} [${panel.helena_panel_id}] via ${panel.resolved_by}` : '—'}
espelho de : ${panel?.synced_at ?? '—'}
status     : ${loading ? 'carregando…' : error ? `ERRO: ${error}` : 'ok'}
tempo      : ${lastFetchMs !== null ? `${lastFetchMs}ms ${lastFetchMs < 1500 ? '✅ (<1,5s)' : '⚠️ (>1,5s)'}` : '—'}
realtime   : ${realtime}${realtime === 'live' ? ' ✅ mudanças chegam na hora' : realtime === 'polling' ? ` ⚠️ contingência (revalida a cada 10s)` : ' …conectando'}
cards      : ${total}${truncated ? ' (truncado!)' : ''} · etapas: ${steps.length} · sem etapa: ${cardsWithoutStep}`}
      </pre>

      <button onClick={() => refetch()} style={{ marginTop: 8, padding: '4px 10px' }}>
        refetch manual
      </button>

      <div style={{ marginTop: 20 }}>
        {steps.map(s => (
          <div key={s.id} style={{ marginBottom: 14 }}>
            <strong>
              {s.position}. {s.name ?? '(sem nome)'} ({s.count})
            </strong>
            {byStep(s.id).length === 0 ? (
              <div style={{ color: '#a1a1aa', paddingLeft: 16 }}>— vazia —</div>
            ) : (
              <ul style={{ paddingLeft: 24, margin: 0 }}>
                {byStep(s.id).map(c => (
                  <li key={c.id}>
                    {c.patient?.name ?? c.lead_name ?? '(sem nome)'}
                    {c.appt_date ? ` · ${c.appt_date}` : ''}
                    {c.appt_time ? ` ${c.appt_time}` : ''}
                    {c.closed_value ? ` · R$ ${c.closed_value}` : ''}
                    <span style={{ color: '#a1a1aa' }}> · {c.helena_card_id.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {orphans.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ color: '#dc2626' }}>(sem etapa) ({orphans.length})</strong>
            <ul style={{ paddingLeft: 24, margin: 0 }}>
              {orphans.map(c => (
                <li key={c.id}>{c.patient?.name ?? c.lead_name ?? '(sem nome)'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
