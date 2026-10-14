'use client'

import { useState, useEffect } from 'react'
import type { BloqueioJson, ExpedienteJson, ProfissionalJson } from '@/api/v1/esquemas'
import { diaSeguinte, instanteNoFuso } from '@/compartilhado/fuso'
import { useEu } from '@/componentes/casca'
import { api } from '@/componentes/cliente/api'
import { paraDentistSchedule, paraScheduleBlock } from './daApi'
import type { BlockType, ScheduleBlock, DentistSchedule } from './tiposDaTela'
export type { BlockType, ScheduleBlock, DentistSchedule } from './tiposDaTela'

// Aparência de cada tipo de bloqueio, compartilhada pelas visões Dia e Semana.
// Tons neutros de propósito: bloqueio não deve competir visualmente com consulta.
export const BLOCK_TYPE_META: Record<BlockType, { label: string; bg: string; border: string; accent: string; text: string }> = {
  break: { label: 'Almoço', bg: '#f8fafc', border: '#e2e8f0', accent: '#f59e0b', text: '#475569' },
  absence: { label: 'Ausência', bg: '#f8fafc', border: '#e2e8f0', accent: '#94a3b8', text: '#475569' },
  meeting: { label: 'Reunião', bg: '#f8fafc', border: '#e2e8f0', accent: '#0ea5e9', text: '#475569' },
  reserved: { label: 'Reservado', bg: '#f8fafc', border: '#e2e8f0', accent: '#9333EA', text: '#475569' },
}

/** Os bloqueios do período e o expediente semanal de cada profissional ativo. */
export function useScheduleBlocks(from: string, to: string) {
  const fuso = useEu().clinica.fusoHorario
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [schedules, setSchedules] = useState<DentistSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fetch dentro do timeout (assíncrono): nunca setState síncrono no corpo do effect.
    const t = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const de = instanteNoFuso(from, '00:00', fuso).toISOString()
        const ate = instanteNoFuso(diaSeguinte(to), '00:00', fuso).toISOString()
        const [{ bloqueios }, { profissionais }] = await Promise.all([
          api.get<{ bloqueios: BloqueioJson[] }>(`/bloqueios?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`),
          api.get<{ profissionais: ProfissionalJson[] }>('/profissionais'),
        ])
        // O expediente é por profissional: um pedido de cada, em paralelo.
        const expedientes = await Promise.all(
          profissionais
            .filter((p) => p.ativo)
            .map(async (p) => {
              const { expedientes } = await api.get<{ expedientes: ExpedienteJson[] }>(`/profissionais/${p.id}/expedientes`)
              return expedientes.map((e, i) => paraDentistSchedule(p.id, e, i))
            })
        )
        if (!cancelled) {
          setBlocks(bloqueios.map(paraScheduleBlock))
          setSchedules(expedientes.flat())
        }
      } catch {
        // Falha silenciosa: a agenda segue funcional sem os bloqueios.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [from, to, fuso])

  return { blocks, schedules, loading }
}
