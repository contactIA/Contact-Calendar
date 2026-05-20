'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'

export type Dentist = {
  id: string
  color: string
  cro: string | null
  specialty: string[]
  user: { id: string; name: string; email: string | null } | null
}

export function useDentists() {
  const [dentists, setDentists] = useState<Dentist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists')
      .then(setDentists)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { dentists, loading }
}
