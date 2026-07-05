'use client'

import { useState, useRef, useEffect } from 'react'
import { type Appointment } from '@/hooks/useAppointments'
import { type Dentist } from '@/hooks/useDentists'
import { type ScheduleBlock, type DentistSchedule, BLOCK_TYPE_META } from '@/hooks/useScheduleBlocks'
import { AppointmentBlock } from '../AppointmentBlock'

const HOUR_START = 7
const HOUR_END   = 20
const SLOT_H     = 64   // px per 30-min slot → 128px per hour
const PX_PER_MIN = (SLOT_H * 2) / 60
const GRID_START = HOUR_START * 60
const GRID_END   = HOUR_END * 60

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Funde intervalos [start, end) sobrepostos/encostados em uma lista ordenada.
// Um dentista pode ter dois turnos no mesmo dia (ex.: manhã e tarde em
// unidades diferentes) — o sombreado é o complemento da união dos turnos.
function mergeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

// Trechos da grade [GRID_START, GRID_END) NÃO cobertos pelos intervalos dados.
function invertIntervals(covered: Array<[number, number]>): Array<[number, number]> {
  const gaps: Array<[number, number]> = []
  let cursor = GRID_START
  for (const [s, e] of covered) {
    if (s > cursor) gaps.push([cursor, Math.min(s, GRID_END)])
    cursor = Math.max(cursor, e)
    if (cursor >= GRID_END) break
  }
  if (cursor < GRID_END) gaps.push([cursor, GRID_END])
  return gaps
}

function minutesLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
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
  blocks?: ScheduleBlock[]
  schedules?: DentistSchedule[]
}

export function DailyView({ appointments, dentists, selectedDentistId, onAppointmentClick, onSlotClick, date, focusRequest, blocks = [], schedules = [] }: Props) {
  const visibleDentists = selectedDentistId
    ? dentists.filter(d => d.id === selectedDentistId)
    : dentists

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalH = (HOUR_END - HOUR_START) * SLOT_H * 2

  // Meia-noite LOCAL do dia exibido — referência para converter os timestamps
  // UTC dos bloqueios em minutos do dia, no mesmo fuso dos agendamentos.
  const dayStartMs = new Date(`${date}T00:00:00`).getTime()
  const weekday = new Date(`${date}T12:00:00`).getDay()

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

          // Bloqueios do dentista recortados para o dia exibido (em minutos do
          // dia local) e limitados à janela visível da grade (7h–20h).
          const dentistBlocks = blocks
            .filter(b => b.dentist_id === dentist.id)
            .map(b => {
              const startMin = (new Date(b.start_at).getTime() - dayStartMs) / 60000
              const endMin   = (new Date(b.end_at).getTime()   - dayStartMs) / 60000
              return { ...b, startMin: Math.max(startMin, GRID_START), endMin: Math.min(endMin, GRID_END) }
            })
            .filter(b => b.endMin > b.startMin)

          // Fora-de-expediente: complemento dos turnos do dia. Dentista sem
          // NENHUM expediente cadastrado não é sombreado (dado ausente ≠ folga).
          const dentistSchedules = schedules.filter(s => s.dentist_id === dentist.id)
          const todayShifts = dentistSchedules
            .filter(s => s.day_of_week === weekday)
            .map(s => [timeToMinutes(s.start_time), timeToMinutes(s.end_time)] as [number, number])
          const offHours = dentistSchedules.length === 0
            ? []
            : invertIntervals(mergeIntervals(todayShifts))

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

              {/* Fora de expediente (sombreado, apenas visual — clique atravessa) */}
              {offHours.map(([s, e]) => (
                <div
                  key={`off-${s}`}
                  className="absolute inset-x-0 pointer-events-none"
                  style={{
                    top: (s - GRID_START) * PX_PER_MIN,
                    height: (e - s) * PX_PER_MIN,
                    background: 'rgba(100, 116, 139, 0.10)',
                    zIndex: 1,
                  }}
                />
              ))}

              {/* Faixas de bloqueio (almoço/ausência/reunião/reservado). Sem
                  onClick e ACIMA dos slots clicáveis: o clique morre aqui e o
                  modal de novo agendamento não abre em cima de bloqueio. */}
              {dentistBlocks.map(block => {
                const meta = BLOCK_TYPE_META[block.type] ?? BLOCK_TYPE_META.reserved
                const heightPx = (block.endMin - block.startMin) * PX_PER_MIN
                const compact = heightPx < 44
                return (
                  <div
                    key={block.id}
                    title={`${meta.label} · ${minutesLabel(block.startMin)}–${minutesLabel(block.endMin)}`}
                    className="absolute cursor-not-allowed select-none overflow-hidden"
                    style={{
                      top: (block.startMin - GRID_START) * PX_PER_MIN,
                      height: Math.max(heightPx - 2, 20),
                      left: 4,
                      right: 4,
                      background: `repeating-linear-gradient(135deg, ${meta.bg}, ${meta.bg} 8px, #f1f5f9 8px, #f1f5f9 14px)`,
                      border: `1px solid ${meta.border}`,
                      borderLeft: `3px solid ${meta.accent}`,
                      borderRadius: 8,
                      padding: compact ? '3px 8px' : '6px 8px',
                      zIndex: 5,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: meta.accent }}>
                        {minutesLabel(block.startMin)}
                      </span>
                      <span className="text-[11px] font-semibold truncate" style={{ color: meta.text }}>
                        {meta.label}
                      </span>
                      {!compact && (
                        <span className="text-[10px] ml-auto" style={{ color: meta.text, opacity: 0.6 }}>
                          {minutesLabel(block.endMin)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

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
