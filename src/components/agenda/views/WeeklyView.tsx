'use client'

import { useMemo } from 'react'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'
import { type Dentist } from '@/hooks/useDentists'
import { type ScheduleBlock, BLOCK_TYPE_META } from '@/hooks/useScheduleBlocks'

const STATUS_COLOR: Record<string, string> = {
  scheduled:   'bg-blue-100 border-blue-300 text-blue-800',
  confirmed:   'bg-green-100 border-green-300 text-green-800',
  in_progress: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  completed:   'bg-gray-100 border-gray-300 text-gray-600',
  cancelled:   'bg-red-50 border-red-200 text-red-700',
  no_show:     'bg-pink-50 border-pink-200 text-pink-700',
}

type Props = {
  appointments: Appointment[]
  date: string
  onAppointmentClick: (appt: Appointment, el: HTMLElement) => void
  onDayClick: (date: string) => void
  blocks?: ScheduleBlock[]
  dentists?: Dentist[]
}

export function WeeklyView({ appointments, date, onAppointmentClick, onDayClick, blocks = [], dentists = [] }: Props) {
  const weekStart = startOfWeek(new Date(date + 'T12:00:00'), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    days.forEach(d => { map[format(d, 'yyyy-MM-dd')] = [] })
    appointments.forEach(a => {
      const k = format(new Date(a.start_at), 'yyyy-MM-dd')
      if (map[k]) map[k].push(a)
    })
    return map
  }, [appointments, date])

  // Bloqueios agrupados pelo dia LOCAL de início (mesma chave dos appointments).
  const blocksByDay = useMemo(() => {
    const map: Record<string, ScheduleBlock[]> = {}
    blocks.forEach(b => {
      const k = format(new Date(b.start_at), 'yyyy-MM-dd')
      ;(map[k] ??= []).push(b)
    })
    return map
  }, [blocks])

  const dentistName = (id: string) => {
    const name = dentists.find(d => d.id === id)?.user?.name
    return name ? name.split(' ').slice(0, 2).join(' ') : null
  }

  return (
    <div className="flex-1 overflow-auto agenda-scroll">
      <div className="grid grid-cols-7 border-b border-gray-200 sticky top-0 bg-white z-10">
        {days.map(d => {
          const isToday = isSameDay(d, today)
          const dayKey = format(d, 'yyyy-MM-dd')
          return (
            <button
              key={dayKey}
              onClick={() => onDayClick(dayKey)}
              className={`p-3 text-center hover:bg-gray-50 transition-colors border-r border-gray-100 last:border-0 ${
                isToday ? 'bg-green-50' : ''
              }`}
            >
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                {format(d, 'EEE', { locale: ptBR })}
              </p>
              <p className={`text-lg font-semibold mt-0.5 w-8 h-8 flex items-center justify-center mx-auto rounded-full ${
                isToday ? 'bg-green-600 text-white' : 'text-gray-700'
              }`}>
                {format(d, 'd')}
              </p>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-96">
        {days.map(d => {
          const dayKey = format(d, 'yyyy-MM-dd')
          const dayAppts  = byDay[dayKey] ?? []
          const dayBlocks = blocksByDay[dayKey] ?? []

          // Consultas e bloqueios intercalados por horário de início, para o
          // almoço de 12h aparecer entre a consulta das 11h e a das 14h.
          const items = [
            ...dayAppts.map(a => ({ kind: 'appt' as const, start: a.start_at, appt: a })),
            ...dayBlocks.map(b => ({ kind: 'block' as const, start: b.start_at, block: b })),
          ].sort((a, b) => a.start.localeCompare(b.start))

          return (
            <div key={dayKey} className="p-2 space-y-1 min-h-48">
              {items.length === 0 && (
                <p className="text-xs text-gray-300 text-center mt-4">—</p>
              )}
              {items.map(item => {
                if (item.kind === 'block') {
                  const block = item.block
                  const meta = BLOCK_TYPE_META[block.type] ?? BLOCK_TYPE_META.reserved
                  const name = dentistName(block.dentist_id)
                  return (
                    <div
                      key={`block-${block.id}`}
                      className="w-full rounded border px-2 py-1.5 text-xs cursor-not-allowed select-none"
                      style={{
                        background: `repeating-linear-gradient(135deg, ${meta.bg}, ${meta.bg} 8px, #f1f5f9 8px, #f1f5f9 14px)`,
                        borderColor: meta.border,
                        borderLeft: `3px solid ${meta.accent}`,
                        color: meta.text,
                      }}
                    >
                      <p className="font-semibold truncate leading-tight">{meta.label}</p>
                      <p className="text-[10px] opacity-70">
                        {format(new Date(block.start_at), 'HH:mm')}–{format(new Date(block.end_at), 'HH:mm')}
                        {name ? ` · ${name}` : ''}
                      </p>
                    </div>
                  )
                }
                const appt = item.appt
                return (
                  <button
                    key={appt.id}
                    onClick={e => onAppointmentClick(appt, e.currentTarget)}
                    className={`w-full text-left rounded border px-2 py-1.5 text-xs hover:brightness-95 transition-all ${
                      STATUS_COLOR[appt.status] ?? STATUS_COLOR.scheduled
                    }`}
                  >
                    <p className="font-semibold truncate leading-tight">
                      {appt.patient?.name ?? '—'}
                    </p>
                    <p className="text-[10px] opacity-70">
                      {format(new Date(appt.start_at), 'HH:mm')} · {appt.dentist?.user?.name?.split(' ').slice(0, 2).join(' ')}
                    </p>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
