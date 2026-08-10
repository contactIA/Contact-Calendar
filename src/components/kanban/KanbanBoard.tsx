'use client'

// ============================================================================
// KanbanBoard — o quadro do funil com identidade Contact (TASK-042 / RF-020).
//
// Junta as 5 subtasks:
//   1. é o conteúdo da rota /[accountId]/paineis;
//   2. compõe KanbanColumn → KanbanCard;
//   3. ordena as colunas por `helena_steps.position` (NUNCA hardcode);
//   4. as etiquetas dos cards saem nas cores da marca (ver KanbanCard);
//   5. cada coluna mostra contagem + soma de closed_value, e há filtro por
//      etiqueta.
//
// A fonte de dados é o `usePanelCards` (TASK-041), que já lê só do espelho
// local e revalida por Realtime. Este componente NÃO faz fetch próprio.
//
// TASK-043 entra aqui para o drag-and-drop. Hoje o quadro só mostra.
// ============================================================================

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { usePanelCards, type PanelCard } from '@/hooks/usePanelCards'
import { KanbanColumn } from './KanbanColumn'
import { indexTags, FAMILY_LABEL, type TagFamily } from './kanbanFormat'

const FAMILY_ORDER: TagFamily[] = ['unit', 'crc', 'channel']

// Selo do estado do Realtime — o mesmo vocabulário que o hook expõe.
const REALTIME_BADGE = {
  live: { dot: 'bg-success', text: 'text-success', label: 'tempo real' },
  polling: { dot: 'bg-amber-400', text: 'text-amber-600', label: 'atualiza a cada 10s' },
  connecting: { dot: 'bg-slate-300', text: 'text-slate-400', label: 'conectando…' },
} as const

