'use client'

import { useState, useEffect } from 'react'
import type { UnidadeJson } from '@/api/v1/esquemas'
import { api } from '@/componentes/cliente/api'
import { paraUnit } from './daApi'
import type { Unit } from './tiposDaTela'
export type { Unit } from './tiposDaTela'

/** As unidades ativas, para os filtros e o agendamento. */
export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ unidades: UnidadeJson[] }>('/unidades')
      .then(({ unidades }) => setUnits(unidades.filter((u) => u.ativa).map(paraUnit)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { units, loading }
}
