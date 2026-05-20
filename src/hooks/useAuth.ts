'use client'

import { useState, useEffect } from 'react'
import { api, setToken, getToken, clearToken } from '@/lib/client'

type AuthState =
  | { status: 'loading' }
  | { status: 'ready'; role: string; accountId: string }
  | { status: 'error'; message: string }

export function useAuth(accountId: string, userId: string | null) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    if (!userId) {
      setAuth({ status: 'error', message: 'userId não informado na URL' })
      return
    }

    // Reuse token only if it's still valid (exp > now + 60s buffer)
    const existing = getToken()
    if (existing) {
      try {
        const payload = JSON.parse(atob(existing.split('.')[1]))
        if (payload.exp && payload.exp > Math.floor(Date.now() / 1000) + 60) {
          setAuth({ status: 'ready', role: payload.role ?? '', accountId })
          return
        }
      } catch {}
      clearToken()
    }

    api
      .post<{ token: string; role: string }>('/api/auth/url', { accountId, userId })
      .then(res => {
        setToken(res.token)
        setAuth({ status: 'ready', role: res.role, accountId })
      })
      .catch(e => setAuth({ status: 'error', message: e.message }))
  }, [accountId, userId])

  return auth
}
