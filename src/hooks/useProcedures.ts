'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'

export type Procedure = {
  id: string
  name: string
  duration_minutes: number
  color: string | null
  required_specialty: string[] | null
}

export function useProcedures() {
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Procedure[]>('/api/procedures')
      .then(setProcedures)
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  return { procedures, loading }
}
