'use client'

import { useState, useEffect } from 'react'
import type { ProfissionalJson } from '@/api/v1/esquemas'
import { api } from '@/componentes/cliente/api'
import { useEu } from '@/componentes/casca'
import { paraDentist } from './daApi'
import type { Dentist } from './tiposDaTela'
export type { Dentist } from './tiposDaTela'

/**
 * Os profissionais ativos. O dentista que não é gestor nem recepção vê só a
 * agenda dele: a API já devolve só as consultas dele, e a coluna dos outros sai.
 */
export function useDentists() {
  const eu = useEu()
  const [dentists, setDentists] = useState<Dentist[]>([])
  const [loading, setLoading] = useState(true)
  const { gestor, recepcao } = eu.usuario.papeis
  const so = gestor || recepcao ? null : eu.usuario.profissionalId

  useEffect(() => {
    api
      .get<{ profissionais: ProfissionalJson[] }>('/profissionais')
      .then(({ profissionais }) => setDentists(profissionais.filter((p) => p.ativo && (so === null || p.id === so)).map(paraDentist)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [so])

  return { dentists, loading }
}
