'use client'

import { useMemo, useRef, useEffect } from 'react'
import { format, addDays, startOfWeek, isSameDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'

const HOUR_START  = 7
const HOUR_END    = 20
const SLOT_H      = 48   // px per 30-min slot → 96px per hour
const PX_PER_MIN  = (SLOT_H * 2) / 60

const STATUS_DOT: Record<string, string> = {
  scheduled:   '#3b82f6',
  confirmed:   '#10b981',
  in_progress: '#f59e0b',
  completed:   '#6b7280',
  cancelled:   '#ef4444',
  no_show:     '#c026d3',
}

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  scheduled:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  confirmed:   { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  in_progress: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  completed:   { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' },
  cancelled:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  no_show:     { bg: '#fdf2f8', border: '#f0abfc', text: '#701a75' },
}

function dateToMinutes(iso: string) {
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return 0
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = {
  appointments: Appointment[]
  date: string
  onAppointmentClick: (appt: Appointment, el: HTMLElement) => void
  onDayClick: (date: string) => void
}

export function WeeklyView({ appointments, date, onAppointmentClick, onDayClick }: Props) {
  const weekStart = startOfWeek(new Date(date + 'T12:00:00'), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalH = (HOUR_END - HOUR_START) * SLOT_H * 2
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = (8 - HOUR_START) * SLOT_H * 2
    }
  }, [date])

  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    days.forEach(d => { map[format(d, 'yyyy-MM-dd')] = [] })
    appointments.forEach(a => {
      const k = a.start_at.slice(0, 10)
      if (map[k]) map[k].push(a)
    })
    return map
  }, [appointments, date])

  // Current time
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMinutes - HOUR_START * 60) * PX_PER_MIN

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0 z-10">
        <div className="w-16 flex-shrink-0 border-r" style={{ borderColor: '#94a3b8', background: '#f8fafc' }} />
        {days.map(d => {
          const dayKey = format(d, 'yyyy-MM-dd')
          const today = isToday(d)
          return (
            <button
              key={dayKey}
              onClick={() => onDayClick(dayKey)}
              className={`flex-1 min-w-0 py-2 px-1 text-center border-r border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${today ? 'bg-violet-50' : ''}`}
            >
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                {format(d, 'EEE', { locale: ptBR })}
              </p>
              <div className={`text-base font-bold mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full ${
                today ? 'bg-violet-600 text-white' : 'text-gray-700'
              }`}>
                {format(d, 'd')}
              </div>
            </button>
          )
        })}
      </div>

      {/* Time grid */}
      <div ref={gridRef} className="flex-1 overflow-auto agenda-scroll relative">
        <div className="relative flex" style={{ minWidth: `${days.length * 120 + 64}px`, height: totalH + 16 }}>

          {/* Grid lines */}
          <div className="absolute inset-0 pointer-events-none">
            {hours.map(h => (
              <div key={h}>
                <div className="absolute inset-x-0" style={{ top: (h - HOUR_START) * SLOT_H * 2 + 16, borderTop: '1px solid #94a3b8' }} />
                <div className="absolute inset-x-0" style={{ top: (h - HOUR_START) * SLOT_H * 2 + SLOT_H + 16, borderTop: '1px dashed #cbd5e1' }} />
              </div>
            ))}
          </div>

          {/* Hour labels */}
          <div className="w-16 flex-shrink-0 border-r relative z-10 flex-shrink-0" style={{ background: '#f8fafc', borderColor: '#94a3b8' }}>
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', top: (h - HOUR_START) * SLOT_H * 2 + 16, left: 0, right: 0 }}>
                <span className="absolute right-2 -top-3 text-[11px] font-semibold text-slate-500 select-none leading-none">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(d => {
            const dayKey = format(d, 'yyyy-MM-dd')
            const dayAppts = byDay[dayKey] ?? []
            const today = isToday(d)

            return (
              <div
                key={dayKey}
                className="flex-1 relative"
                style={{ borderRight: '1px solid #e2e8f0', background: today ? '#faf5ff08' : undefined }}
              >
                {dayAppts.map(appt => {
                  const startMin = dateToMinutes(appt.start_at)
                  const endMin   = dateToMinutes(appt.end_at)
                  const topPx    = (startMin - HOUR_START * 60) * PX_PER_MIN + 16
                  const heightPx = Math.max((endMin - startMin) * PX_PER_MIN - 2, 18)
                  const s = STATUS_STYLE[appt.status] ?? STATUS_STYLE.scheduled
                  const dot = STATUS_DOT[appt.status] ?? '#94a3b8'
                  const compact = heightPx < 32

                  return (
                    <button
                      key={appt.id}
                      onClick={e => onAppointmentClick(appt, e.currentTarget)}
                      style={{
                        position: 'absolute',
                        top: topPx,
                        height: heightPx,
                        left: 2,
                        right: 2,
                        background: appt.status === 'cancelled'
                          ? `repeating-linear-gradient(135deg, ${s.bg}, ${s.bg} 6px, #fff 6px, #fff 10px)`
                          : s.bg,
                        border: `1px solid ${s.border}`,
                        borderLeft: `3px solid ${dot}`,
                        borderRadius: 6,
                        padding: compact ? '2px 4px' : '4px 6px',
                        textAlign: 'left',
                        overflow: 'hidden',
                        zIndex: 10,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.12)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                    >
                      {compact ? (
                        <span className="text-[10px] font-semibold truncate block" style={{ color: s.text }}>
                          {format(new Date(appt.start_at), 'HH:mm')} {appt.patient?.name?.split(' ')[0]}
                        </span>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold truncate leading-tight" style={{ color: s.text }}>
                            {appt.patient?.name ?? '—'}
                          </p>
                          <p className="text-[9px] truncate opacity-70" style={{ color: s.text }}>
                            {format(new Date(appt.start_at), 'HH:mm')} · {appt.procedure?.name}
                          </p>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Current time indicator */}
        {nowTop > 0 && nowTop < totalH && isSameDay(new Date(), new Date(date + 'T12:00:00')) && (
          <div style={{ top: nowTop + 16, left: 64 }} className="absolute right-0 flex items-center pointer-events-none z-20">
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
            <div className="flex-1 h-px bg-red-400" />
          </div>
        )}
      </div>
    </div>
  )
}
