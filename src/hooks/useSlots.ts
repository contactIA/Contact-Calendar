'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'

export type Slot = {
  start_at: string
  end_at: string
  chair_id: string
  chair_name: string
}

export function useSlots(params: {
  dentist_id: string
  unit_id: string
  procedure_id: string
  date: string
} | null) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!params) { setSlots([]); return }
    setLoading(true)
    const q = new URLSearchParams(params as Record<string, string>)
    api
      .get<Slot[]>(`/api/slots/available?${q}`)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [params?.dentist_id, params?.unit_id, params?.procedure_id, params?.date])

  return { slots, loading }
}
