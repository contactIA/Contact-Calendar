'use client'

import { useMemo, useRef, useEffect } from 'react'
import { type Appointment } from '@/hooks/useAppointments'
import { type Dentist } from '@/hooks/useDentists'
import { AppointmentBlock } from '../AppointmentBlock'

const HOUR_START = 7
const HOUR_END   = 20
const SLOT_H     = 64   // px per 30-min slot → 128px per hour
const PX_PER_MIN = (SLOT_H * 2) / 60

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function dateToMinutes(iso: string) {
  // Extrai hora/minuto diretamente da string UTC para evitar conversão de timezone do browser
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return 0
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = {
  appointments: Appointment[]
  dentists: Dentist[]
  selectedDentistId: string | null
  onAppointmentClick: (appt: Appointment, el: HTMLButtonElement) => void
  onSlotClick: (dentistId: string, startIso: string) => void
  date: string
}

export function DailyView({ appointments, dentists, selectedDentistId, onAppointmentClick, onSlotClick, date }: Props) {
  const visibleDentists = selectedDentistId
    ? dentists.filter(d => d.id === selectedDentistId)
    : dentists

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalH = (HOUR_END - HOUR_START) * SLOT_H * 2

  // Scroll to 8h on mount
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = (8 - HOUR_START) * SLOT_H * 2
    }
  }, [date])

  // Current time indicator
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMinutes - HOUR_START * 60) * PX_PER_MIN

  return (
    <div ref={gridRef} className="flex-1 overflow-auto agenda-scroll relative">
      <div className="relative flex" style={{ minWidth: `${visibleDentists.length * 160 + 64}px`, paddingTop: 16 }}>

        {/* Full-width horizontal grid lines */}
        <div className="absolute inset-0 pointer-events-none" style={{ height: totalH + 10 }}>
          {hours.map(h => (
            <div key={h}>
              <div
                className="absolute inset-x-0"
                style={{ top: (h - HOUR_START) * SLOT_H * 2 + 16, borderTop: '1px solid #94a3b8' }}
              />
              <div
                className="absolute inset-x-0"
                style={{ top: (h - HOUR_START) * SLOT_H * 2 + SLOT_H + 16, borderTop: '1px dashed #cbd5e1' }}
              />
            </div>
          ))}
        </div>

        {/* Hour labels */}
        <div className="w-16 flex-shrink-0 border-r relative z-10" style={{ height: totalH, background: '#f8fafc', borderColor: '#94a3b8' }}>
          {hours.map(h => (
            <div key={h} style={{ top: (h - HOUR_START) * SLOT_H * 2 }} className="absolute inset-x-0">
              <span className="absolute right-2 -top-3 text-[11px] font-semibold text-slate-500 select-none leading-none">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Dentist columns */}
        {visibleDentists.map((dentist) => {
          const dentistAppts = appointments.filter(a => a.dentist?.id === dentist.id)

          return (
            <div
              key={dentist.id}
              className="flex-1 min-w-40 relative bg-white"
              style={{ height: totalH, borderRight: '1px solid #cbd5e1' }}
            >

              {/* Clickable empty slots */}
              {hours.map(h => (
                [0, 30].map(m => {
                  const slotStart = h * 60 + m
                  const topPx = (slotStart - HOUR_START * 60) * PX_PER_MIN
                  const iso = `${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
                  return (
                    <div
                      key={`${h}-${m}`}
                      style={{ top: topPx, height: SLOT_H }}
                      className="absolute inset-x-0 hover:bg-violet-50/50 cursor-pointer transition-colors z-0"
                      onClick={() => onSlotClick(dentist.id, iso)}
                    />
                  )
                })
              ))}

              {/* Appointment blocks */}
              {dentistAppts.map(appt => {
                const startMin = dateToMinutes(appt.start_at)
                const endMin   = dateToMinutes(appt.end_at)
                const topPx    = (startMin - HOUR_START * 60) * PX_PER_MIN
                const heightPx = (endMin - startMin) * PX_PER_MIN

                return (
                  <AppointmentBlock
                    key={appt.id}
                    appointment={appt}
                    topPx={topPx}
                    heightPx={heightPx}
                    isBlocked={false}
                    onClick={e => onAppointmentClick(appt, e.currentTarget)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Current time indicator */}
      {nowTop > 0 && nowTop < totalH && (
        <div
          style={{ top: nowTop + 0.5, left: 56 }}
          className="absolute right-0 flex items-center pointer-events-none z-20"
        >
          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
          <div className="flex-1 h-px bg-red-400" />
        </div>
      )}
    </div>
  )
}
