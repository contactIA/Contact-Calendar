'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/client'
import { format } from 'date-fns'

export type Appointment = {
  id: string
  start_at: string
  end_at: string
  duration_minutes: number
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  notes: string | null
  created_by_role: string
  patient: { id: string; name: string; phone: string | null } | null
  dentist: { id: string; color: string; user: { name: string } | null } | null
  procedure: { id: string; name: string; color: string; duration_minutes: number } | null
  chair: { id: string; name: string } | null
  unit: { id: string; name: string } | null
}

type Filters = {
  date?: string
  unit_id?: string
  dentist_id?: string
  status?: string
  page?: number
  page_size?: number
}

export function useAppointments(filters: Filters) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v))
      })
      const res = await api.get<{ data: Appointment[]; total: number }>(
        `/api/appointments?${params}`
      )
      setAppointments(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar consultas')
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { fetch() }, [fetch])

  const updateStatus = useCallback(
    async (id: string, status: string, reason?: string) => {
      await api.patch(`/api/appointments/${id}/status`, { status, cancelled_reason: reason })
      await fetch()
    },
    [fetch]
  )

  const reschedule = useCallback(
    async (id: string, start_at: string, duration_minutes: number) => {
      await api.patch(`/api/appointments/${id}`, { start_at, duration_minutes })
      await fetch()
    },
    [fetch]
  )

  const create = useCallback(
    async (payload: {
      patient_id: string
      dentist_id: string
      unit_id: string
      chair_id: string
      procedure_id: string
      start_at: string
      duration_minutes: number
    }) => {
      const res = await api.post<Appointment>('/api/appointments', payload)
      await fetch()
      return res
    },
    [fetch]
  )

  return { appointments, total, loading, error, refetch: fetch, updateStatus, reschedule, create }
}
