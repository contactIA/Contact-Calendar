'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'

export type BlockType = 'absence' | 'break' | 'meeting' | 'reserved'

export type ScheduleBlock = {
  id: string
  dentist_id: string
  unit_id: string
  start_at: string
  end_at: string
  type: BlockType
}

export type DentistSchedule = {
  id: string
  dentist_id: string
  unit_id: string
  day_of_week: number   // 0 = domingo … 6 = sábado (mesma convenção de Date.getDay())
  start_time: string    // 'HH:MM' ou 'HH:MM:SS'
  end_time: string
}

// Aparência de cada tipo de bloqueio, compartilhada pelas visões Dia e Semana.
// Tons neutros de propósito: bloqueio não deve competir visualmente com consulta.
export const BLOCK_TYPE_META: Record<BlockType, { label: string; bg: string; border: string; accent: string; text: string }> = {
  break: { label: 'Almoço', bg: '#f8fafc', border: '#e2e8f0', accent: '#f59e0b', text: '#475569' },
  absence: { label: 'Ausência', bg: '#f8fafc', border: '#e2e8f0', accent: '#94a3b8', text: '#475569' },
  meeting: { label: 'Reunião', bg: '#f8fafc', border: '#e2e8f0', accent: '#0ea5e9', text: '#475569' },
  reserved: { label: 'Reservado', bg: '#f8fafc', border: '#e2e8f0', accent: '#9333EA', text: '#475569' },
}

export function useScheduleBlocks(from: string, to: string) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [schedules, setSchedules] = useState<DentistSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fetch dentro do timeout (assíncrono) — nunca setState sPncrono no corpo
    // do effect (mesma convenção da busca global no AgendaShell).
    const t = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const res = await api.get<{ blocks: ScheduleBlock[]; schedules: DentistSchedule[] }>(
          `/api/schedule-blocks?from=${from}&to=${to}`
        )
        if (!cancelled) {
          setBlocks(res.blocks ?? [])
          setSchedules(res.schedules ?? [])
        }
      } catch {
        // Falha silenciosa: a agenda segue funcional sem os bloqueios.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [from, to])

  return { blocks, schedules, loading }
}
