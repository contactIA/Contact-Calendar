'use client'

import { useState, useEffect } from 'react'

export function useAnimatedMount(open: boolean, duration = 200) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
    } else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => {
        setMounted(false)
        setClosing(false)
      }, duration)
      return () => clearTimeout(t)
    }
  }, [open])

  return { mounted, closing }
}
