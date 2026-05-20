'use client'

import { useEffect, useRef } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Dentist } from '@/hooks/useDentists'

const STATUS_LABEL: Record<string, string> = {
  scheduled:   'Agendado',
  confirmed:   'Confirmado',
  in_progress: 'Em atendimento',
  completed:   'Concluído',
  cancelled:   'Cancelado',
  no_show:     'Faltou',
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  scheduled:   { bg: '#eff6ff', color: '#3b82f6' },
  confirmed:   { bg: '#ecfdf5', color: '#10b981' },
  in_progress: { bg: '#fffbeb', color: '#f59e0b' },
  completed:   { bg: '#f3f4f6', color: '#6b7280' },
  cancelled:   { bg: '#fef2f2', color: '#ef4444' },
  no_show:     { bg: '#fdf2f8', color: '#c026d3' },
}

type Appt = {
  status: string
  dentist?: { id: string } | null
  patient?: { name: string } | null
  start_at: string
  procedure?: { name: string } | null
}

type Props = {
  open: boolean
  onClose: () => void
  date: Date
  appointments: Appt[]
  dentists: Dentist[]
}

export function DayReportModal({ open, onClose, date, appointments, dentists }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { mounted, closing } = useAnimatedMount(open, 180)

  useEffect(() => {
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!mounted) return null

  const total      = appointments.length
  const byStatus   = Object.entries(STATUS_LABEL).map(([status, label]) => ({
    status, label,
    count: appointments.filter(a => a.status === status).length,
    ...STATUS_COLOR[status],
  })).filter(s => s.count > 0)

  const byDentist = dentists.map(d => ({
    dentist: d,
    appts: appointments.filter(a => a.dentist?.id === d.id)
      .sort((a, b) => a.start_at.localeCompare(b.start_at)),
  })).filter(d => d.appts.length > 0)

  const dateLabel = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}>
      <div ref={ref} className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden ${closing ? 'animate-modal-out' : 'animate-modal-in'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Relatório do Dia</h2>
            <p className="text-xs text-gray-400 capitalize mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto agenda-scroll flex-1 px-6 py-4 space-y-5">

          {/* Totais por status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Resumo</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-1">
                <span className="text-sm font-medium text-gray-600">Total de agendamentos</span>
                <span className="text-2xl font-bold text-gray-900">{total}</span>
              </div>
              {byStatus.map(s => (
                <div key={s.status} className="rounded-xl px-3 py-2.5 flex flex-col gap-1" style={{ background: s.bg }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                  <span className="text-xl font-bold leading-none" style={{ color: s.color }}>{s.count}</span>
                </div>
              ))}
              {total === 0 && (
                <div className="col-span-3 text-center text-sm text-gray-400 py-4">Nenhum agendamento neste dia</div>
              )}
            </div>
          </div>

          {/* Por dentista */}
          {byDentist.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Por profissional</p>
              <div className="space-y-3">
                {byDentist.map(({ dentist, appts }) => (
                  <div key={dentist.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-50">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: dentist.color ?? '#a855f7' }}>
                        {(dentist.user?.name ?? '?').split(' ').slice(0, 2).map(p => p[0]).join('')}
                      </span>
                      <span className="text-[12px] font-semibold text-gray-700">{dentist.user?.name ?? '—'}</span>
                      <span className="ml-auto text-[11px] font-bold text-gray-500">{appts.length} consulta{appts.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {appts.map((a, i) => {
                        const sc = STATUS_COLOR[a.status]
                        return (
                          <div key={i} className="flex items-center gap-3 px-3 py-2">
                            <span className="text-[11px] font-semibold text-gray-400 w-10 flex-shrink-0">
                              {format(new Date(a.start_at), 'HH:mm')}
                            </span>
                            <span className="text-[12px] font-medium text-gray-800 flex-1 truncate">
                              {a.patient?.name ?? '—'}
                            </span>
                            {a.procedure && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{a.procedure.name}</span>
                            )}
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: sc?.bg, color: sc?.color }}>
                              {STATUS_LABEL[a.status]}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
