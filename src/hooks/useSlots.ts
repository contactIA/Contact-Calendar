'use client'

import { useState, useEffect } from 'react'
import type { CadeiraJson, HorarioLivreJson } from '@/api/v1/esquemas'
import { api } from '@/componentes/cliente/api'

export type Slot = {
  start_at: string
  end_at: string
  chair_id: string
  chair_name: string
}

type Resposta = { profissionais: { profissional: { id: string; nome: string }; horarios: HorarioLivreJson[] }[] }

/** Os horários livres do profissional no dia, com o nome da cadeira. */
export function useSlots(params: {
  dentist_id: string
  unit_id: string
  procedure_id: string
  date: string
} | null) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const chave = params ? `${params.dentist_id}|${params.unit_id}|${params.procedure_id}|${params.date}` : null

  useEffect(() => {
    let cancelado = false
    void Promise.resolve().then(async () => {
      if (!chave) { setSlots([]); return }
      const [profissionalId, unidadeId, procedimentoId, data] = chave.split('|')
      setLoading(true)
      try {
        const q = new URLSearchParams({ unidadeId: unidadeId!, procedimentoId: procedimentoId!, data: data!, profissionalId: profissionalId! })
        const [livres, { cadeiras }] = await Promise.all([
          api.get<Resposta>(`/horarios-livres?${q}`),
          api.get<{ cadeiras: CadeiraJson[] }>(`/cadeiras?unidadeId=${unidadeId}`),
        ])
        const nomes = new Map(cadeiras.map((c) => [c.id, c.nome]))
        const horarios = livres.profissionais.find((p) => p.profissional.id === profissionalId)?.horarios ?? []
        if (!cancelado) {
          setSlots(horarios.map((h) => ({ start_at: h.inicio, end_at: h.fim, chair_id: h.cadeiraId, chair_name: nomes.get(h.cadeiraId) ?? '' })))
        }
      } catch {
        if (!cancelado) setSlots([])
      } finally {
        if (!cancelado) setLoading(false)
      }
    })
    return () => { cancelado = true }
  }, [chave])

  return { slots, loading }
}
