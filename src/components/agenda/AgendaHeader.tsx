'use client'

import { format, addDays, subDays, addWeeks, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'

type View = 'day' | 'week' | 'list'

type Props = {
  date: Date
  view: View
  totalToday: number
  onDateChange: (date: Date) => void
  onViewChange: (view: View) => void
  onNewAppointment: () => void
  onSearch: (q: string) => void
}

export function AgendaHeader({ date, view, totalToday, onDateChange, onViewChange, onNewAppointment, onSearch }: Props) {
  const [search, setSearch] = useState('')

  function prev() { onDateChange(view === 'week' ? subWeeks(date, 1) : subDays(date, 1)) }
  function next() { onDateChange(view === 'week' ? addWeeks(date, 1) : addDays(date, 1)) }

  const dayLabel  = format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  const profLabel = `${totalToday} agendamento${totalToday !== 1 ? 's' : ''} hoje`

  return (
    <header className="h-[60px] px-6 flex items-center gap-4 border-b border-gray-200 bg-white flex-shrink-0">
      {/* Agendar */}
      <button
        onClick={onNewAppointment}
        className="flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#a855f7,#d946ef)', boxShadow: '0 2px 8px rgba(168,85,247,.3)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Agendar
      </button>

      {/* Date nav */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={prev} className="w-7 h-7 flex items-center justify-center border border-violet-200 rounded-lg hover:bg-violet-50 text-violet-500 transition-colors text-base">‹</button>
        <button onClick={() => onDateChange(new Date())} className="px-3 h-7 text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">Hoje</button>
        <button onClick={next} className="w-7 h-7 flex items-center justify-center border border-violet-200 rounded-lg hover:bg-violet-50 text-violet-500 transition-colors text-base">›</button>
        <div className="ml-2 flex flex-col">
          <span className="text-[15px] font-bold text-gray-900 leading-tight capitalize">{dayLabel}</span>
          <span className="text-[11px] text-slate-400">{profLabel}</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 mx-4 max-w-sm">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 border border-transparent focus-within:border-violet-300 focus-within:bg-white transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); onSearch(e.target.value) }}
            placeholder="Buscar paciente ou procedimento…"
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-gray-800 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => { setSearch(''); onSearch('') }} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
          )}
        </div>
      </div>

      {/* View switcher */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {(['day', 'week', 'list'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Lista'}
          </button>
        ))}
      </div>

    </header>
  )
}
