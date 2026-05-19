'use client'

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'

const STATUS_LABEL: Record<string, string> = {
  scheduled:   'Agendado',
  confirmed:   'Confirmado',
  in_progress: 'Em atendimento',
  completed:   'Concluído',
  cancelled:   'Cancelado',
  no_show:     'Faltou',
}

const NEXT_ACTIONS: Record<string, { label: string; status: string; variant: string }[]> = {
  scheduled:   [
    { label: 'Confirmar',     status: 'confirmed',   variant: 'primary' },
    { label: 'Cancelar',      status: 'cancelled',   variant: 'danger' },
  ],
  confirmed:   [
    { label: 'Check-in',      status: 'in_progress', variant: 'primary' },
    { label: 'Cancelar',      status: 'cancelled',   variant: 'danger' },
    { label: 'Faltou',        status: 'no_show',     variant: 'warning' },
  ],
  in_progress: [
    { label: 'Finalizar',     status: 'completed',   variant: 'primary' },
  ],
}

type Props = {
  appointment: Appointment
  anchorEl: HTMLElement | null
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
  onReschedule: (appointment: Appointment) => void
}

export function AppointmentPopover({ appointment, anchorEl, onClose, onStatusChange, onReschedule }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [anchorEl, onClose])

  const actions = NEXT_ACTIONS[appointment.status] ?? []
  const canReschedule = ['scheduled', 'confirmed'].includes(appointment.status)

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-4 text-sm"
      style={anchorEl ? getPopoverPosition(anchorEl) : { top: '50%', left: '50%' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-base leading-tight">
            {appointment.patient?.name ?? '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {appointment.procedure?.name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2"
        >
          ×
        </button>
      </div>

      {/* Details */}
      <div className="space-y-1.5 mb-3">
        <Row label="Horário">
          {format(new Date(appointment.start_at), 'HH:mm')} –{' '}
          {format(new Date(appointment.end_at), 'HH:mm')}
          <span className="text-gray-400 ml-1">({appointment.duration_minutes} min)</span>
        </Row>
        <Row label="Dentista">{appointment.dentist?.user?.name ?? '—'}</Row>
        <Row label="Cadeira">{appointment.chair?.name ?? '—'}</Row>
        <Row label="Unidade">{appointment.unit?.name ?? '—'}</Row>
        <Row label="Status">
          <span className="font-medium">{STATUS_LABEL[appointment.status]}</span>
        </Row>
        {appointment.patient?.phone && (
          <Row label="Telefone">{appointment.patient.phone}</Row>
        )}
      </div>

      {/* Actions */}
      {(actions.length > 0 || canReschedule) && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
          {actions.map(a => (
            <button
              key={a.status}
              onClick={() => { onStatusChange(appointment.id, a.status); onClose() }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                a.variant === 'primary' ? 'bg-green-600 text-white hover:bg-green-700' :
                a.variant === 'danger'  ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' :
                                          'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100'
              }`}
            >
              {a.label}
            </button>
          ))}
          {canReschedule && (
            <button
              onClick={() => { onReschedule(appointment); onClose() }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Remarcar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-16 flex-shrink-0 text-xs">{label}</span>
      <span className="text-gray-700 text-xs">{children}</span>
    </div>
  )
}

function getPopoverPosition(el: HTMLElement): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const spaceRight = window.innerWidth - rect.right
  const spaceBelow = window.innerHeight - rect.bottom

  const left = spaceRight >= 290 ? rect.right + 8 : rect.left - 288 - 8
  const top  = spaceBelow >= 300 ? rect.top : rect.bottom - 300

  return { top: Math.max(8, top), left: Math.max(8, left) }
}
