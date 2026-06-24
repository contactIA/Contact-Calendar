'use client'

import { useState, useRef, useEffect } from 'react'
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
  // Converte para o horário local (mesmo fuso usado no rótulo do bloco, na linha
  // do "agora" e na criação de slots). Ler a string UTC crua jogava o bloco para
  // a hora UTC (ex.: 10h local virava 13h na grade).
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
  focusRequest?: { apptId: string; minutes: number; token: number } | null
}

export function DailyView({ appointments, dentists, selectedDentistId, onAppointmentClick, onSlotClick, date, focusRequest }: Props) {
  const visibleDentists = selectedDentistId
    ? dentists.filter(d => d.id === selectedDentistId)
    : dentists

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalH = (HOUR_END - HOUR_START) * SLOT_H * 2

  const gridRef = useRef<HTMLDivElement>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const lastFocusToken = useRef<number | null>(null)

  // Scroll padrão ao abrir/trocar de dia (manhã) — exceto quando há um foco de
  // busca pendente, caso em que o efeito de foco abaixo cuida do scroll.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    if (focusRequest && focusRequest.token !== lastFocusToken.current) return
    const targetPx = (8 * 60 - HOUR_START * 60) * PX_PER_MIN
    grid.scrollTop = Math.max(0, targetPx - 80)
  }, [date, focusRequest])

  // Foco vindo da busca: rola suave até centralizar o horário e destaca o
  // agendamento por ~2s. O token (one-shot) evita re-rolar em navegações
  // normais de dia e permite refocar o mesmo horário.
  useEffect(() => {
    if (!focusRequest || focusRequest.token === lastFocusToken.current) return
    lastFocusToken.current = focusRequest.token
    const grid = gridRef.current
    if (grid) {
      const targetPx = (focusRequest.minutes - HOUR_START * 60) * PX_PER_MIN
      const top = targetPx - grid.clientHeight / 2 + SLOT_H / 2
      grid.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
    setHighlightId(focusRequest.apptId)
    const t = setTimeout(() => setHighlightId(null), 2200)
    return () => clearTimeout(t)
  }, [focusRequest])

  // Current time indicator
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMinutes - HOUR_START * 60) * PX_PER_MIN

  return (
    <div ref={gridRef} className="flex-1 overflow-auto agenda-scroll relative">
      <div className="relative flex" style={{ minWidth: `${visibleDentists.length * 160 + 64}px`, paddingTop: 16 }}>

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

              {/* Horizontal grid lines */}
              <div className="absolute inset-0 pointer-events-none z-0">
                {hours.map(h => (
                  <div key={h}>
                    <div
                      className="absolute inset-x-0"
                      style={{ top: (h - HOUR_START) * SLOT_H * 2, borderTop: '1px solid #94a3b8' }}
                    />
                    <div
                      className="absolute inset-x-0"
                      style={{ top: (h - HOUR_START) * SLOT_H * 2 + SLOT_H, borderTop: '1px dashed #cbd5e1' }}
                    />
                  </div>
                ))}
              </div>

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
                    isHighlighted={appt.id === highlightId}
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
