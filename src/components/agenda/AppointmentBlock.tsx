'use client'

import { type Appointment } from '@/hooks/useAppointments'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  scheduled:   { bg: 'bg-blue-50',   border: 'border-blue-300',  text: 'text-blue-900',  label: 'Agendado' },
  confirmed:   { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-900', label: 'Confirmado' },
  in_progress: { bg: 'bg-yellow-50', border: 'border-yellow-400',text: 'text-yellow-900',label: 'Atendendo' },
  completed:   { bg: 'bg-gray-100',  border: 'border-gray-300',  text: 'text-gray-600',  label: 'Concluído' },
  cancelled:   { bg: 'bg-red-50',    border: 'border-red-300',   text: 'text-red-800',   label: 'Cancelado' },
  no_show:     { bg: 'bg-pink-50',   border: 'border-pink-300',  text: 'text-pink-800',  label: 'Faltou' },
}

const STATUS_DOT: Record<string, string> = {
  scheduled:   'bg-blue-400',
  confirmed:   'bg-green-500',
  in_progress: 'bg-yellow-500',
  completed:   'bg-gray-400',
  cancelled:   'bg-red-400',
  no_show:     'bg-pink-400',
}

type Props = {
  appointment: Appointment
  topPx: number
  heightPx: number
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  isBlocked?: boolean
}

export function AppointmentBlock({ appointment, topPx, heightPx, onClick, isBlocked }: Props) {
  const style = STATUS_STYLES[appointment.status] ?? STATUS_STYLES.scheduled
  const dot = STATUS_DOT[appointment.status] ?? 'bg-gray-400'

  if (isBlocked) {
    return (
      <button
        onClick={onClick}
        style={{ top: topPx, height: heightPx }}
        className="absolute inset-x-1 rounded border border-purple-300 bg-purple-100 px-2 py-1 text-left hover:brightness-95 transition-all cursor-pointer z-10 overflow-hidden"
      >
        <p className="text-xs font-semibold text-purple-800 leading-tight">BLOQUEADO</p>
        {appointment.notes && (
          <p className="text-[10px] text-purple-600 truncate">{appointment.notes}</p>
        )}
      </button>
    )
  }

  const startLabel = format(new Date(appointment.start_at), 'HH:mm')
  const endLabel   = format(new Date(appointment.end_at),   'HH:mm')
  const patientName = appointment.patient?.name ?? '—'

  return (
    <button
      onClick={onClick}
      style={{ top: topPx, height: Math.max(heightPx, 22), borderLeftColor: appointment.dentist?.color ?? '#94a3b8' }}
      className={`absolute inset-x-1 rounded border-l-[3px] px-2 py-1 text-left hover:brightness-95 transition-all cursor-pointer z-10 overflow-hidden ${style.bg} ${style.border} ${style.text}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <p className="text-[11px] font-bold truncate leading-tight">{patientName}</p>
      </div>
      {heightPx > 30 && (
        <p className="text-[10px] opacity-75 leading-tight">
          {startLabel} – {endLabel}
        </p>
      )}
      {heightPx > 48 && appointment.procedure && (
        <p className="text-[10px] opacity-60 truncate leading-tight">{appointment.procedure.name}</p>
      )}
      {appointment.status === 'in_progress' && heightPx > 36 && (
        <p className="text-[10px] font-semibold mt-0.5">ATENDENDO</p>
      )}
    </button>
  )
}
