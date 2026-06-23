'use client'

import { useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Dentist } from '@/hooks/useDentists'
import { DayReportModal } from './DayReportModal'

type Props = {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  dentists: Dentist[]
  selectedDentistId: string | null
  onDentistChange: (id: string | null) => void
  appointments: Array<{ status: string; dentist?: { id: string } | null; patient?: { name: string } | null; start_at: string; procedure?: { name: string } | null }>
  statusFilter: string
  onStatusFilter: (status: string) => void
}

const STATUS_PILLS = [
  { value: 'scheduled',   color: '#3b82f6', bg: '#eff6ff', label: 'Agendado' },
  { value: 'confirmed',   color: '#10b981', bg: '#ecfdf5', label: 'Confirmado' },
  { value: 'in_progress', color: '#f59e0b', bg: '#fffbeb', label: 'Em atendimento' },
  { value: 'completed',   color: '#6b7280', bg: '#f3f4f6', label: 'Concluído' },
  { value: 'cancelled',   color: '#ef4444', bg: '#fef2f2', label: 'Cancelado' },
  { value: 'no_show',     color: '#c026d3', bg: '#fdf2f8', label: 'Faltou' },
]

export function AgendaSidebar({ selectedDate, onDateSelect, dentists, selectedDentistId, onDentistChange, appointments, statusFilter, onStatusFilter }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date(selectedDate))
  const [reportOpen, setReportOpen] = useState(false)
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountId = params?.accountId as string
  const userId = searchParams?.get('userId') ?? ''
  const userQuery = userId ? `?userId=${userId}` : ''

  // Build calendar grid
  const monthStart = startOfMonth(viewMonth)
  const monthEnd   = endOfMonth(viewMonth)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 })

  const days: Date[] = []
  let d = gridStart
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1) }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-y-auto agenda-scroll">

      {/* Dentist filter */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Profissional</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onDentistChange(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
              selectedDentistId === null
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Todos
          </button>
          {dentists.map(d => {
            const name = d.user?.name ?? d.id
            const firstName = name.split(' ').slice(0, 2).join(' ')
            const isSelected = selectedDentistId === d.id
            return (
              <button
                key={d.id}
                onClick={() => onDentistChange(isSelected ? null : d.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                  isSelected
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                }`}
                style={isSelected ? { background: d.color ?? '#a855f7', borderColor: d.color ?? '#a855f7' } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: d.color ?? '#a855f7' }}
                />
                {firstName}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mini calendar */}
      <div className="p-4 border-b border-gray-100">
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
                  ${isSelected ? 'bg-gradient-to-br from-violet-600 to-rose-500 text-white font-semibold' : ''}
                  ${todayDay && !isSelected ? 'text-violet-600 font-semibold' : ''}
                  ${isCurrentMonth && !isSelected ? 'hover:bg-gray-100 text-gray-600' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status filter / legend */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Filtrar por status</p>
          {statusFilter && (
            <button
              onClick={() => onStatusFilter('')}
              className="text-[10px] text-violet-500 hover:text-violet-700 font-semibold transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_PILLS.map(item => {
            const active = statusFilter === item.value
            return (
              <button
                key={item.value}
                onClick={() => onStatusFilter(active ? '' : item.value)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all border"
                style={active
                  ? { background: item.color, color: '#fff', borderColor: item.color }
                  : { background: item.bg, color: item.color, borderColor: 'transparent', opacity: 0.85 }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#fff' : item.color }} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Atalhos rápidos */}
      <div className="p-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Atalhos</p>
        <div className="space-y-1.5">
          <button
            onClick={() => router.push(`/${accountId}/pacientes${userQuery}`)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <span className="text-sm">👥</span>
            Lista de pacientes
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <span className="text-sm">📊</span>
            Relatório do dia
          </button>
          <button
            onClick={() => router.push(`/${accountId}/configuracoes${userQuery}`)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <span className="text-sm">⚙️</span>
            Configurações
          </button>
        </div>
      </div>

      <DayReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        date={selectedDate}
        appointments={appointments}
        dentists={dentists}
      />
    </aside>
  )
}
