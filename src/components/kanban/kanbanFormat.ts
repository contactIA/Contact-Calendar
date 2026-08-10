// ============================================================================
// Formatação e resolução de etiquetas do kanban (TASK-042).
//
// Vive fora dos componentes porque KanbanCard (valor do card) e KanbanColumn
// (soma da coluna) precisam da MESMA formatação de dinheiro — duas cópias da
// regra é como as duas telas acabam mostrando números com cara diferente.
// ============================================================================

import type { PanelCard, PanelTagLink } from '@/hooks/usePanelCards'

// ── Dinheiro ────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

export function formatBRL(value: number): string {
  return BRL.format(value)
}

/**
 * Soma o `closed_value` de UMA lista de cards.
 *
 * ⚠️ Cuidado registrado na task: a soma é POR COLUNA. Quem chama isto passa os
 * cards daquela etapa — nunca o board inteiro. O KanbanBoard agrupa antes.
 *
 * `closed_value` é `numeric` no Postgres e o supabase-js pode devolver number
 * OU string dependendo do driver; por isso o Number() + guarda de NaN. Sem
 * isso, uma string faria a soma virar concatenação ("0" + "1200" = "01200").
 */
export function sumClosedValue(cards: PanelCard[]): number {
  let total = 0
  for (const card of cards) {
    const raw = Number(card.closed_value)
    if (Number.isFinite(raw)) total += raw
  }
  return total
}

// ── Data e horário ──────────────────────────────────────────────────────────
//
// appt_date/appt_time são TEXT no espelho, não date/time — decisão registrada
// na migration 20260701134500_helena_mirror (a IA preenche esses campos como
// string livre vinda da Helena). Ou seja: pode vir "2026-08-12", pode vir
// "12/08" e pode vir qualquer coisa. Formatamos o que dá para reconhecer e
// mostramos o resto como veio, em vez de arriscar "Invalid Date" na tela.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const HHMM     = /^(\d{1,2}):(\d{2})/

/** "2026-08-12" → "12/08/2026". Qualquer outro formato volta como veio. */
export function formatApptDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const m = ISO_DATE.exec(trimmed)
  // Split manual em vez de new Date(): "2026-08-12" é parseado como UTC pelo
  // JS e, no fuso do Brasil (-03), voltaria como dia 11. Bug clássico.
  return m ? `${m[3]}/${m[2]}/${m[1]}` : trimmed
}

/** "14:30:00" → "14:30". Qualquer outro formato volta como veio. */
export function formatApptTime(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const m = HHMM.exec(trimmed)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : trimmed
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

export type TagFamily = 'unit' | 'crc' | 'channel'

export type ResolvedTag = {
  id: string
  family: TagFamily
  label: string
}

/** Ordem de exibição das etiquetas no card: unidade → CRC → canal. */
const FAMILY_ORDER: Record<TagFamily, number> = { unit: 0, crc: 1, channel: 2 }

/** Rótulo amigável de cada família (usado no seletor de filtro). */
export const FAMILY_LABEL: Record<TagFamily, string> = {
  unit:    'Unidade',
  crc:     'CRC / origem do agendamento',
  channel: 'Canal do lead',
}

/** Dicionário UUID → vínculo, montado uma vez no board e passado aos cards. */
export function indexTags(tags: PanelTagLink[]): Map<string, PanelTagLink> {
  return new Map(tags.map(t => [t.helena_tag_id, t]))
}

/**
 * Transforma os UUIDs de etiqueta de um card em chips legíveis.
 *
 * De onde vêm os UUIDs:
 *   - `tag_ids`  — a lista crua que veio da Helena (fonte principal);
 *   - `unit_tag` / `crc_tag` / `origin_tag` — as três colunas que o Panel Mirror
 *     já resolveu por família. Entram no union porque, se um dia o mirror
 *     preencher a coluna sem repetir o id em tag_ids, a etiqueta não some.
 *
 * Tags sem vínculo em tag_links não viram chip (seria um UUID cru na tela);
 * elas voltam em `unmapped`, e o card mostra um discreto "+N".
 */
export function resolveCardTags(
  card: PanelCard,
  tagsById: Map<string, PanelTagLink>,
): { tags: ResolvedTag[]; unmapped: number } {
  const ids = new Set<string>()
  for (const id of card.tag_ids ?? []) if (id) ids.add(id)
  if (card.unit_tag)   ids.add(card.unit_tag)
  if (card.crc_tag)    ids.add(card.crc_tag)
  if (card.origin_tag) ids.add(card.origin_tag)

  const resolved: ResolvedTag[] = []
  let unmapped = 0

  for (const id of ids) {
    const link = tagsById.get(id)
    if (!link) { unmapped++; continue }
    resolved.push({
      id,
      family: link.family,
      // meaning é nullable no banco; sem ele não há o que escrever no chip.
      label:  link.meaning?.trim() || FAMILY_LABEL[link.family],
    })
  }

  resolved.sort((a, b) =>
    FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family] || a.label.localeCompare(b.label, 'pt-BR'),
  )

  return { tags: resolved, unmapped }
}

/** Etiquetas de CRC com "IA" no nome ganham ✨ (ex.: "AGENDADO IA", RF-025). */
export function isAiTag(tag: ResolvedTag): boolean {
  return tag.family === 'crc' && /\bia\b/i.test(tag.label)
}
