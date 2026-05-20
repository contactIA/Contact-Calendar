'use client'

import { useState, useEffect } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/lib/client'
import { type Appointment } from '@/hooks/useAppointments'
import { type Dentist } from '@/hooks/useDentists'

type Chair = { id: string; name: string; unit_id: string }

type Props = {
  open: boolean
  appointment: Appointment | null
  dentists: Dentist[]
  onClose: () => void
  onSaved: () => void
}

export function RescheduleModal({ open, appointment, dentists, onClose, onSaved }: Props) {
  const { mounted, closing } = useAnimatedMount(open, 180)
  const [date, setDate]           = useState('')
  const [time, setTime]           = useState('')
  const [duration, setDuration]   = useState(30)
  const [dentistId, setDentistId] = useState('')
  const [chairId, setChairId]     = useState('')
  const [chairs, setChairs]       = useState<Chair[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Populate fields from appointment when it opens
  useEffect(() => {
    if (!open || !appointment) return
    const start = new Date(appointment.start_at)
    setDate(format(start, 'yyyy-MM-dd'))
    setTime(format(start, 'HH:mm'))
    setDuration(appointment.duration_minutes)
    setDentistId(appointment.dentist?.id ?? '')
    setChairId(appointment.chair?.id ?? '')
    setError('')
  }, [open, appointment])

  // Load chairs when dentist changes
  useEffect(() => {
    if (!dentistId) { setChairs([]); return }
    api.get<Chair[]>('/api/admin/chairs').then(setChairs).catch(() => {})
  }, [dentistId])

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!mounted || !appointment) return null

  const startLabel  = `${date}T${time}:00`
  const endDate     = date && time ? new Date(new Date(startLabel).getTime() + duration * 60_000) : null
  const endLabel    = endDate ? format(endDate, 'HH:mm') : '—'
  const dateDisplay = date ? format(new Date(date + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR }) : ''

  async function handleSave() {
    if (!date || !time) { setError('Informe a data e o horário'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/api/appointments/${appointment!.id}`, {
        start_at:         `${date}T${time}:00.000Z`,
        duration_minutes: duration,
        dentist_id:       dentistId || undefined,
        chair_id:         chairId || undefined,
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao remarcar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden ${closing ? 'animate-modal-out' : 'animate-modal-in'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Remarcar consulta</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">
              {appointment.patient?.name ?? '—'} · {appointment.procedure?.name ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Date */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Nova data</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            {dateDisplay && <p className="text-[11px] text-gray-400 mt-1 capitalize">{dateDisplay}</p>}
          </div>

          {/* Time + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Horário</label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Duração (min)</label>
              <input
                type="number"
                min={5}
                step={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Time summary */}
          {date && time && (
            <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-4 py-2.5">
              <span className="text-violet-500 text-sm">🕐</span>
              <span className="text-[12px] font-semibold text-violet-700">{time} → {endLabel}</span>
              <span className="text-[11px] text-violet-400 ml-auto">{duration} min</span>
            </div>
          )}

          {/* Dentist */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Profissional</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
              value={dentistId}
              onChange={e => { setDentistId(e.target.value); setChairId('') }}
            >
              <option value="">Selecione...</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.user?.name ?? d.id}</option>
              ))}
            </select>
          </div>

          {/* Chair */}
          {chairs.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Cadeira</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                value={chairId}
                onChange={e => setChairId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {chairs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !date || !time}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
