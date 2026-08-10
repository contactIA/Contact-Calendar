'use client'

// ============================================================================
// KanbanCard — o cartão de UM paciente/lead no funil (TASK-042, SubTask 2 e 4).
//
// Mostra, conforme o passo 4 da task: NOME, DATA, HORÁRIO e as ETIQUETAS
// (unidade / CRC / canal), pintadas com os tokens de marca da TASK-040:
//   • unidade → `bg-brand` (o gradiente roxo→magenta→vermelho da Contact)
//   • CRC     → `bg-brand-light` + `text-brand` + `border-brand-border`
//   • canal   → cinza neutro (é a dimensão menos operacional das três)
//
// Componente PURO de apresentação: não busca dado e não sabe o que é Realtime.
// Quem carrega é o KanbanBoard via usePanelCards (TASK-041).
//
// TASK-043 vai tornar este cartão arrastável. Por isso ele já é uma unidade
// fechada, recebendo só `card` e o dicionário de etiquetas — nada de estado
// interno que atrapalhe o drag depois.
// ============================================================================

import type { PanelCard, PanelTagLink } from '@/hooks/usePanelCards'
import {
  formatBRL, formatApptDate, formatApptTime,
  resolveCardTags, isAiTag, type ResolvedTag,
} from './kanbanFormat'

// Cada família de etiqueta tem seu peso visual. A unidade é a que a recepção
// procura primeiro no quadro, então é ela que recebe o gradiente da marca.
const TAG_STYLE: Record<ResolvedTag['family'], string> = {
  unit: 'bg-brand text-white',
  crc: 'bg-brand-light text-brand border border-brand-border',
  channel: 'bg-slate-100 text-slate-500 border border-slate-200',
}

function TagChip({ tag }: { tag: ResolvedTag }) {
  return (
    <span
      title={tag.label}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none max-w-full ${TAG_STYLE[tag.family]}`}
    >
      {isAiTag(tag) && <span aria-hidden>✨</span>}
      <span className="truncate">{tag.label}</span>
    </span>
  )
}

export function KanbanCard({
  card,
  tagsById,
}: {
  card: PanelCard
  tagsById: Map<string, PanelTagLink>
}) {
  // Paciente vinculado tem prioridade sobre o nome do lead: quando o Panel
  // Mirror casou o card com um paciente nosso, o nome do cadastro é o correto.
  const name = card.patient?.name ?? card.lead_name ?? '(sem nome)'

  const date = formatApptDate(card.appt_date)
  const time = formatApptTime(card.appt_time)

  const value = Number(card.closed_value)
  const hasValue = Number.isFinite(value) && value > 0

  const { tags, unmapped } = resolveCardTags(card, tagsById)

  return (
    <article
      className="group bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md hover:border-brand-border transition-all cursor-default"
      // helena_card_id no title: é o identificador que a operação usa para
      // achar o mesmo card lá na Helena quando algo não bate.
      title={`Card ${card.helena_card_id}`}
    >
      <h3 className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2 group-hover:text-brand transition-colors">
        {name}
      </h3>

      {/* Data e horário — só aparece a linha se houver ao menos um dos dois */}
      {(date || time) && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
          {date && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>📅</span>
              {date}
            </span>
          )}
          {time && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>🕐</span>
              {time}
            </span>
          )}
        </div>
      )}

      {/* Valor fechado — é o mesmo número que entra na soma do topo da coluna */}
      {hasValue && (
        <p className="mt-1.5 text-[12px] font-bold text-success">{formatBRL(value)}</p>
      )}

      {/* Etiquetas: unidade / CRC / canal */}
      {(tags.length > 0 || unmapped > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map(tag => <TagChip key={tag.id} tag={tag} />)}
          {unmapped > 0 && (
            <span
              title={`${unmapped} etiqueta(s) sem vínculo — cadastre em Configurações › Integração Helena › Etiquetas`}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-slate-100 text-slate-400 border border-slate-200"
            >
              +{unmapped}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
