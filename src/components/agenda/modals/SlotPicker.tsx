'use client'

import { format, parseISO } from 'date-fns'
import { useSlots, type Slot } from '@/hooks/useSlots'

type Props = {
  dentistId:   string
  unitId:      string
  procedureId: string
  date:        string
  selected:    Slot | null
  onSelect:    (slot: Slot) => void
}

export function SlotPicker({ dentistId, unitId, procedureId, date, selected, onSelect }: Props) {
  const ready = !!(dentistId && unitId && procedureId && date)
  const { slots, loading } = useSlots(
    ready ? { dentist_id: dentistId, unit_id: unitId, procedure_id: procedureId, date } : null
  )

  if (!ready) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Preencha dentista, unidade e procedimento para ver os horários livres.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 py-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        Nenhum horário disponível para esta data.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
      {slots.map(slot => {
        const isSelected = selected?.start_at === slot.start_at && selected?.chair_id === slot.chair_id
        const time = format(parseISO(slot.start_at), 'HH:mm')
        return (
          <button
            key={`${slot.start_at}-${slot.chair_id}`}
            type="button"
            onClick={() => onSelect(slot)}
            className={`flex flex-col items-center justify-center px-2 py-2.5 rounded-xl border transition-all ${
              isSelected
                ? 'bg-brand-solid text-white border-transparent ring-2 ring-brand-border'
                : 'bg-white text-gray-800 border-gray-200 hover:border-brand-border hover:bg-brand-light'
            }`}
          >
            <span className="text-base font-bold leading-tight">{time}</span>
            <span className={`text-[10px] mt-0.5 truncate w-full text-center ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
              {slot.chair_name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
