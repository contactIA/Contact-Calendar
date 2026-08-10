'use client'

// ============================================================================
// usePanelCards — a fonte de dados do kanban (TASK-041).
//
// Faz duas coisas:
//   1. BUSCA os cards em /api/panels/cards (que lê só do espelho local).
//   2. FICA DE OLHO: assina o Realtime de helena_cards filtrando pela conta e,
//      a cada mudança no banco, chama refetch() — a tela reflete sem F5.
//
// Se o Realtime não estiver disponível (SUPABASE_JWT_SECRET ausente, rede
// bloqueando websocket, canal caiu), o hook NÃO fica parado: cai para
// revalidação periódica. A tela continua se atualizando, só com alguns segundos
// de atraso. O campo `realtime` diz em qual modo está, para a UI poder avisar.
//
// Consumidor previsto: KanbanBoard (TASK-042).
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { api } from '@/lib/client'
import { supabase } from '@/lib/supabase'

// Intervalo do modo de contingência. 10s é folgado para o banco (a leitura é do
// espelho, indexada por account_id + panel_id) e imperceptível na operação.
const POLL_INTERVAL_MS = 10_000

export type PanelStep = {
  id: string
  helena_step_id: string
  name: string | null
  position: number | null
  count: number
}

export type PanelCard = {
  id: string
  helena_card_id: string
  step_id: string | null
  patient_id: string | null
  lead_name: string | null
  appt_date: string | null
  appt_time: string | null
  unit_tag: string | null
  crc_tag: string | null
  origin_tag: string | null
  closed_value: number | null
  status: string | null
  description: string | null
  tag_ids: string[] | null
  updated_at: string | null
  step: { id: string; helena_step_id: string; name: string | null; position: number | null } | null
  patient: { id: string; name: string; phone: string | null } | null
}

/**
 * Vínculo etiqueta → significado (tabela tag_links, TASK-013).
 * O card guarda o UUID da tag; é isto que traduz para texto legível.
 * Adicionado na TASK-042 para o KanbanCard poder pintar as etiquetas.
 */
export type PanelTagLink = {
  helena_tag_id: string
  family: 'unit' | 'crc' | 'channel'
  meaning: string | null
}

export type PanelInfo = {
  id: string
  helena_panel_id: string
  title: string | null
  synced_at: string | null
  resolved_by: string
}

export type PanelCardsFilters = {
  panelId?: string
  stepId?: string
  /** UUID da tag na Helena — casa com qualquer família (unidade/CRC/canal). */
  etiqueta?: string
  /** Busca livre pelo nome do lead. */
  q?: string
  limit?: number
}

type PanelCardsResponse = {
  source: 'mirror'
  panel: PanelInfo
  steps: PanelStep[]
  tags: PanelTagLink[]
  cards: PanelCard[]
  total: number
  returned: number
  truncated: boolean
  cards_without_step: number
}

/**
 * 'connecting' — pedindo o token / abrindo o canal
 * 'live'       — Realtime assinado; mudanças chegam na hora
 * 'polling'    — Realtime indisponível; revalidando a cada POLL_INTERVAL_MS
 */
export type RealtimeStatus = 'connecting' | 'live' | 'polling'

export function usePanelCards(accountId: string, filters: PanelCardsFilters = {}) {
  const [data, setData]         = useState<PanelCardsResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting')
  // Tempo da última busca — usado no critério de aceite "< 1,5s".
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null)

  // Serializa os filtros: o objeto literal vindo do componente é novo em cada
  // render, então comparar por referência remontaria o fetch para sempre.
  // Mesmo padrão do useAppointments.
  const filterKey = JSON.stringify(filters)

  // ---- 1) BUSCA ------------------------------------------------------------
  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const startedAt = performance.now()
    try {
      const params = new URLSearchParams()
      Object.entries(JSON.parse(filterKey) as PanelCardsFilters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
      })
      const qs  = params.toString()
      const res = await api.get<PanelCardsResponse>(`/api/panels/cards${qs ? `?${qs}` : ''}`)
      setData(res)
      setLastFetchMs(Math.round(performance.now() - startedAt))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar cards do painel')
    } finally {
      setLoading(false)
    }
  }, [filterKey])

  // Defer com setTimeout: refetch() começa com setLoading(true), e setState
  // síncrono no corpo do efeito é barrado pela regra react-hooks/set-state-in-effect.
  // Mesmo padrão do useAuth. (useAppointments ainda viola isso — dívida antiga.)
  useEffect(() => {
    const t = setTimeout(() => { refetch() }, 0)
    return () => clearTimeout(t)
  }, [refetch])

  // Espelho do refetch atual. O efeito do Realtime depende só de accountId — sem
  // isto, trocar um filtro derrubaria e reabriria o canal (e o callback do canal
  // ficaria preso na versão antiga dos filtros).
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])

  // ---- 2) FICA DE OLHO (Realtime, com contingência) ------------------------
  useEffect(() => {
    if (!accountId) return

    let cancelled = false
    let channel: RealtimeChannel | null = null
    let pollId: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (cancelled || pollId) return
      setRealtime('polling')
      pollId = setInterval(() => { refetchRef.current() }, POLL_INTERVAL_MS)
    }

    const start = async () => {
      let rtToken: string
      try {
        // O token do Realtime é emitido pelo backend a partir do nosso JWT. Se
        // SUPABASE_JWT_SECRET não estiver setado, a rota responde 503 e caímos
        // direto para polling.
        const res = await api.get<{ token: string }>('/api/realtime/token')
        rtToken = res.token
      } catch {
        startPolling()
        return
      }
      if (cancelled) return

      try {
        // Troca o contexto do websocket da chave anon (que não vê nada, por
        // causa do deny-all) para o token com o claim account_id.
        await supabase.realtime.setAuth(rtToken)
        if (cancelled) return

        channel = supabase
          .channel(`panel-cards:${accountId}`)
          .on(
            'postgres_changes',
            {
              event:  '*',              // INSERT | UPDATE | DELETE
              schema: 'public',
              table:  'helena_cards',
              // ⚠️ OBRIGATÓRIO: sem este filtro a tela de uma clínica receberia
              // aviso de mudança de outra clínica (a policy protege a LEITURA,
              // mas o filtro é o que evita ruído/refetch alheio).
              filter: `account_id=eq.${accountId}`,
            },
            () => { refetchRef.current() }, // revalida: busca de novo
          )
          .subscribe(status => {
            if (cancelled) return
            if (status === 'SUBSCRIBED') { setRealtime('live'); return }
            // CHANNEL_ERROR / TIMED_OUT / CLOSED sem ser desmontagem → contingência
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling()
          })
      } catch {
        startPolling()
      }
    }

    // Defer: nunca setState síncrono no corpo do efeito
    // (regra react-hooks/set-state-in-effect; padrão do useAuth/AgendaShell).
    const t = setTimeout(start, 0)

    return () => {
      cancelled = true
      clearTimeout(t)
      if (pollId) clearInterval(pollId)
      if (channel) supabase.removeChannel(channel)
    }
  }, [accountId])

  return {
    panel:  data?.panel  ?? null,
    steps:  data?.steps  ?? [],
    tags:   data?.tags   ?? [],
    cards:  data?.cards  ?? [],
    total:  data?.total  ?? 0,
    truncated:        data?.truncated ?? false,
    cardsWithoutStep: data?.cards_without_step ?? 0,
    loading,
    error,
    realtime,
    lastFetchMs,
    refetch,
  }
}
