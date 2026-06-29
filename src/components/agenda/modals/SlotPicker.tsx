'use client'

import { useMemo } from 'react'
import { useSlots, type Slot } from '@/hooks/useSlots'
import { spTime } from '@/lib/tz'

type Props = {
  dentistId:   string
  unitId:      string
  procedureId: string
  date:        string
  /** Slot atualmente selecionado (compara por start_at + chair_id). */
  selected:    Slot | null
  onSelect:    (slot: Slot) => void
}

/**
 * Grade clicável de horários livres. Substitui o antigo campo de digitar horário:
 * a recepção só clica num slot — como escolher poltrona no cinema.
 *
 * Os horários ocupados/bloqueados NÃO chegam aqui: vêm já filtrados pela RPC
 * `get_available_slots` (TASK-030) através do hook `useSlots`. Cada slot traz a
 * cadeira sugerida, então não há campo de cadeira para errar.
 */
export function SlotPicker({ dentistId, unitId, procedureId, date, selected, onSelect }: Props) {
  // Só busca quando temos o conjunto completo de filtros — senão a RPC nem é chamada.
  const params = useMemo(
    () =>
      dentistId && unitId && procedureId && date
        ? { dentist_id: dentistId, unit_id: unitId, procedure_id: procedureId, date }
        : null,
    [dentistId, unitId, procedureId, date]
  )

  const { slots, loading } = useSlots(params)

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
        <p className="text-sm text-gray-500">Nenhum horário livre nesta data.</p>
        <p className="text-xs text-gray-400 mt-1">Tente outra data ou outro profissional.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto agenda-scroll pr-1">
      {slots.map(slot => {
        const isSelected = selected?.start_at === slot.start_at && selected?.chair_id === slot.chair_id
        return (
          <button
            key={`${slot.start_at}-${slot.chair_id}`}
            type="button"
            onClick={() => onSelect(slot)}
            className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-border ${
              isSelected
                ? 'bg-brand text-white ring-2 ring-brand-border'
                : 'border border-gray-200 text-gray-700 hover:border-violet-300 hover:bg-violet-50'
            }`}
          >
            <span>{spTime(slot.start_at)}</span>
            <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
              {slot.chair_name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
