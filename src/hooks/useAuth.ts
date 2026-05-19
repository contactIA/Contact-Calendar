'use client'

import { useState, useEffect } from 'react'
import { api, setToken, getToken } from '@/lib/client'

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

    // If token already in session, skip re-auth
    if (getToken()) {
      setAuth({ status: 'ready', role: '', accountId })
      return
    }

    api
      .post<{ token: string; user: { role: string } }>('/api/auth/url', { accountId, userId })
      .then(res => {
        setToken(res.token)
        setAuth({ status: 'ready', role: res.user.role, accountId })
      })
      .catch(e => setAuth({ status: 'error', message: e.message }))
  }, [accountId, userId])

  return auth
}
