'use client'

// ============================================================================
// KanbanColumn — UMA etapa do funil (TASK-042, SubTask 2 e 5).
//
// O header da coluna carrega os dois números que o gate R0→R1 cobra:
//   • CONTAGEM de cards daquela etapa;
//   • SOMA de `closed_value` daquela etapa.
//
// ⚠️ A soma é POR COLUNA. Este componente só enxerga os cards da própria etapa
// (o KanbanBoard agrupa antes de passar), então não há como somar o board
// inteiro por engano — o erro que a task pede para evitar é impossível aqui
// por construção, não por disciplina.
//
// A coluna rola sozinha: o header fica fixo no topo enquanto a lista desce.
// ============================================================================

import type { PanelCard, PanelTagLink } from '@/hooks/usePanelCards'
import { KanbanCard } from './KanbanCard'
import { formatBRL, sumClosedValue } from './kanbanFormat'

export function KanbanColumn({
  name,
  position,
  cards,
  tagsById,
}: {
  /** Nome da etapa como está no espelho (helena_steps.name). */
  name: string | null
  /** Posição real vinda de helena_steps.position — nunca um índice do array. */
  position: number | null
  /** Somente os cards DESTA etapa. */
  cards: PanelCard[]
  tagsById: Map<string, PanelTagLink>
}) {
  // Contagem e soma saem dos MESMOS cards que a coluna renderiza logo abaixo.
  // É de propósito: se o número do topo viesse de outra fonte que a lista, os
  // dois poderiam divergir e ninguém perceberia.
  const count = cards.length
  const total = sumClosedValue(cards)

  return (
    <section className="flex flex-col w-[300px] flex-shrink-0 bg-slate-50/80 rounded-2xl border border-gray-100 overflow-hidden">
      {/* ── Header da coluna ─────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {/* Posição real da etapa no funil — o que define a ordem das colunas */}
          <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md bg-brand-light text-brand text-[10px] font-bold">
            {position ?? '?'}
          </span>
          <h2
            title={name ?? '(sem nome)'}
            className="flex-1 min-w-0 truncate text-[12px] font-bold text-gray-700 uppercase tracking-wide"
          >
            {name ?? '(sem nome)'}
          </h2>
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-brand text-white text-[11px] font-bold leading-none">
            {count}
          </span>
        </div>

        {/* Soma de closed_value DESTA etapa. Fica sempre visível (mesmo em
            R$ 0,00) para a leitura do quadro ser uniforme coluna a coluna. */}
        <p
          className={`mt-1.5 text-[11px] font-semibold tabular-nums ${total > 0 ? 'text-success' : 'text-slate-300'}`}
        >
          {formatBRL(total)}
        </p>
      </header>

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto agenda-scroll p-2 space-y-2 min-h-0">
        {count === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-300 select-none">
            Nenhum card
          </p>
        ) : (
          cards.map(card => (
            <KanbanCard key={card.id} card={card} tagsById={tagsById} />
          ))
        )}
      </div>
    </section>
  )
}
