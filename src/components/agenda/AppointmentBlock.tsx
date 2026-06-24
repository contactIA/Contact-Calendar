'use client'

import { type Appointment } from '@/hooks/useAppointments'
import { format } from 'date-fns'

const STATUS_STYLES: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
  scheduled:   { bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6', text: '#1e40af', label: 'Agendado' },
  confirmed:   { bg: '#ecfdf5', border: '#a7f3d0', dot: '#10b981', text: '#065f46', label: 'Confirmado' },
  in_progress: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', text: '#92400e', label: 'Atendendo' },
  completed:   { bg: '#f3f4f6', border: '#d1d5db', dot: '#6b7280', text: '#374151', label: 'Concluído' },
  cancelled:   { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', text: '#991b1b', label: 'Cancelado' },
  no_show:     { bg: '#fdf2f8', border: '#f0abfc', dot: '#c026d3', text: '#701a75', label: 'Faltou' },
}

const BLOCKED_STYLE = { bg: '#faf5ff', border: '#e9d5ff', dot: '#a855f7', text: '#6b21a8' }

type Props = {
  appointment: Appointment
  topPx: number
  heightPx: number
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  isBlocked?: boolean
  isHighlighted?: boolean
}

const HIGHLIGHT_SHADOW = '0 0 0 3px #a855f7, 0 8px 22px rgba(168,85,247,.45)'

export function AppointmentBlock({ appointment, topPx, heightPx, onClick, isHighlighted }: Props) {
  const isBlocked = appointment.status === 'cancelled' && !appointment.patient
  const s = STATUS_STYLES[appointment.status] ?? STATUS_STYLES.scheduled
  const compact = heightPx < 44

  const startLabel = format(new Date(appointment.start_at), 'HH:mm')
  const endLabel   = format(new Date(appointment.end_at),   'HH:mm')
  const patientName = appointment.patient?.name ?? '—'
  const firstName = patientName.split(' ')[0]

  const bgStyle = appointment.status === 'cancelled'
    ? `repeating-linear-gradient(135deg, ${s.bg}, ${s.bg} 6px, #fff 6px, #fff 10px)`
    : s.bg

  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        top: topPx,
        height: Math.max(heightPx - 2, 20),
        left: 4,
        right: 4,
        background: bgStyle,
        border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.dot}`,
        borderRadius: 8,
        padding: compact ? '3px 8px' : '6px 8px',
        cursor: 'pointer',
        overflow: 'hidden',
        textAlign: 'left',
        zIndex: isHighlighted ? 11 : 10,
        boxShadow: isHighlighted ? HIGHLIGHT_SHADOW : undefined,
        transition: 'box-shadow .15s, transform .15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = `0 4px 14px rgba(0,0,0,.13)`
        el.style.transform = 'translateY(-1px) scale(1.01)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        // Mantém o anel de destaque se ainda estiver em foco pela busca.
        el.style.boxShadow = isHighlighted ? HIGHLIGHT_SHADOW : 'none'
        el.style.transform = 'none'
      }}
    >
      {compact ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold" style={{ color: s.dot }}>{startLabel}</span>
          <span className="text-[11px] font-medium truncate" style={{ color: '#0f172a' }}>{firstName}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-semibold" style={{ color: s.text }}>{startLabel}</span>
            {appointment.status === 'in_progress' && (
              <span className="text-[9px] font-bold text-white px-1 py-px rounded" style={{ background: s.dot }}>AGORA</span>
            )}
            {heightPx > 56 && (
              <span className="text-[10px] ml-auto" style={{ color: s.text, opacity: 0.6 }}>{endLabel}</span>
            )}
          </div>
          <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: '#0f172a' }}>
            {patientName}
          </div>
          {heightPx > 56 && appointment.procedure && (
            <div className="text-[11px] truncate mt-0.5" style={{ color: '#475569' }}>
              {appointment.procedure.name}
            </div>
          )}
        </>
      )}
    </button>
  )
}
