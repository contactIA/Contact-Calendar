'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ConsultaJson } from '@/api/v1/esquemas'
import { diaNoFuso, diaSeguinte, instanteNoFuso } from '@/compartilhado/fuso'
import { useEu } from '@/componentes/casca'
import { api, fraseDoErro } from '@/componentes/cliente/api'
import { paraAppointment, STATUS_PARA_API, type StatusDaTela } from './daApi'
import type { Appointment } from './tiposDaTela'
export type { Appointment } from './tiposDaTela'

type Filters = {
  date?: string
  date_from?: string
  date_to?: string
  unit_id?: string
  dentist_id?: string
  procedure_id?: string
  status?: string
  page?: number
  page_size?: number
}

/** A Lista mostra de hoje até seis semanas: o máximo que a API devolve de uma vez. */
const DIAS_DA_LISTA = 42

/** De quando a quando pedir, no fuso da clínica. */
function intervalo(filters: Filters, fuso: string): { de: string; ate: string } {
  const meiaNoite = (dia: string) => instanteNoFuso(dia, '00:00', fuso).toISOString()
  if (filters.date) return { de: meiaNoite(filters.date), ate: meiaNoite(diaSeguinte(filters.date)) }
  if (filters.date_from && filters.date_to) return { de: meiaNoite(filters.date_from), ate: meiaNoite(diaSeguinte(filters.date_to)) }
  let dia = diaNoFuso(new Date(), fuso)
  const de = meiaNoite(dia)
  for (let i = 0; i < DIAS_DA_LISTA; i++) dia = diaSeguinte(dia)
  return { de, ate: meiaNoite(dia) }
}

export function useAppointments(filters: Filters) {
  const fuso = useEu().clinica.fusoHorario
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chave = JSON.stringify(filters)
  // A versão de cada consulta, para mandar de volta ao mudar o status.
  const versoes = useRef(new Map<string, number>())

  const carregar = useCallback(async () => {
    const f = JSON.parse(chave) as Filters
    setLoading(true)
    setError(null)
    try {
      const { de, ate } = intervalo(f, fuso)
      const params = new URLSearchParams({ de, ate })
      if (f.unit_id) params.set('unidadeId', f.unit_id)
      if (f.dentist_id) params.set('profissionalId', f.dentist_id)
      const { consultas } = await api.get<{ consultas: ConsultaJson[] }>(`/consultas?${params}`)
      // O procedimento e o status a API não filtra: a tela filtra o que chegou.
      const todas = consultas
        .map(paraAppointment)
        .filter((a) => !f.procedure_id || a.procedure?.id === f.procedure_id)
        .filter((a) => !f.status || f.status === 'all' || a.status === f.status)
      versoes.current = new Map(todas.map((a) => [a.id, a.versao]))
      const tamanho = f.page_size ?? todas.length
      const pagina = f.page ? todas.slice((f.page - 1) * tamanho, f.page * tamanho) : todas
      setAppointments(pagina)
      setTotal(todas.length)
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally {
      setLoading(false)
    }
  }, [chave, fuso])

  useEffect(() => {
    // Dentro de uma promessa: nunca setState síncrono no corpo do effect.
    void Promise.resolve().then(carregar)
  }, [carregar])

  const updateStatus = useCallback(
    async (id: string, status: string, reason?: string) => {
      await api.post(`/consultas/${id}/status`, {
        status: STATUS_PARA_API[status as StatusDaTela],
        motivo: reason ?? null,
        versao: versoes.current.get(id),
      })
      await carregar()
    },
    [carregar]
  )

  const reschedule = useCallback(
    async (id: string, start_at: string, duration_minutes: number) => {
      await api.post(`/consultas/${id}/remarcar`, { inicio: start_at, duracaoMinutos: duration_minutes, versao: versoes.current.get(id) })
      await carregar()
    },
    [carregar]
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
      const criada = await api.post<ConsultaJson>('/consultas', {
        unidadeId: payload.unit_id,
        profissionalId: payload.dentist_id,
        procedimentoId: payload.procedure_id,
        inicio: payload.start_at,
        duracaoMinutos: payload.duration_minutes,
        ...(payload.chair_id ? { cadeiraId: payload.chair_id } : {}),
        paciente: { id: payload.patient_id },
      })
      await carregar()
      return paraAppointment(criada)
    },
    [carregar]
  )

  return { appointments, total, loading, error, refetch: carregar, updateStatus, reschedule, create }
}
