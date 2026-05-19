'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type Appointment } from '@/hooks/useAppointments'

const STATUS_BADGE: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-700',
  confirmed:   'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed:   'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-pink-100 text-pink-700',
}

const STATUS_LABEL: Record<string, string> = {
  scheduled:   'Agendado',
  confirmed:   'Confirmado',
  in_progress: 'Atendendo',
  completed:   'Concluído',
  cancelled:   'Cancelado',
  no_show:     'Faltou',
}

type Props = {
  appointments: Appointment[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onAppointmentClick: (appt: Appointment, el: HTMLElement) => void
}

export function ListView({ appointments, loading, total, page, pageSize, onPageChange, onAppointmentClick }: Props) {
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex-1 overflow-auto agenda-scroll p-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <Th>Paciente</Th>
              <Th>Data e Hora</Th>
              <Th>Dentista</Th>
              <Th>Procedimento</Th>
              <Th>Unidade</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">Carregando...</td>
              </tr>
            )}
            {!loading && appointments.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">Nenhuma consulta encontrada</td>
              </tr>
            )}
            {appointments.map(appt => (
              <tr
                key={appt.id}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={e => onAppointmentClick(appt, e.currentTarget as HTMLElement)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{appt.patient?.name ?? '—'}</p>
                  {appt.patient?.phone && (
                    <p className="text-xs text-gray-400">{appt.patient.phone}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  <p>{format(new Date(appt.start_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                  <p className="text-xs text-gray-400">
                    {format(new Date(appt.start_at), 'HH:mm')} – {format(new Date(appt.end_at), 'HH:mm')}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: appt.dentist?.color ?? '#94a3b8' }}
                    />
                    <span className="text-gray-700">{appt.dentist?.user?.name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{appt.procedure?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{appt.unit?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[appt.status]}`}>
                    {STATUS_LABEL[appt.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{total} consultas</p>
            <div className="flex gap-1">
              <PagBtn disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</PagBtn>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = Math.max(1, page - 2) + i
                if (p > totalPages) return null
                return (
                  <PagBtn key={p} active={p === page} onClick={() => onPageChange(p)}>
                    {p}
                  </PagBtn>
                )
              })}
              <PagBtn disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</PagBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {children}
    </th>
  )
}

function PagBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
        active   ? 'bg-green-600 text-white' :
        disabled ? 'text-gray-300 cursor-not-allowed' :
                   'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}
