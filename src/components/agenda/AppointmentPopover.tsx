'use client'

import { useEffect, useRef, useState } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'
import { api } from '@/lib/client'

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  scheduled:   { label: 'Agendado',       bg: '#eff6ff', color: '#3b82f6' },
  confirmed:   { label: 'Confirmado',     bg: '#ecfdf5', color: '#10b981' },
  in_progress: { label: 'Em atendimento', bg: '#fffbeb', color: '#f59e0b' },
  completed:   { label: 'Concluído',      bg: '#f3f4f6', color: '#6b7280' },
  cancelled:   { label: 'Cancelado',      bg: '#fef2f2', color: '#ef4444' },
  no_show:     { label: 'Faltou',         bg: '#fdf2f8', color: '#c026d3' },
}

const NEXT_ACTIONS: Record<string, { label: string; status: string; variant: 'confirm' | 'danger' | 'warn' | 'neutral' }[]> = {
  scheduled:   [
    { label: 'Confirmar',  status: 'confirmed',   variant: 'confirm' },
    { label: 'Cancelar',   status: 'cancelled',   variant: 'danger' },
  ],
  confirmed:   [
    { label: 'Check-in',   status: 'in_progress', variant: 'confirm' },
    { label: 'Faltou',     status: 'no_show',     variant: 'warn' },
    { label: 'Cancelar',   status: 'cancelled',   variant: 'danger' },
  ],
  in_progress: [
    { label: 'Finalizar',  status: 'completed',   variant: 'confirm' },
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
  const { mounted, closing } = useAnimatedMount(true, 140)
  const [wppLoading, setWppLoading] = useState(false)

  async function openAtendimento() {
    if (!phone) return
    setWppLoading(true)
    try {
      const res = await api.get<{ url: string }>(`/api/helena/session?phone=${encodeURIComponent(phone)}`)
      window.open(res.url, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer')
    } finally {
      setWppLoading(false)
    }
  }

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

  if (!mounted) return null

  const actions = NEXT_ACTIONS[appointment.status] ?? []
  const canReschedule = ['scheduled', 'confirmed'].includes(appointment.status)
  const chip = STATUS_CHIP[appointment.status] ?? STATUS_CHIP.scheduled
  const phone = appointment.patient?.phone

  const timeLabel = `${format(new Date(appointment.start_at), 'HH:mm')} – ${format(new Date(appointment.end_at), 'HH:mm')}`
  const dateLabel = format(new Date(appointment.start_at), "EEE, d 'de' MMM", { locale: ptBR })

  return (
    <div
      ref={ref}
      className={`fixed z-50 w-72 bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden ${closing ? 'animate-popover-out' : 'animate-popover-in'}`}
      style={anchorEl ? getPopoverPosition(anchorEl) : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      {/* Gradient top bar */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#a855f7,#d946ef)' }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: chip.bg, color: chip.color }}
              >
                {chip.label}
              </span>
            </div>
            <p className="text-[15px] font-bold text-gray-900 leading-tight truncate">
              {appointment.patient?.name ?? '—'}
            </p>
            {appointment.procedure && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{appointment.procedure.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors ml-2 flex-shrink-0 text-base"
          >
            ×
          </button>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4 bg-gray-50 rounded-xl p-3">
          <Detail icon="🕐" label="Horário" value={timeLabel} />
          <Detail icon="📅" label="Data" value={dateLabel} />
          <Detail icon="👨‍⚕️" label="Dentista" value={appointment.dentist?.user?.name ?? '—'} />
          <Detail icon="🪑" label="Cadeira" value={appointment.chair?.name ?? '—'} />
          {appointment.unit && (
            <Detail icon="🏥" label="Unidade" value={appointment.unit.name} />
          )}
          {phone && (
            <Detail icon="📱" label="Telefone" value={phone} />
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {actions.length > 0 && (
            <div className="flex gap-2">
              {actions.map(a => (
                <button
                  key={a.status}
                  onClick={() => { onStatusChange(appointment.id, a.status); onClose() }}
                  className="flex-1 text-[12px] font-semibold py-2 rounded-xl transition-opacity hover:opacity-90"
                  style={
                    a.variant === 'confirm' ? { background: '#10b981', color: '#fff' } :
                    a.variant === 'danger'  ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' } :
                                              { background: '#fffbeb', color: '#f59e0b', border: '1px solid #fde68a' }
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {phone && (
              <button
                onClick={openAtendimento}
                disabled={wppLoading}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold py-2 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: '#25D366', color: '#fff' }}
              >
                {wppLoading ? (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L0 24l6.318-1.506A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.653-.502-5.181-1.381l-.371-.22-3.751.894.924-3.646-.241-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
                )}
                {wppLoading ? 'Buscando...' : 'Atendimento'}
              </button>
            )}
            {canReschedule && (
              <button
                onClick={() => { onReschedule(appointment); onClose() }}
                className="flex-1 text-[12px] font-semibold py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Remarcar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-[12px] font-medium text-gray-700 truncate">{value}</div>
    </div>
  )
}

function getPopoverPosition(el: HTMLElement): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const spaceRight = window.innerWidth - rect.right
  const spaceBelow = window.innerHeight - rect.bottom

  const left = spaceRight >= 300 ? rect.right + 8 : rect.left - 296 - 8
  const top  = spaceBelow >= 340 ? rect.top : rect.bottom - 340

  return { top: Math.max(8, top), left: Math.max(8, left) }
}
