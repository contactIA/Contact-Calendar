'use client'

import { format, addDays, subDays, addWeeks, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type View = 'day' | 'week' | 'list'

type Props = {
  date: Date
  view: View
  onDateChange: (date: Date) => void
  onViewChange: (view: View) => void
  onNewAppointment: () => void
}

export function AgendaHeader({ date, view, onDateChange, onViewChange, onNewAppointment }: Props) {
  function prev() {
    onDateChange(view === 'week' ? subWeeks(date, 1) : subDays(date, 1))
  }

  function next() {
    onDateChange(view === 'week' ? addWeeks(date, 1) : addDays(date, 1))
  }

  const dateLabel = view === 'week'
    ? `${format(date, "d 'de' MMMM", { locale: ptBR })} — semana`
    : format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
      {/* Left: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onNewAppointment}
          className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Agendar
        </button>
      </div>

      {/* Center: date navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={prev}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
        >
          ‹
        </button>
        <button
          onClick={() => onDateChange(new Date())}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Hoje
        </button>
        <button
          onClick={next}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
        >
          ›
        </button>
        <h2 className="text-base font-semibold text-gray-800 capitalize ml-1 min-w-52">
          {dateLabel}
        </h2>
      </div>

      {/* Right: view switcher */}
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
        {(['day', 'week', 'list'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === v
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Lista'}
          </button>
        ))}
      </div>
    </header>
  )
}
