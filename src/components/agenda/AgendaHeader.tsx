'use client'

import { format, addDays, subDays, addWeeks, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState, useRef, useEffect } from 'react'
import { type Appointment } from '@/hooks/useAppointments'

type View = 'day' | 'week' | 'list'

const STATUS_DOT: Record<string, string> = {
  scheduled:   '#3b82f6',
  confirmed:   '#10b981',
  in_progress: '#f59e0b',
  completed:   '#6b7280',
  cancelled:   '#ef4444',
  no_show:     '#c026d3',
}

const STATUS_LABEL: Record<string, string> = {
  scheduled:   'Agendado',
  confirmed:   'Confirmado',
  in_progress: 'Em atendimento',
  completed:   'Concluído',
  cancelled:   'Cancelado',
  no_show:     'Faltou',
}

type Props = {
  date: Date
  view: View
  totalToday: number
  onDateChange: (date: Date) => void
  onViewChange: (view: View) => void
  onNewAppointment: () => void
  onSearch: (q: string) => void
  searchResults: Appointment[]
  onAppointmentSelect: (appt: Appointment) => void
}

export function AgendaHeader({ date, view, totalToday, onDateChange, onViewChange, onNewAppointment, onSearch, searchResults, onAppointmentSelect }: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function prev() { onDateChange(view === 'week' ? subWeeks(date, 1) : subDays(date, 1)) }
  function next() { onDateChange(view === 'week' ? addWeeks(date, 1) : addDays(date, 1)) }

  const dayLabel  = format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  const profLabel = `${totalToday} agendamento${totalToday !== 1 ? 's' : ''} hoje`

  const showDropdown = open && search.trim().length >= 2

  return (
    <header className="h-[60px] px-6 flex items-center gap-4 border-b border-gray-200 bg-white flex-shrink-0 relative z-30">
      {/* Agendar */}
      <button
        onClick={onNewAppointment}
        className="bg-brand flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
        style={{ boxShadow: '0 2px 8px rgba(147,51,234,.3)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Agendar
      </button>

      {/* Date nav */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={prev} className="w-7 h-7 flex items-center justify-center border border-violet-200 rounded-lg hover:bg-violet-50 text-gray-500 transition-colors text-base">‹</button>
        <button onClick={() => onDateChange(new Date())} className="px-3 h-7 text-xs font-semibold text-gray-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">Hoje</button>
        <button onClick={next} className="w-7 h-7 flex items-center justify-center border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors text-base">›</button>
        <div className="ml-2 flex flex-col">
          <span className="text-[15px] font-bold text-gray-900 leading-tight capitalize">{dayLabel}</span>
          <span className="text-[11px] text-slate-400">{profLabel}</span>
        </div>
      </div>

      {/* Search */}
      <div ref={wrapperRef} className="flex-1 mx-4 max-w-sm relative">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 border border-transparent focus-within:border-violet-300 focus-within:bg-white transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); onSearch(e.target.value); setOpen(true) }}
            onFocus={() => { if (search.trim().length >= 2) setOpen(true) }}
            placeholder="Buscar paciente ou procedimento…"
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-gray-800 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => { setSearch(''); onSearch(''); setOpen(false) }} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-gray-400 text-center">Nenhum resultado encontrado</div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {searchResults.slice(0, 20).map(appt => {
                  const dot = STATUS_DOT[appt.status] ?? '#94a3b8'
                  const statusLabel = STATUS_LABEL[appt.status] ?? appt.status
                  const apptDate = appt.start_at.slice(0, 10)
                  const apptTime = appt.start_at.slice(11, 16)
                  const dateFormatted = format(new Date(apptDate + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })
                  return (
                    <button
                      key={appt.id}
                      onMouseDown={e => {
                        e.preventDefault()
                        onAppointmentSelect(appt)
                        setSearch('')
                        onSearch('')
                        setOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left border-b border-gray-50 last:border-0"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                          {appt.patient?.name ?? '—'}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {dateFormatted} · {apptTime} · {appt.dentist?.user?.name?.split(' ').slice(0, 2).join(' ') ?? '—'}
                        </p>
                      </div>
                      <span className="text-[10px] font-medium flex-shrink-0 px-1.5 py-0.5 rounded-full" style={{ background: dot + '20', color: dot }}>
                        {statusLabel}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* View switcher */}
      <div className="flex border border-violet-200 rounded-lg overflow-hidden flex-shrink-0">
        {(['day', 'week', 'list'] as View[]).map((v, i) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-violet-200' : ''} ${
              view === v ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-violet-50'
            }`}
          >
            {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Lista'}
          </button>
        ))}
      </div>

    </header>
  )
}
