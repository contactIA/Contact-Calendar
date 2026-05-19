'use client'

import { useMemo, useRef, useEffect } from 'react'
import { type Appointment } from '@/hooks/useAppointments'
import { type Dentist } from '@/hooks/useDentists'
import { AppointmentBlock } from '../AppointmentBlock'

const HOUR_START = 7
const HOUR_END   = 20
const SLOT_H     = 60   // px per 30-min slot → 120px per hour
const PX_PER_MIN = (SLOT_H * 2) / 60

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function dateToMinutes(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
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
      <div className="flex" style={{ minWidth: `${visibleDentists.length * 160 + 56}px` }}>

        {/* Hour labels */}
        <div className="w-14 flex-shrink-0 border-r border-gray-100 relative" style={{ height: totalH }}>
          {hours.map(h => (
            <div
              key={h}
              style={{ top: (h - HOUR_START) * SLOT_H * 2 }}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-gray-400 select-none"
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Dentist columns */}
        {visibleDentists.map(dentist => {
          const dentistAppts = appointments.filter(a => a.dentist?.id === dentist.id)

          return (
            <div
              key={dentist.id}
              className="flex-1 min-w-40 border-r border-gray-100 relative"
              style={{ height: totalH }}
            >
              {/* Hour grid lines */}
              {hours.map(h => (
                <div key={h}>
                  <div
                    style={{ top: (h - HOUR_START) * SLOT_H * 2 }}
                    className="absolute inset-x-0 border-t border-gray-100"
                  />
                  <div
                    style={{ top: (h - HOUR_START) * SLOT_H * 2 + SLOT_H }}
                    className="absolute inset-x-0 border-t border-dashed border-gray-100"
                  />
                </div>
              ))}

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
                      className="absolute inset-x-0 hover:bg-green-50 cursor-pointer transition-colors z-0"
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
