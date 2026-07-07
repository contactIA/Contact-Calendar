'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'

export type Unit = {
  id: string
  name: string
  address: string | null
  phone: string | null
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Unit[]>('/api/units')
      .then(setUnits)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { units, loading }
}
