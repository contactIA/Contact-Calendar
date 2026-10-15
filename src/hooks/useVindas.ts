'use client'

import { useState, useEffect, useCallback } from 'react'
import type { VindaJson } from '@/api/v1/esquemas'
import { api } from '@/componentes/cliente/api'

/** De quanto em quanto tempo a lista confere se o CRM marcou algo novo. */
const INTERVALO_MS = 60_000

/**
 * As consultas que o CRM marcou fora da agenda e esperam a recepção (fase 7b).
 * Só para quem cuida da agenda; para os outros, a lista fica vazia.
 */
export function useVindas(ativo: boolean) {
  const [vindas, setVindas] = useState<VindaJson[]>([])

  const recarregar = useCallback(() => {
    if (!ativo) return
    api
      .get<{ vindas: VindaJson[] }>('/vindas')
      .then((r) => setVindas(r.vindas))
      .catch(() => {})
  }, [ativo])

  useEffect(() => {
    recarregar()
    if (!ativo) return
    const id = window.setInterval(recarregar, INTERVALO_MS)
    return () => window.clearInterval(id)
  }, [ativo, recarregar])

  return { vindas, recarregar }
}
