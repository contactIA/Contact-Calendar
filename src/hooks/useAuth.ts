'use client'

import { useState, useEffect } from 'react'
import { api, setToken, getToken, clearToken } from '@/lib/client'

type AuthState =
  | { status: 'loading' }
  | { status: 'ready'; role: string; accountId: string }
  | { status: 'error'; message: string }

function readRole(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    return payload.role ?? ''
  } catch { return '' }
}

function isFresh(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    return Boolean(payload.exp && payload.exp > Math.floor(Date.now() / 1000) + 60)
  } catch { return false }
}

// Fluxo de autenticação white-label (ver FIND-001 / api/auth/url):
//   1) Se o sistema-pai passou ?token= na URL (ele autenticou server-side com o
//      WHITELABEL_AUTH_SECRET), usamos esse token direto — é o caminho correto
//      de produção. O navegador NUNCA chama /auth/url (não teria o secret).
//   2) Token já guardado e válido → reusa.
//   3) Fallback dev: chama /auth/url sem secret — só funciona em ambientes onde
//      WHITELABEL_AUTH_SECRET não está definido (dev local). Em produção esse
//      fallback retorna 503/401 e o acesso exige o token da URL (passo 1).
export function useAuth(accountId: string, userId: string | null, urlToken?: string | null) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    // Defer com setTimeout — nunca setState síncrono no corpo do effect
    // (regra react-hooks/set-state-in-effect; padrão do AgendaShell/TagLinkTable).
    const t = setTimeout(async () => {
      // 1) Token vindo do sistema-pai via URL (fluxo white-label).
      if (urlToken) {
        setToken(urlToken)
        if (!cancelled) setAuth({ status: 'ready', role: readRole(urlToken), accountId })
        return
      }

      // 2) Token guardado ainda válido.
      const existing = getToken()
      if (existing && isFresh(existing)) {
        if (!cancelled) setAuth({ status: 'ready', role: readRole(existing), accountId })
        return
      }
      if (existing) clearToken()

      // 3) Fallback (dev): tenta o /auth/url. Em produção isto falha por design
      //    (endpoint exige o secret que o navegador não tem) — use ?token=.
      if (!userId) {
        if (!cancelled) setAuth({ status: 'error', message: 'Sessão não fornecida. Acesse pelo sistema integrador.' })
        return
      }
      try {
        const res = await api.post<{ token: string; role: string }>('/api/auth/url', { accountId, userId })
        setToken(res.token)
        if (!cancelled) setAuth({ status: 'ready', role: res.role, accountId })
      } catch {
        if (!cancelled) setAuth({
          status: 'error',
          message: 'Não foi possível autenticar. Acesse o sistema pelo integrador (white label).',
        })
      }
    }, 0)

    return () => { cancelled = true; clearTimeout(t) }
  }, [accountId, userId, urlToken])

  return auth
}
