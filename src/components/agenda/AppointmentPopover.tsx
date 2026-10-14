'use client'

import { useEffect, useRef } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'
import { useEu } from '@/componentes/casca'

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
    { label: 'Check-in',   status: 'in_progress', variant: 'confirm' },
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

/** O que o dentista marca nas consultas dele: a chegada e o fim do atendimento. */
const DO_DENTISTA = ['in_progress', 'completed']

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
  // A recepção e o gestor fazem tudo; o dentista, só a chegada e o fim das consultas dele.
  const { papeis, profissionalId } = useEu().usuario
  const cuidaDaAgenda = papeis.gestor || papeis.recepcao
  const daPessoa = cuidaDaAgenda || (profissionalId !== null && appointment.dentist?.id === profissionalId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      const insidePopover = ref.current?.contains(target) ?? false
      // anchorEl pode ser null (popover aberto pela busca, sem âncora). Nesse
      // caso só importa o clique fora do popover — antes o clique fora nunca
      // fechava, deixando o popover "travado" na tela.
      const insideAnchor = anchorEl?.contains(target) ?? false
      if (!insidePopover && !insideAnchor) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [anchorEl, onClose])

  if (!mounted) return null

  const actions = (NEXT_ACTIONS[appointment.status] ?? []).filter(a => cuidaDaAgenda || (daPessoa && DO_DENTISTA.includes(a.status)))
  const canReschedule = cuidaDaAgenda && ['scheduled', 'confirmed'].includes(appointment.status)
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

          {/* A conversa com o paciente na plataforma volta na fase 7, com a ligação ao CRM. */}
          <div className="flex gap-2">
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
  const spaceLeft  = rect.left
  const spaceBelow = window.innerHeight - rect.bottom

  // Prefere abrir à ESQUERDA do bloco (para o lado da sidebar, conteúdo estático),
  // evitando cobrir as colunas de agendamentos da grade à direita. Cai para a
  // direita só quando não há espaço suficiente à esquerda. Popover = w-72 (288px) + 8 de gap.
  const left = spaceLeft >= 296 ? rect.left - 296 : rect.right + 8
  const top  = spaceBelow >= 340 ? rect.top : rect.bottom - 340

  return { top: Math.max(8, top), left: Math.max(8, left) }
}
