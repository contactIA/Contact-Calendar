'use client'

import { useState, useEffect } from 'react'
import type { ProcedimentoJson } from '@/api/v1/esquemas'
import { api } from '@/componentes/cliente/api'
import { paraProcedure } from './daApi'
import type { Procedure } from './tiposDaTela'
export type { Procedure } from './tiposDaTela'

/** Os procedimentos ativos. */
export function useProcedures() {
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ procedimentos: ProcedimentoJson[] }>('/procedimentos')
      .then(({ procedimentos }) => setProcedures(procedimentos.filter((p) => p.ativo).map(paraProcedure)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { procedures, loading }
}
