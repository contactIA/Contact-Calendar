'use client'

import { useState } from 'react'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Dentist } from '@/hooks/useDentists'

type Props = {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  dentists: Dentist[]
  selectedDentistId: string | null
  onDentistChange: (id: string | null) => void
}

export function AgendaSidebar({ selectedDate, onDateSelect, dentists, selectedDentistId, onDentistChange }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date(selectedDate))

  // Build calendar grid
  const monthStart = startOfMonth(viewMonth)
  const monthEnd   = endOfMonth(viewMonth)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 })

  const days: Date[] = []
  let d = gridStart
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1) }

  return (
    <aside className="w-64 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col">
      {/* Dentist filter */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profissional</p>
        <select
          value={selectedDentistId ?? ''}
          onChange={e => onDentistChange(e.target.value || null)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Todos os profissionais</option>
          {dentists.map(d => (
            <option key={d.id} value={d.id}>{d.user?.name ?? d.id}</option>
          ))}
        </select>

        {dentists.length > 0 && (
          <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              className="accent-green-600"
              checked={selectedDentistId !== null}
              onChange={e => onDentistChange(e.target.checked ? (dentists[0]?.id ?? null) : null)}
            />
            Só profissionais com agenda no dia
          </label>
        )}
      </div>

      {/* Mini calendar */}
      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewMonth(m => subMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            ‹
          </button>
          <p className="text-sm font-semibold text-gray-700 capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: ptBR })}
          </p>
          <button
            onClick={() => setViewMonth(m => addMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0 mb-1">
          {['D','S','T','Q','Q','S','S'].map((label, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-gray-400 pb-1">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0">
          {days.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, viewMonth)
            const isSelected = isSameDay(day, selectedDate)
            const todayDay = isToday(day)

            return (
              <button
                key={i}
                onClick={() => { onDateSelect(day); setViewMonth(day) }}
                className={`
                  w-full aspect-square flex items-center justify-center text-[11px] rounded-full transition-colors
                  ${!isCurrentMonth ? 'text-gray-200' : ''}
                  ${isSelected ? 'bg-green-600 text-white font-semibold' : ''}
                  ${todayDay && !isSelected ? 'text-green-600 font-semibold' : ''}
                  ${isCurrentMonth && !isSelected ? 'hover:bg-gray-100 text-gray-600' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status legend */}
      <div className="p-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Legenda</p>
        <div className="space-y-1.5">
          {[
            { color: 'bg-blue-200',   label: 'Agendado' },
            { color: 'bg-green-200',  label: 'Confirmado' },
            { color: 'bg-yellow-200', label: 'Em atendimento' },
            { color: 'bg-gray-200',   label: 'Concluído' },
            { color: 'bg-purple-200', label: 'Bloqueado' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${item.color}`} />
              <span className="text-xs text-gray-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