export function KanbanBoard() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountId = params?.accountId as string

  // Preserva o contexto de sessão ao navegar (fluxo white-label do useAuth:
  // ?token= do sistema-pai, ?userId= no fallback de dev).
  const userId = searchParams?.get('userId') ?? ''
  const urlToken = searchParams?.get('token') ?? ''
  const sessionQs = new URLSearchParams()
  if (userId) sessionQs.set('userId', userId)
  if (urlToken) sessionQs.set('token', urlToken)
  const sessionQuery = sessionQs.toString() ? `?${sessionQs}` : ''

  // ── SubTask 5 · filtro por etiqueta ───────────────────────────────────────
  // O filtro é aplicado NO SERVIDOR: vai como `etiqueta` para o usePanelCards,
  // que o repassa a /api/panels/cards, onde vira `.contains('tag_ids', [uuid])`.
  // Um único parâmetro cobre as três famílias (unidade / CRC / canal) porque o
  // que casa é o UUID dentro do array tag_ids do card.
  // Consequência intencional: a contagem e a soma de cada coluna passam a
  // refletir o recorte filtrado — é o que se espera de um quadro filtrado.
  const [etiqueta, setEtiqueta] = useState<string>('')

  const {
    panel, steps, tags, cards, total,
    truncated, cardsWithoutStep,
    loading, error, realtime, refetch,
  } = usePanelCards(accountId, { etiqueta: etiqueta || undefined })

  // Dicionário UUID → significado, montado uma vez para todos os cards.
  const tagsById = useMemo(() => indexTags(tags), [tags])

  // ── SubTask 3 · a ordem das colunas ───────────────────────────────────────
  // A ordem vem SEMPRE de helena_steps.position. Nenhuma lista de nomes de
  // etapa aparece neste arquivo — se a clínica reordenar o funil na Helena, a
  // próxima sincronização reordena a tela sozinha.
  // O endpoint já devolve ordenado; reordenamos aqui de novo de propósito, para
  // a garantia ser do componente e não de um detalhe de outra camada.
  // `position` nulo vai para o fim (Infinity) em vez de virar 0 e furar a fila.
  const orderedSteps = useMemo(
    () => [...steps].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)),
    [steps],
  )

  // Cards agrupados por etapa. Cada coluna recebe SÓ os seus — é isto que faz a
  // contagem e a soma serem por coluna e não do board inteiro.
  const cardsByStep = useMemo(() => {
    const map = new Map<string, PanelCard[]>()
    for (const card of cards) {
      if (!card.step_id) continue // sem etapa: vira aviso no topo, não coluna
      const list = map.get(card.step_id)
      if (list) list.push(card)
      else map.set(card.step_id, [card])
    }
    return map
  }, [cards])

  // Etiquetas do seletor, agrupadas por família.
  const tagsByFamily = useMemo(() => {
    const groups = new Map<TagFamily, { id: string; label: string }[]>()
    for (const tag of tags) {
      const list = groups.get(tag.family) ?? []
      list.push({ id: tag.helena_tag_id, label: tag.meaning?.trim() || tag.helena_tag_id })
      groups.set(tag.family, list)
    }
    for (const list of groups.values()) list.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
    return groups
  }, [tags])

  const activeTagLabel = etiqueta
    ? tags.find(t => t.helena_tag_id === etiqueta)?.meaning?.trim() || etiqueta
    : null

  const badge = REALTIME_BADGE[realtime]

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push(`/${accountId}/agenda${sessionQuery}`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
          title="Voltar à agenda"
        >
          ‹
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">
              {panel?.title?.trim() || 'Painéis'}
            </h1>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${badge.text} flex-shrink-0`}>
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {orderedSteps.length} etapa{orderedSteps.length !== 1 ? 's' : ''} · {total} card{total !== 1 ? 's' : ''}
            {panel?.synced_at && ` · espelho de ${new Date(panel.synced_at).toLocaleString('pt-BR')}`}
          </p>
        </div>

        {/* Filtro por etiqueta (SubTask 5) */}
        <label className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Etiqueta</span>
          <select
            value={etiqueta}
            onChange={e => setEtiqueta(e.target.value)}
            disabled={tags.length === 0}
            className="text-[12px] font-medium text-gray-700 bg-white border border-violet-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-border disabled:text-slate-300 disabled:border-gray-200"
          >
            <option value="">{tags.length === 0 ? 'nenhuma vinculada' : 'Todas'}</option>
            {FAMILY_ORDER.map(family => {
              const list = tagsByFamily.get(family)
              if (!list?.length) return null
              return (
                <optgroup key={family} label={FAMILY_LABEL[family]}>
                  {list.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.label}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </label>

        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors flex-shrink-0"
          title="Recarregar do espelho"
        >
          Atualizar
        </button>
      </header>

      {/* ── Faixa do filtro ativo (mesma linguagem do FilterChips da agenda) ─ */}
      {activeTagLabel && (
        <div className="flex-shrink-0 flex items-center gap-2 px-6 py-2 bg-brand-light border-b border-brand-border">
          <span className="text-[11px] font-semibold text-brand uppercase tracking-wider">Filtro:</span>
          <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-brand text-white text-[12px] font-semibold shadow-sm">
            {activeTagLabel}
            <button
              onClick={() => setEtiqueta('')}
              aria-label={`Remover filtro ${activeTagLabel}`}
              className="w-4 h-4 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white text-[10px] leading-none transition-colors"
            >
              ✕
            </button>
          </span>
          {/* text-brand é um @utility (TASK-040), não um token de cor — por isso
              o esmaecido vem de `opacity`, e não do modificador `/70`. */}
          <span className="text-[11px] text-brand opacity-70">
            contagem e soma abaixo consideram apenas os cards desta etiqueta
          </span>
        </div>
      )}

      {/* ── Avisos ──────────────────────────────────────────────────────────
          Cards sem etapa NÃO viram uma coluna fantasma (o funil tem as etapas
          que tem) e também não somem calados — viram este aviso. */}
      {(cardsWithoutStep > 0 || truncated) && (
        <div className="flex-shrink-0 px-6 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800 space-y-0.5">
          {cardsWithoutStep > 0 && (
            <p>
              <strong>{cardsWithoutStep} card{cardsWithoutStep !== 1 ? 's' : ''} sem etapa mapeada</strong> —
              não aparece{cardsWithoutStep !== 1 ? 'm' : ''} em nenhuma coluna. Revise o mapeamento em
              Configurações › Integração Helena.
            </p>
          )}
          {truncated && (
            <p>
              <strong>Lista truncada</strong> — a conta tem mais cards do que o limite da consulta;
              as contagens e somas abaixo são parciais.
            </p>
          )}
        </div>
      )}

      {/* ── Quadro ───────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        {error ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="text-center max-w-md">
              <p className="text-[15px] font-semibold text-gray-800 mb-1">Não foi possível carregar o funil</p>
              <p className="text-[13px] text-gray-500 mb-4">{error}</p>
              <button
                onClick={() => refetch()}
                className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Tentar de novo
              </button>
            </div>
          </div>
        ) : orderedSteps.length === 0 && !loading ? (
          <div className="h-full flex items-center justify-center px-6">
            <p className="text-[13px] text-gray-500 text-center max-w-md">
              Nenhuma etapa no espelho deste painel. Rode a sincronização em
              Configurações › Integração Helena.
            </p>
          </div>
        ) : (
          <div className="h-full overflow-x-auto overflow-y-hidden agenda-scroll px-6 py-4">
            <div className="flex gap-3 h-full items-stretch">
              {orderedSteps.map(step => (
                <KanbanColumn
                  key={step.id}
                  name={step.name}
                  position={step.position}
                  cards={cardsByStep.get(step.id) ?? []}
                  tagsById={tagsById}
                />
              ))}
            </div>
          </div>
        )}

        {/* Overlay de carregamento — mesmo padrão da agenda */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Carregando funil...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
